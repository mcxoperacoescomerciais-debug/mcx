/**
 * Equipe MCX: o Dono cadastra os membros Master (acesso a todas as agências,
 * sem cadastrar a equipe). Senha inicial definida pelo Dono; troca no 1º acesso.
 */
import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { hashPassword, type SessionUser } from "./auth";
import { audit } from "./audit";

type Result = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export async function listPlatformTeam(user: SessionUser) {
  if (user.platformRole !== "owner") return [];
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name, username: s.users.username, platformRole: s.users.platformRole, status: s.users.status, lastLoginAt: s.users.lastLoginAt })
    .from(s.users)
    .where(eq(s.users.platform, true))
    .orderBy(asc(s.users.name));
}

export async function createMaster(user: SessionUser, i: { name: string; username: string; password: string }): Promise<Result> {
  if (user.platformRole !== "owner") return fail("Somente o Dono cadastra a equipe MCX.");
  const username = i.username.trim().toLowerCase();
  if (i.name.trim().length < 3) return fail("Informe o nome completo.");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return fail("Usuário: 3 a 40 caracteres (letras, números, ponto, hífen).");
  if (!i.password) return fail("Defina a senha inicial.");
  const db = await getDb();
  const [taken] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
  if (taken) return fail(`O usuário “${username}” já existe.`);
  const [platform] = await db.select({ id: s.agencies.id }).from(s.agencies).where(eq(s.agencies.kind, "platform"));
  if (!platform) return fail("Plataforma não encontrada.");
  const [row] = await db
    .insert(s.users)
    .values({ agencyId: platform.id, role: "admin", platform: true, platformRole: "master", name: i.name.trim(), username, passwordHash: await hashPassword(i.password), mustChangePassword: true, createdBy: user.id })
    .returning({ id: s.users.id });
  await audit({ agencyId: platform.id, userId: user.id }, "user", row.id, "created", { after: { platformRole: "master", username } });
  return { ok: true, message: "Membro Master cadastrado.", id: row.id };
}

export async function setMasterStatus(user: SessionUser, id: string, status: "active" | "inactive"): Promise<Result> {
  if (user.platformRole !== "owner") return fail("Somente o Dono altera a equipe MCX.");
  if (id === user.id) return fail("Você não pode desativar o próprio acesso.");
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.platform, true)));
  if (!u) return fail("Membro não encontrado.");
  if (u.platformRole === "owner") return fail("O Dono não pode ser desativado por aqui.");
  await db
    .update(s.users)
    .set({ status, updatedAt: new Date(), ...(status === "inactive" ? { sessionVersion: u.sessionVersion + 1, deactivatedAt: new Date() } : { deactivatedAt: null }) })
    .where(eq(s.users.id, id));
  await audit({ agencyId: u.agencyId, userId: user.id }, "user", id, status === "inactive" ? "deactivated" : "reactivated");
  return { ok: true, message: status === "inactive" ? "Acesso desativado." : "Acesso reativado." };
}
