/**
 * Autenticação do MCX Operações. Login, sessão e usuários próprios — nenhuma
 * conta de agência ou promotor do Campo existe aqui.
 *   1. proxy.ts — redirecionamento rápido (só lê o cookie);
 *   2. cada página chama requireUser()/requireCan(); cada action chama actionUser();
 *   3. cada função de servidor recebe o usuário e confere a permissão de novo.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Role } from "@/lib/domain";
import { can, type Action } from "@/lib/permissions";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "@/lib/session-token";
import { audit } from "./audit";
import { getDb, schema as s } from "./db";

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

const MAX_FAILED_LOGINS = 8;
const LOCK_MINUTES = 10;
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8rD2rT5uU0nq8pQ0yqk6m8e1v9y8sK";

/** Usuário de um token de sessão (null se inválido, de outro sistema, inativo ou revogado). */
export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  const payload = await verifySession(token);
  if (!payload) return null;
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, payload.uid));
  if (!user || user.status !== "active" || user.sessionVersion !== payload.sv) return null;
  return { id: user.id, name: user.name, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword };
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
});

/** Páginas: sem sessão → login; senha inicial → troca obrigatória. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sair");
  if (user.mustChangePassword) redirect("/senha");
  return user;
}

export async function requireCan(action: Action): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, action)) redirect("/");
  return user;
}

/** Server actions: devolve null em vez de redirecionar (a action responde com erro). */
export async function actionUser(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  return user && !user.mustChangePassword ? user : null;
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginResult> {
  const generic: LoginResult = { ok: false, error: "Usuário ou senha incorretos." };
  const name = username.trim().toLowerCase();
  if (!name || !password) return generic;
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.username, name));
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
    if (lock) await audit(user.id, "user", user.id, "login_locked");
    return generic;
  }
  await db.update(s.users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  await setSessionCookie({ id: user.id, role: user.role, sessionVersion: user.sessionVersion });
  await audit(user.id, "user", user.id, "login");
  return { ok: true };
}

async function setSessionCookie(user: { id: string; role: Role; sessionVersion: number }): Promise<void> {
  const token = await signSession({ uid: user.id, role: user.role, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export const MIN_PASSWORD = 8;

/** Troca da própria senha (obrigatória no primeiro acesso). Derruba as outras sessões. */
export async function changeOwnPassword(userId: string, current: string, next: string): Promise<LoginResult> {
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, userId));
  if (!user || user.status !== "active") return { ok: false, error: "Sessão expirada." };
  if (!(await bcrypt.compare(current, user.passwordHash))) return { ok: false, error: "A senha atual não confere." };
  if (next.length < MIN_PASSWORD) return { ok: false, error: `A senha nova precisa de pelo menos ${MIN_PASSWORD} caracteres.` };
  if (next.toLowerCase() === user.username || next === current) return { ok: false, error: "Escolha uma senha diferente da atual e do seu usuário." };
  const sessionVersion = user.sessionVersion + 1;
  await db.update(s.users).set({ passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion }).where(eq(s.users.id, user.id));
  await audit(user.id, "user", user.id, "password_changed");
  await setSessionCookie({ id: user.id, role: user.role, sessionVersion });
  return { ok: true };
}
