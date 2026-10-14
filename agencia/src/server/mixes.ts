/**
 * Mix por formato de loja (ex.: ABC VAREJO, PLUS e CASH). A rede pode ter vários
 * mixes da mesma marca; cada loja usa um. Quem define é o promotor, no primeiro
 * atendimento (escolha enviada junto com a visita), ou o gestor no cadastro.
 * Aplicar o mix = trocar a lista de produtos da loja naquela marca.
 */
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema as s, type DB } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import type { ActionResult } from "./manager";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Grava o formato da loja e troca os produtos acompanhados da marca pelos do mix. */
export async function applyStoreMix(tx: DB | Tx, storeId: string, brandId: string, mixId: string, userId: string | null): Promise<void> {
  const [mix] = await tx.select().from(s.productMixes).where(eq(s.productMixes.id, mixId));
  if (!mix || mix.brandId !== brandId) throw new Error("Mix inválido para esta marca.");
  await tx
    .insert(s.storeMixes)
    .values({ storeId, brandId, mixId, chosenBy: userId })
    .onConflictDoUpdate({ target: [s.storeMixes.storeId, s.storeMixes.brandId], set: { mixId, chosenBy: userId, chosenAt: new Date() } });
  const brandProducts = (await tx.select({ id: s.products.id }).from(s.products).where(eq(s.products.brandId, brandId))).map((p) => p.id);
  if (brandProducts.length) await tx.delete(s.storeProducts).where(and(eq(s.storeProducts.storeId, storeId), inArray(s.storeProducts.productId, brandProducts)));
  const keep = mix.productIds.filter((id) => brandProducts.includes(id));
  if (keep.length) await tx.insert(s.storeProducts).values(keep.map((productId) => ({ storeId, productId }))).onConflictDoNothing();
}

/** Mixes das redes das lojas informadas, só onde há mais de um mix para escolher. */
export async function mixesForStores(db: DB, storeIds: string[], brandIds: string[]) {
  if (!storeIds.length || !brandIds.length) return { mixes: [], chosen: {} as Record<string, Record<string, string>>, chainOf: new Map<string, string | null>() };
  const stores = await db.select({ id: s.stores.id, chainId: s.stores.chainId }).from(s.stores).where(inArray(s.stores.id, storeIds));
  const chainIds = [...new Set(stores.map((x) => x.chainId).filter((x): x is string => Boolean(x)))];
  const all = chainIds.length ? await db.select().from(s.productMixes).where(and(inArray(s.productMixes.chainId, chainIds), inArray(s.productMixes.brandId, brandIds))) : [];
  const count = new Map<string, number>();
  for (const m of all) count.set(`${m.chainId}:${m.brandId}`, (count.get(`${m.chainId}:${m.brandId}`) ?? 0) + 1);
  const mixes = all
    .filter((m) => (count.get(`${m.chainId}:${m.brandId}`) ?? 0) > 1)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((m) => ({ id: m.id, chainId: m.chainId, brandId: m.brandId, name: m.name, productIds: m.productIds }));
  const rows = await db.select().from(s.storeMixes).where(inArray(s.storeMixes.storeId, storeIds));
  const chosen: Record<string, Record<string, string>> = {};
  for (const r of rows) (chosen[r.storeId] ??= {})[r.brandId] = r.mixId;
  return { mixes, chosen, chainOf: new Map(stores.map((x) => [x.id, x.chainId])) };
}

/** Escolhas que vieram do aparelho: valem só se a loja ainda não tem formato definido. */
export async function applyPromoterMixChoices(tx: Tx, storeId: string, choices: { brandId: string; mixId: string }[], allowedBrands: Set<string>, promoterId: string, agencyId: string): Promise<void> {
  if (!choices.length) return;
  const [store] = await tx.select({ chainId: s.stores.chainId }).from(s.stores).where(eq(s.stores.id, storeId));
  for (const c of choices) {
    if (!allowedBrands.has(c.brandId)) continue;
    const [existing] = await tx.select().from(s.storeMixes).where(and(eq(s.storeMixes.storeId, storeId), eq(s.storeMixes.brandId, c.brandId)));
    if (existing) continue;
    const [mix] = await tx.select().from(s.productMixes).where(eq(s.productMixes.id, c.mixId));
    if (!mix || mix.chainId !== store?.chainId || mix.brandId !== c.brandId || mix.agencyId !== agencyId) continue;
    await applyStoreMix(tx, storeId, c.brandId, c.mixId, promoterId);
    await audit({ agencyId, userId: promoterId }, "store", storeId, "mix_chosen", { after: { brandId: c.brandId, mix: mix.name } }, tx);
  }
}

/** Gestor define ou troca o formato da loja (Cadastros › Redes e lojas). */
export async function setStoreMix(scope: Scope, storeId: string, brandId: string, mixId: string): Promise<ActionResult> {
  if (scope.role !== "admin") return { ok: false, error: "Somente administradores." };
  const db = await getDb();
  const [store] = await db.select().from(s.stores).where(and(eq(s.stores.id, storeId), eq(s.stores.agencyId, scope.agencyId)));
  const [mix] = await db.select().from(s.productMixes).where(eq(s.productMixes.id, mixId));
  if (!store || !mix || mix.chainId !== store.chainId || mix.brandId !== brandId) return { ok: false, error: "Formato inválido para esta loja." };
  await db.transaction(async (tx) => {
    await applyStoreMix(tx, storeId, brandId, mixId, scope.userId);
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "store", storeId, "mix_set", { after: { brandId, mix: mix.name } }, tx);
  });
  return { ok: true, message: `Formato ${mix.name} aplicado.` };
}

/** Formatos disponíveis e o escolhido, por marca, para a página da loja no cadastro. */
export async function storeMixOptions(scope: Scope, storeId: string) {
  const db = await getDb();
  const [store] = await db.select().from(s.stores).where(and(eq(s.stores.id, storeId), eq(s.stores.agencyId, scope.agencyId)));
  if (!store?.chainId) return [];
  const mixes = await db
    .select({ id: s.productMixes.id, name: s.productMixes.name, brandId: s.productMixes.brandId, brandName: s.brands.name, n: s.productMixes.productIds })
    .from(s.productMixes)
    .innerJoin(s.brands, eq(s.brands.id, s.productMixes.brandId))
    .where(eq(s.productMixes.chainId, store.chainId));
  const chosen = await db.select().from(s.storeMixes).where(eq(s.storeMixes.storeId, storeId));
  const byBrand = new Map<string, { brandId: string; brandName: string; options: { id: string; name: string; products: number }[]; chosenId: string | null }>();
  for (const m of mixes) {
    const g = byBrand.get(m.brandId) ?? { brandId: m.brandId, brandName: m.brandName, options: [], chosenId: chosen.find((c) => c.brandId === m.brandId)?.mixId ?? null };
    g.options.push({ id: m.id, name: m.name, products: m.n.length });
    byBrand.set(m.brandId, g);
  }
  return [...byBrand.values()];
}
