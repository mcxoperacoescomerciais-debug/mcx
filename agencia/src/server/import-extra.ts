/**
 * Importações que agrupam várias linhas num registro só:
 * - mix: produtos por formato de loja numa rede (rede + mix) ou de uma loja (loja);
 * - roteiros: promotor + dias da semana + lojas, na ordem da planilha.
 */
import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { applyStoreMix } from "./mixes";
import { saveRoute } from "./schedules";
import type { ImportReport } from "./import";

type Row = Record<string, string>;

async function findStore(scope: Scope, ref: string) {
  const db = await getDb();
  return db
    .select({ id: s.stores.id, chainId: s.stores.chainId })
    .from(s.stores)
    .where(and(eq(s.stores.agencyId, scope.agencyId), sql`(lower(${s.stores.code}) = ${ref.toLowerCase()} or lower(${s.stores.name}) = ${ref.toLowerCase()})`));
}

async function findBrand(scope: Scope, ref: string) {
  const db = await getDb();
  const [b] = await db
    .select({ id: s.brands.id })
    .from(s.brands)
    .where(and(eq(s.brands.agencyId, scope.agencyId), sql`(lower(${s.brands.code}) = ${ref.toLowerCase()} or lower(${s.brands.name}) = ${ref.toLowerCase()})`));
  return b ?? null;
}

/** Mix: linhas com `loja` viram a lista da loja; linhas com `rede` + `mix` viram um formato da rede. */
export async function importMix(scope: Scope, rows: Row[], report: ImportReport): Promise<void> {
  const db = await getDb();
  const groups = new Map<string, { kind: "store" | "chain"; ref: string; mix: string; brand: string; skus: string[]; line: number }>();
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const sku = (r.sku ?? "").trim();
    const brand = (r.marca ?? "").trim();
    if (!sku || !brand) {
      report.errors.push({ line, message: "Informe marca e sku." });
      continue;
    }
    const loja = (r.loja ?? "").trim();
    const rede = (r.rede ?? "").trim();
    const mix = (r.mix ?? "").trim().toUpperCase();
    if (!loja && !(rede && mix)) {
      report.errors.push({ line, message: "Informe a loja, ou a rede e o nome do mix." });
      continue;
    }
    const key = loja ? `store:${loja.toLowerCase()}:${brand.toLowerCase()}` : `chain:${rede.toLowerCase()}:${mix}:${brand.toLowerCase()}`;
    const g = groups.get(key) ?? { kind: loja ? ("store" as const) : ("chain" as const), ref: loja || rede, mix, brand, skus: [], line };
    g.skus.push(sku);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const brand = await findBrand(scope, g.brand);
    if (!brand) {
      report.errors.push({ line: g.line, message: `Marca “${g.brand}” não cadastrada.` });
      continue;
    }
    const products = await db.select({ id: s.products.id, sku: s.products.sku }).from(s.products).where(and(eq(s.products.brandId, brand.id), inArray(s.products.sku, g.skus)));
    const missing = g.skus.filter((k) => !products.some((p) => p.sku === k));
    if (missing.length) report.errors.push({ line: g.line, message: `${g.ref}${g.mix ? ` ${g.mix}` : ""}: SKU não cadastrado — ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}` });
    const ids = [...new Set(products.map((p) => p.id))];
    if (!ids.length) continue;
    if (g.kind === "store") {
      const stores = await findStore(scope, g.ref);
      if (stores.length !== 1) {
        report.errors.push({ line: g.line, message: stores.length ? `Loja “${g.ref}” é ambígua.` : `Loja “${g.ref}” não encontrada.` });
        continue;
      }
      if (report.dryRun) {
        report.updated++;
        continue;
      }
      await db.transaction(async (tx) => {
        const brandProducts = (await tx.select({ id: s.products.id }).from(s.products).where(eq(s.products.brandId, brand.id))).map((p) => p.id);
        await tx.delete(s.storeProducts).where(and(eq(s.storeProducts.storeId, stores[0].id), inArray(s.storeProducts.productId, brandProducts)));
        await tx.insert(s.storeProducts).values(ids.map((productId) => ({ storeId: stores[0].id, productId }))).onConflictDoNothing();
      });
      report.updated++;
    } else {
      let [chain] = await db.select({ id: s.chains.id }).from(s.chains).where(and(eq(s.chains.agencyId, scope.agencyId), sql`lower(${s.chains.name}) = ${g.ref.toLowerCase()}`));
      // Rede ainda sem cadastro: o mix da rede chega antes das lojas (ex.: lista de SKUs da marca por rede).
      if (!chain) {
        if (report.dryRun) {
          (report.notes ??= []).push({ line: g.line, message: `Rede “${g.ref}” não existe: será criada.` });
          report.created++;
          continue;
        }
        [chain] = await db.insert(s.chains).values({ agencyId: scope.agencyId, name: g.ref.trim() }).returning({ id: s.chains.id });
      }
      const [existing] = await db.select().from(s.productMixes).where(and(eq(s.productMixes.chainId, chain.id), eq(s.productMixes.brandId, brand.id), sql`lower(${s.productMixes.name}) = ${g.mix.toLowerCase()}`));
      if (report.dryRun) {
        if (existing) report.updated++;
        else report.created++;
        continue;
      }
      if (existing) {
        await db.update(s.productMixes).set({ productIds: ids, updatedAt: new Date() }).where(eq(s.productMixes.id, existing.id));
        // Lojas que já usam este formato recebem a lista nova.
        const using = await db.select().from(s.storeMixes).where(eq(s.storeMixes.mixId, existing.id));
        for (const u of using) await applyStoreMix(db, u.storeId, u.brandId, u.mixId, scope.userId);
        report.updated++;
      } else {
        await db.insert(s.productMixes).values({ agencyId: scope.agencyId, chainId: chain.id, brandId: brand.id, name: g.mix, productIds: ids });
        report.created++;
      }
    }
  }
}

const DAY: Record<string, number> = { DOM: 0, SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5, SAB: 6, SÁB: 6 };

/** "SEG/QUI", "seg, qua e sex", "QUARTA" → [1, 4]… */
export function parseWeekdays(raw: string): number[] {
  const parts = raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^A-Z]+/)
    .filter(Boolean)
    .map((p) => DAY[p.slice(0, 3)])
    .filter((d): d is number => d !== undefined);
  return [...new Set(parts)].sort();
}

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Roteiros: um por promotor + dias; lojas na ordem da planilha. Nome igual = atualiza o roteiro. */
export async function importRoutes(scope: Scope, rows: Row[], report: ImportReport): Promise<void> {
  const db = await getDb();
  const groups = new Map<string, { promoterId: string; promoterName: string; days: number[]; name: string; stops: { storeId: string; plannedStart: string | null }[]; line: number }>();
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const username = (r.promotor ?? "").trim().toLowerCase();
    const days = parseWeekdays(r.dias ?? "");
    const ref = (r.loja ?? "").trim();
    const [p] = username ? await db.select({ id: s.users.id, name: s.users.name, role: s.users.role }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), sql`lower(${s.users.username}) = ${username}`)) : [];
    if (!p || p.role !== "promoter") {
      report.errors.push({ line, message: `Promotor “${r.promotor ?? ""}” não encontrado (use o usuário).` });
      continue;
    }
    if (!days.length) {
      report.errors.push({ line, message: `Dias “${r.dias ?? ""}” inválidos (ex.: SEG/QUI).` });
      continue;
    }
    const stores = ref ? await findStore(scope, ref) : [];
    if (stores.length !== 1) {
      report.errors.push({ line, message: stores.length ? `Loja “${ref}” é ambígua.` : `Loja “${ref}” não encontrada.` });
      continue;
    }
    const time = (r.horario ?? "").trim();
    const name = (r.roteiro ?? "").trim() || `${p.name} · ${days.map((d) => DAY_SHORT[d]).join("/")}`;
    const key = `${p.id}:${name.toLowerCase()}`;
    const g = groups.get(key) ?? { promoterId: p.id, promoterName: p.name, days, name, stops: [], line };
    g.stops.push({ storeId: stores[0].id, plannedStart: /^\d{2}:\d{2}$/.test(time) ? time : null });
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const [existing] = await db.select({ id: s.routes.id }).from(s.routes).where(and(eq(s.routes.agencyId, scope.agencyId), sql`lower(${s.routes.name}) = ${g.name.toLowerCase()}`));
    if (report.dryRun) {
      if (existing) report.updated++;
      else report.created++;
      continue;
    }
    const res = await saveRoute(scope, { id: existing?.id ?? null, name: g.name, region: null, promoterId: g.promoterId, weekdays: g.days, status: "active", stops: g.stops }, "Importação de planilha");
    if (!res.ok) report.errors.push({ line: g.line, message: `${g.name}: ${res.error}` });
    else if (existing) report.updated++;
    else report.created++;
  }
}
