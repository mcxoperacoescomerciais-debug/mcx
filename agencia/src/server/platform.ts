/**
 * Camada MCX (plataforma): agências clientes, visão consolidada e identidade
 * visual de cada agência. Só a equipe MCX (`users.platform`) chega aqui; as
 * agências continuam isoladas entre si — a visão macro só soma números,
 * calculados agência por agência com o mesmo motor do painel do dia.
 */
import "server-only";
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { agencyLogoUrl, hashPassword, scopeForUser, type Scope, type SessionUser } from "./auth";
import { audit } from "./audit";
import { getDayBoard, type DayBoard } from "./operations";
import { listIssues } from "./issues";
import { RUPTURE_FINAL_STATUSES } from "@/lib/domain";

export type PlatformResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const fail = (error: string): PlatformResult => ({ ok: false, error });

export interface AgencyRow {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  logoUrl: string | null;
  createdAt: Date;
  users: { admin: number; manager: number; promoter: number };
  brands: number;
  stores: number;
}

/** Agências clientes (a agência interna da MCX não aparece). */
export async function listAgencies(): Promise<AgencyRow[]> {
  const db = await getDb();
  const agencies = await db.select().from(s.agencies).where(eq(s.agencies.kind, "client")).orderBy(asc(s.agencies.name));
  if (!agencies.length) return [];
  const ids = agencies.map((a) => a.id);
  const [users, brands, stores] = await Promise.all([
    db
      .select({ agencyId: s.users.agencyId, role: s.users.role, n: sql<number>`count(*)::int` })
      .from(s.users)
      .where(and(inArray(s.users.agencyId, ids), eq(s.users.status, "active"), eq(s.users.platform, false)))
      .groupBy(s.users.agencyId, s.users.role),
    db.select({ agencyId: s.brands.agencyId, n: sql<number>`count(*)::int` }).from(s.brands).where(and(inArray(s.brands.agencyId, ids), eq(s.brands.status, "active"))).groupBy(s.brands.agencyId),
    db.select({ agencyId: s.stores.agencyId, n: sql<number>`count(*)::int` }).from(s.stores).where(and(inArray(s.stores.agencyId, ids), eq(s.stores.status, "active"))).groupBy(s.stores.agencyId),
  ]);
  return agencies.map((a) => {
    const count = (role: string) => users.find((u) => u.agencyId === a.id && u.role === role)?.n ?? 0;
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      status: a.status,
      logoUrl: agencyLogoUrl(a),
      createdAt: a.createdAt,
      users: { admin: count("admin"), manager: count("manager"), promoter: count("promoter") },
      brands: brands.find((b) => b.agencyId === a.id)?.n ?? 0,
      stores: stores.find((b) => b.agencyId === a.id)?.n ?? 0,
    };
  });
}

export async function getClientAgency(id: string) {
  const db = await getDb();
  const [a] = await db.select().from(s.agencies).where(and(eq(s.agencies.id, id), eq(s.agencies.kind, "client")));
  return a ?? null;
}

// ───────────────────────────── Visão macro ─────────────────────────────

export interface MacroRow {
  agency: AgencyRow;
  kpis: DayBoard["kpis"];
  openIssues: number;
  openRuptures: number;
  lastSyncAt: Date | null;
}

/**
 * Indicadores do dia por agência. Cada agência é calculada com um escopo de
 * administrador DELA (mesmas regras do painel do dia), nunca com consultas
 * que cruzem agências.
 */
export async function macroOverview(user: SessionUser, date: string): Promise<MacroRow[]> {
  const agencies = await listAgencies();
  const db = await getDb();
  return Promise.all(
    agencies.map(async (agency) => {
      const scope: Scope = await scopeForUser(user, agency.id);
      const f = { date, brand: null, chain: null, store: null, promoter: null, city: null, status: null, kind: null, q: "", page: 1, from: date, to: date };
      const [board, issues, [rup]] = await Promise.all([
        getDayBoard(scope, f),
        listIssues(scope, f),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(s.ruptures)
          .where(and(eq(s.ruptures.agencyId, agency.id), isNull(s.ruptures.deletedAt), notInArray(s.ruptures.status, RUPTURE_FINAL_STATUSES))),
      ]);
      return { agency, kpis: board.kpis, openIssues: issues.length, openRuptures: rup?.n ?? 0, lastSyncAt: board.lastSyncAt };
    }),
  );
}

// ───────────────────────────── Cadastro de agências ─────────────────────────────

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "agencia";

export interface NewAgencyInput {
  name: string;
  adminName: string;
  adminUsername: string;
  adminPassword: string;
}

/** Cria a agência e o primeiro administrador dela (troca de senha no 1º acesso). */
export async function createAgency(user: SessionUser, i: NewAgencyInput): Promise<PlatformResult> {
  if (!user.platform) return fail("Somente a equipe MCX.");
  const name = i.name.trim();
  const username = i.adminUsername.trim().toLowerCase();
  if (name.length < 2) return fail("Informe o nome da agência.");
  if (i.adminName.trim().length < 2) return fail("Informe o nome do administrador da agência.");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return fail("Usuário do administrador: 3 a 40 caracteres (letras, números, ponto, hífen).");
  if (i.adminPassword.length < 8) return fail("Senha inicial do administrador: ao menos 8 caracteres.");
  const db = await getDb();
  const [taken] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
  if (taken) return fail(`O usuário “${username}” já existe. Escolha outro (ex.: ${slugify(name).split("-")[0]}.${username}).`);
  let slug = slugify(name);
  const [slugTaken] = await db.select({ id: s.agencies.id }).from(s.agencies).where(eq(s.agencies.slug, slug));
  if (slugTaken) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const passwordHash = await hashPassword(i.adminPassword);
  const id = await db.transaction(async (tx) => {
    const [agency] = await tx.insert(s.agencies).values({ name, slug, kind: "client" }).returning();
    const [admin] = await tx
      .insert(s.users)
      .values({ agencyId: agency.id, role: "admin", name: i.adminName.trim(), username, passwordHash, mustChangePassword: true, createdBy: user.id })
      .returning();
    await audit({ agencyId: agency.id, userId: user.id }, "agency", agency.id, "created", { after: { name, admin: username } }, tx);
    await audit({ agencyId: agency.id, userId: user.id }, "user", admin.id, "created", { after: { role: "admin", username } }, tx);
    return agency.id;
  });
  return { ok: true, message: "Agência criada.", id };
}

export async function updateAgency(user: SessionUser, id: string, i: { name: string; status: "active" | "suspended" }): Promise<PlatformResult> {
  if (!user.platform) return fail("Somente a equipe MCX.");
  const before = await getClientAgency(id);
  if (!before) return fail("Agência não encontrada.");
  const name = i.name.trim();
  if (name.length < 2) return fail("Informe o nome da agência.");
  const db = await getDb();
  await db.update(s.agencies).set({ name, status: i.status, updatedAt: new Date() }).where(eq(s.agencies.id, id));
  const changes: Record<string, unknown> = {};
  if (before.name !== name) changes.name = name;
  if (before.status !== i.status) changes.status = i.status;
  if (Object.keys(changes).length) {
    await audit({ agencyId: id, userId: user.id }, "agency", id, i.status !== before.status ? (i.status === "suspended" ? "suspended" : "reactivated") : "updated", {
      before: { name: before.name, status: before.status },
      after: changes,
    });
  }
  return { ok: true, message: i.status === "suspended" ? "Agência salva — acesso suspenso." : "Agência salva." };
}

export const LOGO_MAX_BYTES = 400 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

export async function setAgencyLogo(user: SessionUser, id: string, file: File | null): Promise<PlatformResult> {
  if (!user.platform) return fail("Somente a equipe MCX.");
  if (!(await getClientAgency(id))) return fail("Agência não encontrada.");
  let logo: string | null = null;
  if (file && file.size) {
    if (!LOGO_TYPES.includes(file.type)) return fail("Use uma imagem PNG, JPG ou WebP.");
    if (file.size > LOGO_MAX_BYTES) return fail("Logo muito grande (máx. 400 KB).");
    logo = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
  }
  const db = await getDb();
  await db.update(s.agencies).set({ logo, updatedAt: new Date() }).where(eq(s.agencies.id, id));
  await audit({ agencyId: id, userId: user.id }, "agency", id, logo ? "logo_updated" : "logo_removed");
  return { ok: true, message: logo ? "Logo atualizado." : "Logo removido." };
}

/** Logo como bytes para a rota /api/logo (quem pode ver é decidido na rota). */
export async function agencyLogo(id: string): Promise<{ type: string; bytes: Buffer } | null> {
  const db = await getDb();
  const [a] = await db.select({ logo: s.agencies.logo }).from(s.agencies).where(eq(s.agencies.id, id));
  const m = a?.logo?.match(/^data:([a-z/+-]+);base64,(.+)$/);
  return m ? { type: m[1], bytes: Buffer.from(m[2], "base64") } : null;
}
