/**
 * Autenticação e contexto de acesso.
 *
 * `getSessionUser()` é a validação completa (usa o banco): confere se o usuário
 * existe, está ativo e se a sessão não foi revogada (session_version).
 * `requireUser()` / `requireRole()` são o que páginas e rotas chamam.
 * `getScope()` devolve o escopo de dados que TODA consulta operacional usa.
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
import { audit } from "./audit";

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
/** Hash descartável: comparar contra ele quando o usuário não existe mantém o tempo de resposta igual. */
const DUMMY_HASH = bcrypt.hashSync("usuario-inexistente", 10);

export interface SessionUser {
  id: string;
  tenantId: string;
  role: Role;
  name: string;
  username: string;
}

export interface Scope {
  tenantId: string;
  clientId: string;
  userId: string;
  role: Role;
  /** Preenchido só para promotor: restringe aos próprios registros. */
  promoterId: string | null;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload) return null;
  const db = await getDb();
  const [user] = await db
    .select({
      id: s.users.id,
      tenantId: s.users.tenantId,
      role: s.users.role,
      name: s.users.name,
      username: s.users.username,
      status: s.users.status,
      sessionVersion: s.users.sessionVersion,
    })
    .from(s.users)
    .where(eq(s.users.id, payload.uid));
  if (!user || user.status !== "active" || user.sessionVersion !== payload.sv) return null;
  return { id: user.id, tenantId: user.tenantId, role: user.role, name: user.name, username: user.username };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sair");
  return user;
}

export const MANAGER_ROLES: Role[] = ["admin", "agency_manager", "client_manager"];
export const STAFF_ROLES: Role[] = ["admin", "agency_manager"];

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

/**
 * Escopo de dados do usuário logado. Hoje cada usuário opera uma marca
 * (SUINCO); quando houver mais de uma, o cliente ativo virá de um seletor
 * no topo do painel (cookie `mcx_client`), sem mudar nenhuma consulta.
 */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await requireUser();
  const db = await getDb();
  const preferred = (await cookies()).get("mcx_client")?.value;
  const rows = await db
    .select({ clientId: s.userClients.clientId })
    .from(s.userClients)
    .innerJoin(s.clients, eq(s.clients.id, s.userClients.clientId))
    .where(and(eq(s.userClients.userId, user.id), eq(s.clients.tenantId, user.tenantId)));
  const clientId = rows.find((r) => r.clientId === preferred)?.clientId ?? rows[0]?.clientId;
  if (!clientId) throw new Error("Usuário sem cliente vinculado.");
  return {
    tenantId: user.tenantId,
    clientId,
    userId: user.id,
    role: user.role,
    promoterId: user.role === "promoter" ? user.id : null,
  };
});

/** Versão para rotas de API: devolve null em vez de redirecionar (o app trata 401). */
export async function getApiScope(roles?: Role[]): Promise<Scope | null> {
  const user = await getSessionUser();
  if (!user || (roles && !roles.includes(user.role))) return null;
  return getScope();
}

export function unauthorized(): Response {
  return Response.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
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
    // Mantém o tempo de resposta parecido para não revelar quais usuários existem.
    await bcrypt.compare(password, DUMMY_HASH);
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Acesso bloqueado por tentativas incorretas. Tente novamente em alguns minutos." };
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db
      .update(s.users)
      .set({
        failedLogins: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(s.users.id, user.id));
    return generic;
  }
  await db
    .update(s.users)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(s.users.id, user.id));
  const token = await signSession({ uid: user.id, tid: user.tenantId, role: user.role, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  await audit({ tenantId: user.tenantId, userId: user.id }, "user", user.id, "login");
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
