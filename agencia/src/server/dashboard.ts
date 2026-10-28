/**
 * Indicadores visuais (painel de gráficos e visão geral executiva): ruptura por
 * rede, loja, SKU e dia com o índice de ruptura, área de vendas × estoque, datas
 * críticas, avarias e lojas não atendidas. Mesmos filtros do painel.
 *
 * Índice de ruptura = SKUs em ruptura ÷ SKUs verificados (estoque informado) no
 * mesmo recorte, em %. Sem verificação no recorte, o índice fica vazio.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { getRangeBoard } from "./operations";
import type { PanelFilters } from "@/lib/filters";

type F = Pick<PanelFilters, "from" | "to" | "brand" | "chain" | "store" | "promoter" | "city">;

/** Ruptura que aparece na área de vendas (gôndola) e no estoque (depósito). */
const SALES_FLOOR = ["total", "shelf_empty", "missing_display", "registered_not_found", "unavailable_other"];
const STOCKROOM = ["total", "backroom_empty"];

export interface Slice {
  id: string;
  name: string;
  checks: number;
  ruptures: number;
  /** % (0–100) com 1 casa; null sem verificação. */
  index: number | null;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null);

function conds(scope: Scope, f: F, date: SQL | typeof s.visits.visitDate = s.visits.visitDate): (SQL | undefined)[] {
  return [
    gte(date as typeof s.visits.visitDate, f.from),
    lte(date as typeof s.visits.visitDate, f.to),
    brandFilter(scope, s.attendances.brandId),
    promoterFilter(scope, s.visits.promoterId),
    f.brand ? eq(s.attendances.brandId, f.brand) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
  ];
}

export async function dashboardData(scope: Scope, f: F) {
  const db = await getDb();
  const groupBy = async (table: "stock" | "rupture", key: "chain" | "store" | "product" | "day") => {
    const col =
      key === "chain"
        ? { id: sql<string>`coalesce(${s.chains.id}::text, 'sem-rede')`, name: sql<string>`coalesce(${s.chains.name}, 'Sem rede')` }
        : key === "store"
          ? { id: sql<string>`${s.stores.id}::text`, name: sql<string>`${s.stores.name}` }
          : key === "product"
            ? { id: sql<string>`${s.products.id}::text`, name: sql<string>`${s.products.name} || coalesce(' · ' || ${s.products.sku}, '')` }
            : { id: sql<string>`${s.visits.visitDate}::text`, name: sql<string>`${s.visits.visitDate}::text` };
    const t = table === "stock" ? s.stockEntries : s.ruptures;
    const q = db
      .select({ id: col.id, name: col.name, n: sql<number>`count(*)::int` })
      .from(t)
      .innerJoin(s.attendances, eq(s.attendances.id, t.attendanceId))
      .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
      .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .innerJoin(s.products, eq(s.products.id, t.productId))
      .where(and(eq(t.agencyId, scope.agencyId), table === "rupture" ? isNull(s.ruptures.deletedAt) : undefined, ...conds(scope, f)))
      .groupBy(col.id, col.name);
    return (await q) as { id: string; name: string; n: number }[];
  };
  const slices = async (key: "chain" | "store" | "product" | "day"): Promise<Slice[]> => {
    const [checks, rupt] = await Promise.all([groupBy("stock", key), groupBy("rupture", key)]);
    const map = new Map<string, Slice>();
    for (const c of checks) map.set(c.id, { id: c.id, name: c.name, checks: c.n, ruptures: 0, index: null });
    for (const r of rupt) {
      const x = map.get(r.id) ?? { id: r.id, name: r.name, checks: 0, ruptures: 0, index: null };
      x.ruptures = r.n;
      map.set(r.id, x);
    }
    return [...map.values()].map((x) => ({ ...x, index: pct(x.ruptures, x.checks) }));
  };
  const [byChain, byStore, byProduct, byDay] = await Promise.all([slices("chain"), slices("store"), slices("product"), slices("day")]);

  // Ruptura por situação (área de vendas × estoque).
  const situations = (await db
    .select({ situation: s.ruptures.situation, n: sql<number>`count(*)::int` })
    .from(s.ruptures)
    .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(and(eq(s.ruptures.agencyId, scope.agencyId), isNull(s.ruptures.deletedAt), ...conds(scope, f)))
    .groupBy(s.ruptures.situation)) as { situation: string; n: number }[];
  const salesFloor = situations.filter((x) => SALES_FLOOR.includes(x.situation)).reduce((t, x) => t + x.n, 0);
  const stockroom = situations.filter((x) => STOCKROOM.includes(x.situation)).reduce((t, x) => t + x.n, 0);

  // Quantas lojas tiveram ruptura total (nem na gôndola nem no depósito) e quantos produtos diferentes ficaram em ruptura.
  const [distinct] = (await db
    .select({
      storesTotal: sql<number>`count(distinct ${s.visits.storeId}) filter (where ${s.ruptures.situation} = 'total')::int`,
      storesAny: sql<number>`count(distinct ${s.visits.storeId})::int`,
      products: sql<number>`count(distinct ${s.ruptures.productId})::int`,
      productsTotal: sql<number>`count(distinct ${s.ruptures.productId}) filter (where ${s.ruptures.situation} = 'total')::int`,
    })
    .from(s.ruptures)
    .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(and(eq(s.ruptures.agencyId, scope.agencyId), isNull(s.ruptures.deletedAt), ...conds(scope, f)))) as { storesTotal: number; storesAny: number; products: number; productsTotal: number }[];

  // Datas críticas (vencido ou crítico) e avarias.
  const validities = (await db
    .select({ severity: s.validities.severity, location: s.validities.location, n: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${s.validities.quantity}), 0)::int` })
    .from(s.validities)
    .innerJoin(s.attendances, eq(s.attendances.id, s.validities.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(and(eq(s.validities.agencyId, scope.agencyId), isNull(s.validities.deletedAt), ...conds(scope, f)))
    .groupBy(s.validities.severity, s.validities.location)) as { severity: string; location: string; n: number; units: number }[];
  const criticalRows = validities.filter((v) => v.severity === "expired" || v.severity === "critical");
  const criticalList = (await db
    .select({ product: s.products.name, sku: s.products.sku, store: s.stores.name, expiry: s.validities.expiryDate, days: s.validities.daysToExpiry, quantity: s.validities.quantity, unit: s.validities.unit, location: s.validities.location, date: s.visits.visitDate })
    .from(s.validities)
    .innerJoin(s.attendances, eq(s.attendances.id, s.validities.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.validities.productId))
    .where(and(eq(s.validities.agencyId, scope.agencyId), isNull(s.validities.deletedAt), inArray(s.validities.severity, ["expired", "critical"]), ...conds(scope, f)))
    .orderBy(s.validities.daysToExpiry, desc(s.visits.visitDate))
    .limit(30)) as { product: string; sku: string; store: string; expiry: string; days: number; quantity: number; unit: string; location: string; date: string }[];
  const damages = (await db
    .select({ kind: s.damages.kind, n: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${s.damages.quantity}), 0)::int` })
    .from(s.damages)
    .innerJoin(s.attendances, eq(s.attendances.id, s.damages.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(and(eq(s.damages.agencyId, scope.agencyId), isNull(s.damages.deletedAt), ...conds(scope, f)))
    .groupBy(s.damages.kind)) as { kind: string; n: number; units: number }[];

  // Lojas programadas, atendidas e não atendidas no período.
  const board = await getRangeBoard(scope, { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city });
  const scheduled = board.stops.filter((st) => st.scheduleId);
  const missed = scheduled.filter((st) => st.bucket === "missed");
  const done = scheduled.filter((st) => st.bucket === "completed" || st.bucket === "exception");
  const inProgress = board.stops.filter((st) => st.bucket === "in_progress");

  const checks = byDay.reduce((t, d) => t + d.checks, 0);
  const ruptures = byDay.reduce((t, d) => t + d.ruptures, 0);
  const sortIdx = (a: Slice, b: Slice) => (b.index ?? -1) - (a.index ?? -1) || b.ruptures - a.ruptures;
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      checks,
      ruptures,
      ruptureIndex: pct(ruptures, checks),
      salesFloor,
      stockroom,
      storesTotalRupture: distinct?.storesTotal ?? 0,
      storesWithRupture: distinct?.storesAny ?? 0,
      productsInRupture: distinct?.products ?? 0,
      productsTotalRupture: distinct?.productsTotal ?? 0,
      critical: criticalRows.reduce((t, v) => t + v.n, 0),
      criticalUnits: criticalRows.reduce((t, v) => t + v.units, 0),
      expired: validities.filter((v) => v.severity === "expired").reduce((t, v) => t + v.n, 0),
      damages: damages.reduce((t, d) => t + d.n, 0),
      damageUnits: damages.reduce((t, d) => t + d.units, 0),
      storesPlanned: scheduled.length,
      storesDone: done.length,
      storesInProgress: inProgress.length,
      storesMissed: missed.length,
      coverage: pct(done.length, scheduled.length),
    },
    byChain: byChain.sort(sortIdx),
    byStore: byStore.sort(sortIdx).slice(0, 15),
    byProduct: byProduct.sort((a, b) => b.ruptures - a.ruptures || (b.index ?? 0) - (a.index ?? 0)).slice(0, 15),
    byDay: byDay.sort((a, b) => a.id.localeCompare(b.id)),
    situations,
    validities,
    criticalList,
    damages,
    missed: missed.map((st) => ({ date: st.date, store: st.storeName, city: st.city, promoter: st.promoterName, brands: st.plannedBrands.map((b) => b.name).join(", ") })),
  };
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
