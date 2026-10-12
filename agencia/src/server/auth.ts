/**
 * Autenticação, sessão e escopo de acesso.
 *
 * Autorização em 3 camadas:
 *   1. proxy.ts — redirecionamento rápido por perfil (só lê o cookie);
 *   2. requireRole()/getApiScope() — validação completa em cada página/rota
 *      (usuário existe, está ativo, sessão não revogada);
 *   3. Scope — TODA consulta operacional filtra por agência e, conforme o
 *      perfil, por promotor (o próprio) e/ou marcas/equipe do gestor.
 * Nada depende de esconder botões no navegador.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, homeForRole } from "@/lib/session-token";
import type { Role } from "@/lib/domain";
import { mergeSettings, type AgencySettings } from "@/lib/settings";
import { audit } from "./audit";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
/** Comparar contra um hash descartável quando o usuário não existe mantém o tempo de resposta igual. */
const DUMMY_HASH = bcrypt.hashSync("usuario-inexistente", 10);

export interface SessionUser {
  id: string;
  agencyId: string;
  role: Role;
  name: string;
  username: string;
  mustChangePassword: boolean;
}

export interface Scope {
  agencyId: string;
  userId: string;
  role: Role;
  /** Promotor: o próprio id (só enxerga os próprios registros). */
  promoterId: string | null;
  /** Marcas visíveis; null = todas da agência. */
  brandIds: string[] | null;
  /** Promotores visíveis (gestor com "só minha equipe"); null = todos. */
  promoterIds: string[] | null;
  settings: AgencySettings;
  agencyName: string;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  const db = await getDb();
  const [user] = await db
    .select({
      id: s.users.id,
      agencyId: s.users.agencyId,
      role: s.users.role,
      name: s.users.name,
      username: s.users.username,
      status: s.users.status,
      sessionVersion: s.users.sessionVersion,
      mustChangePassword: s.users.mustChangePassword,
    })
    .from(s.users)
    .where(eq(s.users.id, payload.uid));
  if (!user || user.status !== "active" || user.sessionVersion !== payload.sv) return null;
  return {
    id: user.id,
    agencyId: user.agencyId,
    role: user.role,
    name: user.name,
    username: user.username,
    mustChangePassword: user.mustChangePassword,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sair");
  return user;
}

export const STAFF: Role[] = ["admin", "manager"];

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

/** Monta o escopo a partir do usuário (usado por páginas, rotas e testes). */
export async function scopeForUser(user: Pick<SessionUser, "id" | "agencyId" | "role">): Promise<Scope> {
  const db = await getDb();
  const [row] = await db
    .select({ allBrands: s.users.allBrands, teamOnly: s.users.teamOnly, settings: s.agencies.settings, agencyName: s.agencies.name })
    .from(s.users)
    .innerJoin(s.agencies, eq(s.agencies.id, s.users.agencyId))
    .where(eq(s.users.id, user.id));
  if (!row) throw new Error("Usuário não encontrado.");

  let brandIds: string[] | null = null;
  let promoterIds: string[] | null = null;
  if (user.role === "promoter") {
    const rows = await db.select({ id: s.userBrands.brandId }).from(s.userBrands).where(eq(s.userBrands.userId, user.id));
    brandIds = rows.map((r) => r.id);
    promoterIds = [user.id];
  } else if (user.role === "manager") {
    if (!row.allBrands) {
      const rows = await db.select({ id: s.userBrands.brandId }).from(s.userBrands).where(eq(s.userBrands.userId, user.id));
      brandIds = rows.map((r) => r.id);
    }
    if (row.teamOnly) {
      const rows = await db
        .select({ id: s.users.id })
        .from(s.users)
        .where(and(eq(s.users.agencyId, user.agencyId), eq(s.users.managerId, user.id), eq(s.users.role, "promoter")));
      promoterIds = rows.map((r) => r.id);
    }
  }
  return {
    agencyId: user.agencyId,
    userId: user.id,
    role: user.role,
    promoterId: user.role === "promoter" ? user.id : null,
    brandIds,
    promoterIds,
    settings: mergeSettings(row.settings),
    agencyName: row.agencyName,
  };
}

export const getScope = cache(async (): Promise<Scope> => scopeForUser(await requireUser()));

/** Para rotas de API: null em vez de redirecionar (o app trata 401/403). */
export async function getApiScope(roles?: Role[]): Promise<Scope | null> {
  const user = await getSessionUser();
  if (!user || (roles && !roles.includes(user.role))) return null;
  return scopeForUser(user);
}

export function unauthorized(): Response {
  return Response.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
}

export function forbidden(message = "Sem permissão para este registro."): Response {
  return Response.json({ error: message }, { status: 403 });
}

export type LoginResult = { ok: true; role: Role } | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(s.users)
    .where(sql`lower(${s.users.username}) = ${username.trim().toLowerCase()}`);
  const generic = { ok: false as const, error: "Usuário ou senha incorretos." };
  if (!user || user.status !== "active") {
    await bcrypt.compare(password, DUMMY_HASH);
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Acesso bloqueado por tentativas incorretas. Tente novamente em alguns minutos." };
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db
      .update(s.users)
      .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(s.users.id, user.id));
    if (lock) await audit({ agencyId: user.agencyId, userId: user.id }, "user", user.id, "login_locked");
    return generic;
  }
  await db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  const token = await signSession({ uid: user.id, aid: user.agencyId, role: user.role, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  await audit({ agencyId: user.agencyId, userId: user.id }, "user", user.id, "login");
  return { ok: true, role: user.role };
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
