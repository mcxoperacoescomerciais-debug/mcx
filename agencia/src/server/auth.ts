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
  /** Equipe MCX: entra em qualquer agência pelo seletor do painel. */
  platform: boolean;
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
  /** URL do logo da agência (null = sem logo). */
  agencyLogoUrl: string | null;
  /** Usuário da equipe MCX atuando dentro da agência. */
  platform: boolean;
}

/** Agência que o usuário da equipe MCX escolheu no seletor do painel. */
export const ACTIVE_AGENCY_COOKIE = "campo_agencia";

export function agencyLogoUrl(agency: { id: string; logo: string | null; updatedAt: Date }): string | null {
  return agency.logo ? `/api/logo/${agency.id}?v=${agency.updatedAt.getTime()}` : null;
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
      platform: s.users.platform,
      agencyStatus: s.agencies.status,
      sessionVersion: s.users.sessionVersion,
      mustChangePassword: s.users.mustChangePassword,
    })
    .from(s.users)
    .innerJoin(s.agencies, eq(s.agencies.id, s.users.agencyId))
    .where(eq(s.users.id, payload.uid));
  if (!user || user.status !== "active" || user.sessionVersion !== payload.sv) return null;
  // Agência suspensa derruba quem já estava logado (a equipe MCX não é afetada).
  if (!user.platform && user.agencyStatus !== "active") return null;
  return {
    id: user.id,
    agencyId: user.agencyId,
    role: user.role,
    platform: user.platform,
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

export async function requirePlatform(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.platform) redirect(homeForRole(user.role));
  return user;
}

/**
 * Agência em que o usuário atua: a própria ou, para a equipe MCX, a escolhida
 * no seletor (null = nenhuma escolhida ainda → visão MCX).
 */
export async function activeAgencyId(user: Pick<SessionUser, "agencyId" | "platform">): Promise<string | null> {
  if (!user.platform) return user.agencyId;
  const id = (await cookies()).get(ACTIVE_AGENCY_COOKIE)?.value;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select({ id: s.agencies.id }).from(s.agencies).where(and(eq(s.agencies.id, id), eq(s.agencies.kind, "client")));
  return row?.id ?? null;
}

/**
 * Monta o escopo a partir do usuário (usado por páginas, rotas e testes).
 * `agencyId` só pode diferir da agência do usuário para a equipe MCX.
 */
export async function scopeForUser(
  user: Pick<SessionUser, "id" | "agencyId" | "role"> & { platform?: boolean },
  agencyId: string = user.agencyId,
): Promise<Scope> {
  const db = await getDb();
  const platform = Boolean(user.platform);
  if (agencyId !== user.agencyId && !platform) throw new Error("Agência fora do escopo do usuário.");
  const [[u], [agency]] = await Promise.all([
    db.select({ allBrands: s.users.allBrands, teamOnly: s.users.teamOnly }).from(s.users).where(eq(s.users.id, user.id)),
    db.select().from(s.agencies).where(eq(s.agencies.id, agencyId)),
  ]);
  if (!u || !agency) throw new Error("Usuário não encontrado.");
  const row = { ...u, settings: agency.settings, agencyName: agency.name };

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
        .where(and(eq(s.users.agencyId, agencyId), eq(s.users.managerId, user.id), eq(s.users.role, "promoter")));
      promoterIds = rows.map((r) => r.id);
    }
  }
  return {
    agencyId,
    userId: user.id,
    role: user.role,
    promoterId: user.role === "promoter" ? user.id : null,
    brandIds,
    promoterIds,
    settings: mergeSettings(row.settings),
    agencyName: row.agencyName,
    agencyLogoUrl: agencyLogoUrl(agency),
    platform,
  };
}

/** Escopo da página. Equipe MCX sem agência escolhida vai para a visão MCX. */
export const getScope = cache(async (): Promise<Scope> => {
  const user = await requireUser();
  const agencyId = await activeAgencyId(user);
  if (!agencyId) redirect("/painel/mcx");
  return scopeForUser(user, agencyId);
});

/** Para rotas de API: null em vez de redirecionar (o app trata 401/403). */
export async function getApiScope(roles?: Role[]): Promise<Scope | null> {
  const user = await getSessionUser();
  if (!user || (roles && !roles.includes(user.role))) return null;
  const agencyId = await activeAgencyId(user);
  return agencyId ? scopeForUser(user, agencyId) : null;
}

export function unauthorized(): Response {
  return Response.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
}

export function forbidden(message = "Sem permissão para este registro."): Response {
  return Response.json({ error: message }, { status: 403 });
}

export type LoginResult = { ok: true; role: Role; platform: boolean } | { ok: false; error: string };

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
  if (!user.platform) {
    const [agency] = await db.select({ status: s.agencies.status }).from(s.agencies).where(eq(s.agencies.id, user.agencyId));
    if (agency?.status !== "active") {
      await bcrypt.compare(password, DUMMY_HASH);
      return { ok: false, error: "O acesso desta agência está suspenso. Fale com a MCX." };
    }
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
  // Equipe MCX começa sempre pela visão geral, sem agência escolhida.
  if (user.platform) (await cookies()).delete(ACTIVE_AGENCY_COOKIE);
  await audit({ agencyId: user.agencyId, userId: user.id }, "user", user.id, "login");
  return { ok: true, role: user.role, platform: user.platform };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(ACTIVE_AGENCY_COOKIE);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Escopo "da agência inteira", sem usuário logado — só para leituras do
 * próprio sistema (ex.: o link do PDF enviado no alerta de WhatsApp).
 */
export async function agencySystemScope(agencyId: string): Promise<Scope | null> {
  const db = await getDb();
  const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
  if (!agency) return null;
  return {
    agencyId,
    userId: "00000000-0000-0000-0000-000000000000",
    role: "admin",
    promoterId: null,
    brandIds: null,
    promoterIds: null,
    settings: mergeSettings(agency.settings),
    agencyName: agency.name,
    agencyLogoUrl: agencyLogoUrl(agency),
    platform: false,
  };
}
