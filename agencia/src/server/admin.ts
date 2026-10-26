/**
 * Cadastros (somente administrador). Validação no servidor, mensagens claras
 * de duplicidade e auditoria de toda alteração (antes → depois).
 * Nada é apagado: cadastros são inativados, preservando o histórico.
 */
import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { hashPassword } from "./auth";
import { audit, diffFields } from "./audit";
import { productNameKey } from "@/lib/rules";
import { PRODUCT_UNITS, type WorkMode, type Employment, type Role, type Unit } from "@/lib/domain";
import { mergeSettings, type AgencySettings } from "@/lib/settings";
import { PANEL_KEYS } from "@/lib/permissions";
import type { ActionResult } from "./manager";

const fail = (error: string): ActionResult => ({ ok: false, error });
const isAdmin = (scope: Scope) => scope.role === "admin";
const actor = (scope: Scope) => ({ agencyId: scope.agencyId, userId: scope.userId });
const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

function uniqueViolation(err: unknown): string | null {
  const msg = `${(err as Error)?.message ?? ""} ${String((err as { cause?: unknown })?.cause ?? "")}`;
  const m = msg.match(/"([a-z_]+_uq)"/);
  return m ? m[1] : /duplicate key/.test(msg) ? "duplicate" : null;
}

// ───────────────────────────── Marcas ─────────────────────────────

export interface BrandInput {
  id: string | null;
  name: string;
  code: string;
  status: "active" | "inactive";
  minBeforePhotos: number;
  minAfterPhotos: number;
  requireStock: boolean;
  rupturePhotoRequired: boolean;
  allowGallery: boolean;
  activities: string[];
  notes: string | null;
}

export async function saveBrand(scope: Scope, i: BrandInput): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  if (i.name.trim().length < 2 || i.code.trim().length < 2) return fail("Informe nome e identificador.");
  if (![i.minBeforePhotos, i.minAfterPhotos].every((n) => Number.isInteger(n) && n >= 0 && n <= 10)) return fail("Quantidade mínima de fotos deve ser de 0 a 10.");
  const db = await getDb();
  const values = {
    name: i.name.trim(),
    code: i.code.trim().toUpperCase(),
    status: i.status,
    minBeforePhotos: i.minBeforePhotos,
    minAfterPhotos: i.minAfterPhotos,
    requireStock: i.requireStock,
    rupturePhotoRequired: i.rupturePhotoRequired,
    allowGallery: i.allowGallery,
    activities: i.activities.map((a) => a.trim()).filter(Boolean).slice(0, 20),
    notes: clean(i.notes),
  };
  try {
    if (i.id) {
      const [before] = await db.select().from(s.brands).where(and(eq(s.brands.id, i.id), eq(s.brands.agencyId, scope.agencyId)));
      if (!before) return fail("Marca não encontrada.");
      await db.update(s.brands).set({ ...values, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.brands.id, i.id));
      const d = diffFields(before, values);
      if (d) await audit(actor(scope), "brand", i.id, "updated", d);
    } else {
      const [row] = await db.insert(s.brands).values({ ...values, agencyId: scope.agencyId, createdBy: scope.userId }).returning({ id: s.brands.id });
      await audit(actor(scope), "brand", row.id, "created", { after: values });
    }
  } catch (err) {
    if (uniqueViolation(err)) return fail("Já existe marca com este nome ou identificador.");
    throw err;
  }
  return { ok: true, message: "Marca salva." };
}

// ───────────────────────────── Redes e lojas ─────────────────────────────

export async function saveChain(scope: Scope, id: string | null, name: string, status: "active" | "inactive"): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  if (name.trim().length < 2) return fail("Informe o nome da rede.");
  const db = await getDb();
  try {
    if (id) {
      await db.update(s.chains).set({ name: name.trim(), status, updatedAt: new Date() }).where(and(eq(s.chains.id, id), eq(s.chains.agencyId, scope.agencyId)));
      await audit(actor(scope), "chain", id, "updated", { after: { name, status } });
    } else {
      const [row] = await db.insert(s.chains).values({ agencyId: scope.agencyId, name: name.trim() }).returning({ id: s.chains.id });
      await audit(actor(scope), "chain", row.id, "created", { after: { name } });
    }
  } catch (err) {
    if (uniqueViolation(err)) return fail("Já existe rede com este nome.");
    throw err;
  }
  return { ok: true, message: "Rede salva." };
}

export interface StoreInput {
  id: string | null;
  chainId: string | null;
  name: string;
  code: string | null;
  cnpj: string | null;
  address: string | null;
  district: string | null;
  city: string;
  state: string;
  status: "active" | "inactive";
  brandIds: string[];
  rules: string | null;
  notes: string | null;
  /** Localização da loja no mapa; undefined = não alterar. */
  coords?: { lat: number; lng: number } | null;
}

export async function saveStore(scope: Scope, i: StoreInput): Promise<ActionResult & { id?: string }> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  if (i.name.trim().length < 2 || i.city.trim().length < 2) return fail("Informe nome e cidade da loja.");
  const cnpj = i.cnpj ? i.cnpj.replace(/\D/g, "") : null;
  if (cnpj && cnpj.length !== 14) return fail("CNPJ deve ter 14 dígitos.");
  const db = await getDb();
  const values = {
    chainId: i.chainId,
    name: i.name.trim(),
    code: clean(i.code),
    cnpj,
    address: clean(i.address),
    district: clean(i.district),
    city: i.city.trim(),
    state: (i.state.trim() || "MG").toUpperCase().slice(0, 2),
    status: i.status,
    rules: clean(i.rules),
    notes: clean(i.notes),
    ...(i.coords !== undefined ? { lat: i.coords?.lat ?? null, lng: i.coords?.lng ?? null } : {}),
  };
  let id = i.id;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx.select().from(s.stores).where(and(eq(s.stores.id, id), eq(s.stores.agencyId, scope.agencyId)));
        if (!before) throw new Error("not_found");
        await tx.update(s.stores).set({ ...values, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.stores.id, id));
        const d = diffFields(before, values);
        if (d) await audit(actor(scope), "store", id, "updated", d, tx);
      } else {
        const [row] = await tx.insert(s.stores).values({ ...values, agencyId: scope.agencyId, createdBy: scope.userId }).returning({ id: s.stores.id });
        id = row.id;
        await audit(actor(scope), "store", id, "created", { after: values }, tx);
      }
      const before = (await tx.select().from(s.storeBrands).where(eq(s.storeBrands.storeId, id!))).map((r) => r.brandId).sort();
      const after = [...new Set(i.brandIds)].sort();
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        await tx.delete(s.storeBrands).where(eq(s.storeBrands.storeId, id!));
        if (after.length) await tx.insert(s.storeBrands).values(after.map((b) => ({ storeId: id!, brandId: b })));
        await audit(actor(scope), "store", id!, "brands_changed", { before: { brandIds: before }, after: { brandIds: after } }, tx);
      }
    });
  } catch (err) {
    if ((err as Error).message === "not_found") return fail("Loja não encontrada.");
    if (uniqueViolation(err)) return fail("Já existe loja com este código nesta rede.");
    throw err;
  }
  return { ok: true, message: "Loja salva.", id: id! };
}

/** Grava a localização da loja no mapa (ex.: a registrada pelo promotor numa visita). */
export async function setStoreCoords(scope: Scope, storeId: string, coords: { lat: number; lng: number }, source: string): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  const db = await getDb();
  const [before] = await db.select({ lat: s.stores.lat, lng: s.stores.lng }).from(s.stores).where(and(eq(s.stores.id, storeId), eq(s.stores.agencyId, scope.agencyId)));
  if (!before) return fail("Loja não encontrada.");
  await db.update(s.stores).set({ lat: coords.lat, lng: coords.lng, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.stores.id, storeId));
  await audit(actor(scope), "store", storeId, "location_set", { before, after: coords, reason: source });
  return { ok: true, message: "Localização da loja gravada." };
}

/** Produtos acompanhados na loja para uma marca (vazio = todos os ativos da marca). */
export async function setStoreProducts(scope: Scope, storeId: string, brandId: string, productIds: string[]): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  const db = await getDb();
  const brandProducts = (await db.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.brandId, brandId), eq(s.products.agencyId, scope.agencyId)))).map((p) => p.id);
  const keep = productIds.filter((p) => brandProducts.includes(p));
  await db.transaction(async (tx) => {
    if (brandProducts.length) await tx.delete(s.storeProducts).where(and(eq(s.storeProducts.storeId, storeId), inArray(s.storeProducts.productId, brandProducts)));
    if (keep.length && keep.length < brandProducts.length) await tx.insert(s.storeProducts).values(keep.map((p) => ({ storeId, productId: p })));
    await audit(actor(scope), "store", storeId, "tracked_products", { after: { brandId, products: keep.length === brandProducts.length ? "todos" : keep } }, tx);
  });
  return { ok: true, message: keep.length === brandProducts.length || !keep.length ? "Loja acompanha todos os produtos ativos da marca." : `Loja acompanha ${keep.length} produto(s) da marca.` };
}

// ───────────────────────────── Produtos ─────────────────────────────

export interface ProductInput {
  id: string | null;
  brandId: string;
  name: string;
  sku: string;
  ean: string | null;
  category: string | null;
  variant: string | null;
  package: string | null;
  unit: Unit;
  status: "active" | "inactive";
}

export function validateProduct(i: ProductInput): string | null {
  if (i.name.trim().length < 3) return "Nome do produto muito curto.";
  if (!i.sku.trim()) return "Informe o SKU/código.";
  if (!(PRODUCT_UNITS as readonly Unit[]).includes(i.unit)) return "Unidade inválida: use unidade ou caixa.";
  const ean = (i.ean ?? "").replace(/\D/g, "");
  if (ean && ![8, 12, 13, 14].includes(ean.length)) return "EAN deve ter 8, 12, 13 ou 14 dígitos.";
  return null;
}

export async function saveProduct(scope: Scope, i: ProductInput): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  const err = validateProduct(i);
  if (err) return fail(err);
  const db = await getDb();
  const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.id, i.brandId), eq(s.brands.agencyId, scope.agencyId)));
  if (!brand) return fail("Marca inválida.");
  const nameKey = productNameKey(i.name);
  // Duplicidade por grafia diferente ("500 g" × "500G") ou mesmo SKU.
  const [clash] = await db
    .select({ id: s.products.id, name: s.products.name, sku: s.products.sku })
    .from(s.products)
    .where(and(eq(s.products.brandId, i.brandId), sql`(${s.products.nameKey} = ${nameKey} or lower(${s.products.sku}) = ${i.sku.trim().toLowerCase()})`, i.id ? ne(s.products.id, i.id) : undefined));
  if (clash) return fail(`Já existe produto equivalente nesta marca: “${clash.name}” (SKU ${clash.sku}).`);
  const values = {
    brandId: i.brandId,
    name: i.name.trim(),
    nameKey,
    sku: i.sku.trim(),
    ean: clean((i.ean ?? "").replace(/\D/g, "")),
    category: clean(i.category),
    variant: clean(i.variant),
    package: clean(i.package),
    unit: i.unit,
    status: i.status,
  };
  if (i.id) {
    const [before] = await db.select().from(s.products).where(and(eq(s.products.id, i.id), eq(s.products.agencyId, scope.agencyId)));
    if (!before) return fail("Produto não encontrado.");
    await db.update(s.products).set({ ...values, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.products.id, i.id));
    const d = diffFields(before, values);
    if (d) await audit(actor(scope), "product", i.id, "updated", d);
  } else {
    const [row] = await db.insert(s.products).values({ ...values, agencyId: scope.agencyId, createdBy: scope.userId }).returning({ id: s.products.id });
    await audit(actor(scope), "product", row.id, "created", { after: values });
  }
  return { ok: true, message: "Produto salvo." };
}

// ───────────────────────────── Usuários ─────────────────────────────

export interface UserInput {
  id: string | null;
  role: Role;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  internalCode: string | null;
  employment: Employment | null;
  /** undefined = não altera (importação de planilha). */
  workMode?: WorkMode | null;
  region: string | null;
  managerId: string | null;
  status: "active" | "inactive";
  allBrands: boolean;
  teamOnly: boolean;
  /** undefined = não altera (promotor: as lojas e marcas vêm das atribuições). */
  brandIds?: string[];
  storeIds?: string[];
  /** Painéis liberados (perfis); undefined = não altera. */
  permissions?: string[];
  password: string | null;
}

export async function saveUser(scope: Scope, i: UserInput): Promise<ActionResult & { id?: string }> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  if (i.name.trim().length < 3) return fail("Informe o nome completo.");
  if (!/^[a-z0-9._-]{3,40}$/i.test(i.username.trim())) return fail("Usuário: 3 a 40 caracteres (letras, números, ponto, hífen).");
  if (!i.id && !i.password) return fail("Defina uma senha inicial.");
  if (i.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(i.email)) return fail("E-mail inválido.");
  if (i.id === scope.userId && (i.status !== "active" || i.role !== "admin")) return fail("Você não pode desativar nem rebaixar o próprio acesso.");
  const db = await getDb();
  const values = {
    role: i.role,
    name: i.name.trim(),
    username: i.username.trim().toLowerCase(),
    email: clean(i.email),
    phone: clean(i.phone),
    internalCode: clean(i.internalCode),
    employment: i.role === "promoter" ? i.employment ?? "freelancer" : null,
    workMode: i.role === "promoter" ? i.workMode : null,
    region: clean(i.region),
    managerId: i.role === "promoter" ? i.managerId : null,
    status: i.status,
    allBrands: i.role === "manager" ? i.allBrands : true,
    teamOnly: i.role === "manager" ? i.teamOnly : false,
    ...(i.permissions !== undefined ? { permissions: i.role === "promoter" ? null : [...new Set(i.permissions.filter((k) => PANEL_KEYS.includes(k)))] } : {}),
  };
  let id = i.id;
  try {
    await db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.agencyId, scope.agencyId)));
        if (!before) throw new Error("not_found");
        const deactivating = before.status === "active" && i.status === "inactive";
        await tx
          .update(s.users)
          .set({
            ...values,
            updatedAt: new Date(),
            updatedBy: scope.userId,
            ...(i.password ? { passwordHash: await hashPassword(i.password), mustChangePassword: i.role !== "promoter" } : {}),
            // Salvar o cadastro libera o bloqueio por tentativas erradas.
            failedLogins: 0,
            lockedUntil: null,
            // Desativar ou trocar senha derruba as sessões abertas. Registros históricos permanecem.
            ...(deactivating || i.password ? { sessionVersion: before.sessionVersion + 1 } : {}),
            ...(deactivating ? { deactivatedAt: new Date() } : i.status === "active" ? { deactivatedAt: null } : {}),
          })
          .where(eq(s.users.id, id));
        const d = diffFields(before, values);
        if (d) await audit(actor(scope), "user", id, deactivating ? "deactivated" : "updated", d, tx);
        if (i.password) await audit(actor(scope), "user", id, "password_reset", {}, tx);
      } else {
        const [row] = await tx
          .insert(s.users)
          .values({ ...values, agencyId: scope.agencyId, passwordHash: await hashPassword(i.password!), mustChangePassword: i.role !== "promoter", createdBy: scope.userId })
          .returning({ id: s.users.id });
        id = row.id;
        await audit(actor(scope), "user", id, "created", { after: values }, tx);
      }
      // Autorizações: marcas (promotor e gestor restrito) e lojas (promotor).
      const prevBrands = (await tx.select().from(s.userBrands).where(eq(s.userBrands.userId, id!))).map((r) => r.brandId).sort();
      const prevStores = (await tx.select().from(s.userStores).where(eq(s.userStores.userId, id!))).map((r) => r.storeId).sort();
      const brandIds = i.brandIds === undefined ? prevBrands : i.role === "promoter" || (i.role === "manager" && !i.allBrands) ? [...new Set(i.brandIds)] : [];
      const storeIds = i.storeIds === undefined ? prevStores : i.role === "promoter" ? [...new Set(i.storeIds)] : [];
      if (JSON.stringify(prevBrands) !== JSON.stringify([...brandIds].sort())) {
        await tx.delete(s.userBrands).where(eq(s.userBrands.userId, id!));
        if (brandIds.length) await tx.insert(s.userBrands).values(brandIds.map((b) => ({ userId: id!, brandId: b })));
        await audit(actor(scope), "user", id!, "brands_changed", { before: { brandIds: prevBrands }, after: { brandIds } }, tx);
      }
      if (JSON.stringify(prevStores) !== JSON.stringify([...storeIds].sort())) {
        await tx.delete(s.userStores).where(eq(s.userStores.userId, id!));
        if (storeIds.length) await tx.insert(s.userStores).values(storeIds.map((st) => ({ userId: id!, storeId: st })));
        await audit(actor(scope), "user", id!, "stores_changed", { before: { count: prevStores.length }, after: { count: storeIds.length } }, tx);
      }
    });
  } catch (err) {
    if ((err as Error).message === "not_found") return fail("Usuário não encontrado.");
    if (uniqueViolation(err)) return fail("Este nome de usuário já está em uso.");
    throw err;
  }
  return { ok: true, message: "Usuário salvo.", id: id! };
}

// ───────────────────────────── Configurações ─────────────────────────────

export async function saveSettings(scope: Scope, patch: Partial<AgencySettings>): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  const db = await getDb();
  const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, scope.agencyId));
  const before = mergeSettings(agency.settings);
  const after = mergeSettings({ ...before, ...patch });
  await db.update(s.agencies).set({ settings: after, updatedAt: new Date() }).where(eq(s.agencies.id, scope.agencyId));
  const mask = (x: AgencySettings) => ({ ...x, alerts: { ...x.alerts, whatsappApiKey: x.alerts.whatsappApiKey ? "(definida)" : "" } });
  const keyChanged = before.alerts.whatsappApiKey !== after.alerts.whatsappApiKey;
  const d = diffFields(mask(before) as never, { ...mask(after), ...(keyChanged ? { alertKeyChanged: true } : {}) } as never);
  if (d) await audit(actor(scope), "settings", scope.agencyId, "updated", d);
  return { ok: true, message: "Configurações salvas." };
}

/** Promotores autorizados a usar foto da galeria (os demais da agência ficam sem autorização). */
export async function saveGalleryAuthorized(scope: Scope, promoterIds: string[]): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  const db = await getDb();
  const promoters = await db.select({ id: s.users.id, name: s.users.name, galleryAllowed: s.users.galleryAllowed }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter")));
  const want = new Set(promoterIds);
  for (const p of promoters) {
    const next = want.has(p.id);
    if (p.galleryAllowed === next) continue;
    await db.update(s.users).set({ galleryAllowed: next, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.users.id, p.id));
    await audit(actor(scope), "user", p.id, "gallery_permission", { before: { galleryAllowed: p.galleryAllowed }, after: { galleryAllowed: next } });
  }
  return { ok: true };
}

export async function saveAgencyName(scope: Scope, name: string): Promise<ActionResult> {
  if (!isAdmin(scope)) return fail("Somente administradores.");
  if (name.trim().length < 2) return fail("Informe o nome da agência.");
  const db = await getDb();
  await db.update(s.agencies).set({ name: name.trim(), updatedAt: new Date() }).where(eq(s.agencies.id, scope.agencyId));
  await audit(actor(scope), "agency", scope.agencyId, "renamed", { after: { name } });
  return { ok: true, message: "Nome atualizado." };
}
