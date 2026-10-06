/**
 * Cadastros administrativos (usuários, redes, lojas, produtos, configurações).
 * Toda alteração passa pela auditoria. Nada é apagado: desativar = status
 * "inactive".
 */
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit, diffFields } from "./audit";
import { hashPassword } from "./auth";
import { mergeSettings, type ClientSettings } from "@/lib/settings";
import type { Role, StoreFormat } from "@/lib/domain";

export type Result = { ok: true; id?: string } | { ok: false; error: string };

const actorOf = (scope: Scope) => ({ tenantId: scope.tenantId, userId: scope.userId });

// ───────────────────────────── Configurações ─────────────────────────────

export async function saveSettings(scope: Scope, next: ClientSettings): Promise<Result> {
  const b = next.bands;
  if (!(b.critical >= 0 && b.critical < b.high && b.high < b.attention && b.attention < b.monitor)) {
    return { ok: false, error: "As faixas precisam ser crescentes: crítico < alto < atenção < monitoramento." };
  }
  if (next.storeThresholds.attention >= next.storeThresholds.critical) {
    return { ok: false, error: "O limite de 'Atenção' precisa ser menor que o de 'Crítica'." };
  }
  const db = await getDb();
  const [prev] = await db.select().from(s.clientSettings).where(eq(s.clientSettings.clientId, scope.clientId));
  const value = mergeSettings(next);
  await db
    .insert(s.clientSettings)
    .values({ clientId: scope.clientId, settings: value, createdBy: scope.userId, updatedBy: scope.userId })
    .onConflictDoUpdate({ target: s.clientSettings.clientId, set: { settings: value, updatedAt: new Date(), updatedBy: scope.userId } });
  await audit(actorOf(scope), "settings", scope.clientId, "update", (prev?.settings as Record<string, unknown>) ?? null, value as unknown as Record<string, unknown>);
  return { ok: true };
}

// ───────────────────────────── Usuários ─────────────────────────────

export interface UserInput {
  id?: string;
  name: string;
  username: string;
  role: Role;
  email?: string | null;
  phone?: string | null;
  document?: string | null;
  status: "active" | "inactive";
  password?: string | null;
  storeIds?: string[];
}

export async function saveUser(scope: Scope, input: UserInput): Promise<Result> {
  const db = await getDb();
  const username = input.username.trim().toLowerCase();
  if (!input.name.trim() || !/^[a-z0-9._-]{3,40}$/.test(username)) {
    return { ok: false, error: "Informe o nome e um usuário válido (letras minúsculas, números, ponto ou traço; 3 a 40 caracteres)." };
  }
  if (!input.id && (!input.password || input.password.length < 6)) return { ok: false, error: "Senha inicial com pelo menos 6 caracteres." };
  if (input.password && input.password.length < 6) return { ok: false, error: "A senha precisa ter pelo menos 6 caracteres." };
  const [dup] = await db
    .select({ id: s.users.id })
    .from(s.users)
    .where(sql`lower(${s.users.username}) = ${username}`);
  if (dup && dup.id !== input.id) return { ok: false, error: "Já existe um usuário com esse login." };

  const values = {
    name: input.name.trim(),
    username,
    role: input.role,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    document: input.document?.trim() || null,
    status: input.status,
  };
  let id = input.id;
  if (id) {
    const [prev] = await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.tenantId, scope.tenantId)));
    if (!prev) return { ok: false, error: "Usuário não encontrado." };
    const changes: Record<string, unknown> = { ...values, updatedAt: new Date(), updatedBy: scope.userId };
    // Senha nova ou desativação derrubam as sessões abertas do usuário.
    if (input.password || (prev.status === "active" && input.status === "inactive")) changes.sessionVersion = prev.sessionVersion + 1;
    if (input.password) changes.passwordHash = await hashPassword(input.password);
    await db.update(s.users).set(changes).where(eq(s.users.id, id));
    const d = diffFields(prev as unknown as Record<string, unknown>, values);
    if (d || input.password) await audit(actorOf(scope), "user", id, input.password ? "update+password" : "update", d?.before, d?.after);
  } else {
    const [row] = await db
      .insert(s.users)
      .values({ ...values, tenantId: scope.tenantId, passwordHash: await hashPassword(input.password!), createdBy: scope.userId })
      .returning({ id: s.users.id });
    id = row.id;
    await db.insert(s.userClients).values({ userId: id, clientId: scope.clientId }).onConflictDoNothing();
    await audit(actorOf(scope), "user", id, "create", null, values);
  }

  if (input.role === "promoter" && input.storeIds) {
    const clientStores = await db.select({ id: s.stores.id }).from(s.stores).where(eq(s.stores.clientId, scope.clientId));
    const allowed = new Set(clientStores.map((x) => x.id));
    const wanted = input.storeIds.filter((x) => allowed.has(x));
    if (clientStores.length) {
      await db.delete(s.storeAssignments).where(and(eq(s.storeAssignments.userId, id), inArray(s.storeAssignments.storeId, [...allowed])));
    }
    if (wanted.length) await db.insert(s.storeAssignments).values(wanted.map((storeId) => ({ userId: id!, storeId })));
  }
  return { ok: true, id };
}

// ───────────────────────────── Redes ─────────────────────────────

export async function saveNetwork(scope: Scope, input: { id?: string; name: string; status?: string }): Promise<Result> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Informe o nome da rede." };
  const db = await getDb();
  const [dup] = await db
    .select({ id: s.networks.id })
    .from(s.networks)
    .where(and(eq(s.networks.clientId, scope.clientId), sql`lower(${s.networks.name}) = ${name.toLowerCase()}`));
  if (dup && dup.id !== input.id) return { ok: false, error: "Já existe uma rede com esse nome." };
  if (input.id) {
    await db.update(s.networks).set({ name, status: input.status ?? "active", updatedAt: new Date(), updatedBy: scope.userId }).where(and(eq(s.networks.id, input.id), eq(s.networks.clientId, scope.clientId)));
    await audit(actorOf(scope), "network", input.id, "update", null, { name, status: input.status });
    return { ok: true, id: input.id };
  }
  const [row] = await db.insert(s.networks).values({ tenantId: scope.tenantId, clientId: scope.clientId, name, createdBy: scope.userId }).returning({ id: s.networks.id });
  await audit(actorOf(scope), "network", row.id, "create", null, { name });
  return { ok: true, id: row.id };
}

// ───────────────────────────── Lojas ─────────────────────────────

export interface StoreInput {
  id?: string;
  networkId: string;
  format: StoreFormat;
  name: string;
  code?: string | null;
  address?: string | null;
  city: string;
  state: string;
  lat?: number | null;
  lng?: number | null;
  managerName?: string | null;
  status: "active" | "inactive";
  promoterId?: string | null;
}

export async function saveStore(scope: Scope, input: StoreInput): Promise<Result> {
  if (!input.name.trim() || !input.city.trim() || !input.networkId) return { ok: false, error: "Rede, nome e cidade são obrigatórios." };
  const db = await getDb();
  const [net] = await db.select({ id: s.networks.id }).from(s.networks).where(and(eq(s.networks.id, input.networkId), eq(s.networks.clientId, scope.clientId)));
  if (!net) return { ok: false, error: "Rede inválida." };
  const values = {
    networkId: input.networkId,
    format: input.format,
    name: input.name.trim(),
    code: input.code?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city.trim(),
    state: (input.state || "MG").trim().toUpperCase().slice(0, 2),
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    managerName: input.managerName?.trim() || null,
    status: input.status,
  };
  let id = input.id;
  if (id) {
    const [prev] = await db.select().from(s.stores).where(and(eq(s.stores.id, id), eq(s.stores.clientId, scope.clientId)));
    if (!prev) return { ok: false, error: "Loja não encontrada." };
    await db.update(s.stores).set({ ...values, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.stores.id, id));
    const d = diffFields(prev as unknown as Record<string, unknown>, values);
    if (d) await audit(actorOf(scope), "store", id, "update", d.before, d.after);
  } else {
    const [row] = await db.insert(s.stores).values({ ...values, tenantId: scope.tenantId, clientId: scope.clientId, createdBy: scope.userId }).returning({ id: s.stores.id });
    id = row.id;
    await audit(actorOf(scope), "store", id, "create", null, values);
  }
  if (input.promoterId !== undefined) {
    const promoters = await db
      .select({ id: s.users.id })
      .from(s.users)
      .where(and(eq(s.users.tenantId, scope.tenantId), eq(s.users.role, "promoter")));
    const ids = promoters.map((p) => p.id);
    if (ids.length) await db.delete(s.storeAssignments).where(and(eq(s.storeAssignments.storeId, id), inArray(s.storeAssignments.userId, ids)));
    if (input.promoterId && ids.includes(input.promoterId)) await db.insert(s.storeAssignments).values({ userId: input.promoterId, storeId: id });
  }
  return { ok: true, id };
}

// ───────────────────────────── Produtos ─────────────────────────────

export interface ProductInput {
  id?: string;
  code?: string | null;
  name: string;
  category: string;
  brand?: string;
  presentation?: string | null;
  defaultUnit: string;
  aliases: string[];
  referencePrice?: number | null;
  status: "active" | "inactive";
}

export async function saveProduct(scope: Scope, input: ProductInput): Promise<Result> {
  if (!input.name.trim()) return { ok: false, error: "Informe o nome do produto." };
  const db = await getDb();
  const code = input.code?.trim() || null;
  if (code) {
    const [dup] = await db.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.clientId, scope.clientId), eq(s.products.code, code)));
    if (dup && dup.id !== input.id) return { ok: false, error: "Já existe um produto com esse código SUINCO." };
  }
  const values = {
    code,
    name: input.name.trim(),
    category: input.category.trim() || "Outros",
    brand: input.brand?.trim() || "SUINCO",
    presentation: input.presentation?.trim() || null,
    defaultUnit: input.defaultUnit,
    aliases: input.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean),
    referencePrice: input.referencePrice === null || input.referencePrice === undefined ? null : input.referencePrice.toFixed(2),
    status: input.status,
  };
  if (input.id) {
    const [prev] = await db.select().from(s.products).where(and(eq(s.products.id, input.id), eq(s.products.clientId, scope.clientId)));
    if (!prev) return { ok: false, error: "Produto não encontrado." };
    await db.update(s.products).set({ ...values, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.products.id, input.id));
    const d = diffFields(prev as unknown as Record<string, unknown>, values);
    if (d) await audit(actorOf(scope), "product", input.id, "update", d.before, d.after);
    return { ok: true, id: input.id };
  }
  const [row] = await db.insert(s.products).values({ ...values, tenantId: scope.tenantId, clientId: scope.clientId, createdBy: scope.userId }).returning({ id: s.products.id });
  await audit(actorOf(scope), "product", row.id, "create", null, values);
  return { ok: true, id: row.id };
}
