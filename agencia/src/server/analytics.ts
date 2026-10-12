/**
 * Análises de período: estoque informado e rupturas. Filtros, contagens e
 * paginação no banco; nenhum número é inventado — rankings só com dados reais
 * e tempo de resolução só com amostra suficiente.
 */
import "server-only";
import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { rowsOf } from "./promoter";
import { PAGE_SIZE, type PanelFilters } from "@/lib/filters";
import type { RuptureSituation, RuptureStatus, StockState, Unit } from "@/lib/domain";

type F = PanelFilters;

function commonConds(scope: Scope, f: F): (SQL | undefined)[] {
  return [
    brandFilter(scope, s.attendances.brandId),
    promoterFilter(scope, s.visits.promoterId),
    f.brand ? eq(s.attendances.brandId, f.brand) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
  ];
}

// ───────────────────────────── Estoque ─────────────────────────────

export interface StockRow {
  id: string;
  attendance_id: string;
  visit_date: string;
  state: StockState;
  quantity: number | null;
  unit: Unit;
  note: string | null;
  prev_quantity: number | null;
  prev_state: StockState | null;
  prev_date: string | null;
  divergent: boolean;
  product_id: string;
  product_name: string;
  sku: string;
  brand_name: string;
  store_id: string;
  store_name: string;
  city: string;
  promoter_name: string;
  total: number;
}

/**
 * Registros de estoque do período com o registro anterior do mesmo produto na
 * mesma loja (LAG) — base para "divergência relevante entre registros".
 * Só atendimentos concluídos (ou em correção) contam como levantamento válido.
 */
export async function stockRecords(scope: Scope, f: F, opts: { page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const pct = scope.settings.stockDivergencePct;
  const conds = and(eq(s.stockEntries.agencyId, scope.agencyId), sql`${s.attendances.status} in ('completed','correction_requested')`, lte(s.visits.visitDate, f.to), ...commonConds(scope, f));
  const stateCond =
    f.status === "divergent"
      ? sql`and flagged.divergent`
      : f.status && ["quantity", "zero", "not_found", "not_applicable"].includes(f.status)
        ? sql`and flagged.state = ${f.status}`
        : sql``;
  const q = f.q ? `%${f.q.toLowerCase()}%` : null;
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const offset = ((opts.page ?? f.page) - 1) * pageSize;
  const result = await db.execute(sql`
    with base as (
      select ${s.stockEntries.id} as id, ${s.stockEntries.attendanceId} as attendance_id, ${s.visits.visitDate}::text as visit_date,
        ${s.stockEntries.state} as state, ${s.stockEntries.quantity} as quantity, ${s.stockEntries.unit} as unit, ${s.stockEntries.note} as note,
        ${s.stockEntries.productId} as product_id, ${s.attendances.brandId} as brand_id, ${s.visits.storeId} as store_id, ${s.visits.promoterId} as promoter_id,
        lag(${s.stockEntries.quantity}) over w as prev_quantity,
        lag(${s.stockEntries.state}) over w as prev_state,
        lag(${s.visits.visitDate}::text) over w as prev_date
      from ${s.stockEntries}
      join ${s.attendances} on ${s.attendances.id} = ${s.stockEntries.attendanceId}
      join ${s.visits} on ${s.visits.id} = ${s.attendances.visitId}
      join ${s.stores} on ${s.stores.id} = ${s.visits.storeId}
      where ${conds}
      window w as (partition by ${s.visits.storeId}, ${s.stockEntries.productId} order by ${s.visits.visitDate}, ${s.stockEntries.recordedAt})
    ), flagged as (
      select base.*,
        (prev_quantity is not null and quantity is not null and ((prev_quantity = 0 and quantity >= 10) or (prev_quantity > 0 and abs(quantity - prev_quantity) * 100.0 / prev_quantity >= ${pct}))) as divergent
      from base where visit_date >= ${f.from}
    )
    select flagged.*, p.name as product_name, p.sku, b.name as brand_name, st.name as store_name, st.city, u.name as promoter_name, count(*) over() as total
    from flagged
    join products p on p.id = flagged.product_id
    join brands b on b.id = flagged.brand_id
    join stores st on st.id = flagged.store_id
    join users u on u.id = flagged.promoter_id
    where true ${stateCond} ${q ? sql`and (lower(p.name) like ${q} or lower(p.sku) like ${q} or lower(st.name) like ${q})` : sql``}
    order by flagged.visit_date desc, st.name, p.sort_order, p.name
    limit ${pageSize} offset ${offset}
  `);
  const rows = rowsOf<StockRow>(result).map((r) => ({ ...r, total: Number(r.total) }));
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function stockSummary(scope: Scope, f: F) {
  const db = await getDb();
  const conds = and(eq(s.stockEntries.agencyId, scope.agencyId), sql`${s.attendances.status} in ('completed','correction_requested')`, gte(s.visits.visitDate, f.from), lte(s.visits.visitDate, f.to), ...commonConds(scope, f));
  const [totals] = await db
    .select({
      entries: sql<number>`count(*)::int`,
      quantity: sql<number>`count(*) filter (where ${s.stockEntries.state} = 'quantity')::int`,
      zero: sql<number>`count(*) filter (where ${s.stockEntries.state} = 'zero')::int`,
      notFound: sql<number>`count(*) filter (where ${s.stockEntries.state} = 'not_found')::int`,
      notApplicable: sql<number>`count(*) filter (where ${s.stockEntries.state} = 'not_applicable')::int`,
      zeroProducts: sql<number>`count(distinct ${s.stockEntries.productId}) filter (where ${s.stockEntries.state} = 'zero')::int`,
      attendances: sql<number>`count(distinct ${s.attendances.id})::int`,
    })
    .from(s.stockEntries)
    .innerJoin(s.attendances, eq(s.attendances.id, s.stockEntries.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(conds);

  // Produtos com estoque zero mais frequente (frequência = nº de levantamentos com zero).
  const topZero = await db
    .select({
      productId: s.products.id,
      name: s.products.name,
      brand: s.brands.name,
      zeros: sql<number>`count(*) filter (where ${s.stockEntries.state} = 'zero')::int`,
      records: sql<number>`count(*)::int`,
      stores: sql<number>`count(distinct ${s.visits.storeId}) filter (where ${s.stockEntries.state} = 'zero')::int`,
    })
    .from(s.stockEntries)
    .innerJoin(s.attendances, eq(s.attendances.id, s.stockEntries.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.stockEntries.productId))
    .innerJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .where(conds)
    .groupBy(s.products.id, s.products.name, s.brands.name)
    .having(sql`count(*) filter (where ${s.stockEntries.state} = 'zero') > 0`)
    .orderBy(desc(sql`count(*) filter (where ${s.stockEntries.state} = 'zero')`), asc(s.products.name))
    .limit(10);

  // Produtos acompanhados sem informação em atendimentos concluídos (normalmente por exceção justificada).
  const missing = await db.execute(sql`
    select count(*)::int as n from (
      select ${s.attendances.id} as att, ${s.visits.storeId} as store_id, ${s.attendances.brandId} as brand_id
      from ${s.attendances}
      join ${s.visits} on ${s.visits.id} = ${s.attendances.visitId}
      join ${s.stores} on ${s.stores.id} = ${s.visits.storeId}
      where ${and(eq(s.attendances.agencyId, scope.agencyId), sql`${s.attendances.status} in ('completed','correction_requested')`, gte(s.visits.visitDate, f.from), lte(s.visits.visitDate, f.to), ...commonConds(scope, f))}
    ) a
    join products p on p.brand_id = a.brand_id and p.status = 'active'
    where (not exists (select 1 from store_products sp join products p2 on p2.id = sp.product_id where sp.store_id = a.store_id and p2.brand_id = a.brand_id)
           or exists (select 1 from store_products sp where sp.store_id = a.store_id and sp.product_id = p.id))
      and not exists (select 1 from stock_entries se where se.attendance_id = a.att and se.product_id = p.id)
  `);
  const divergences = await stockRecords(scope, { ...f, status: "divergent", q: "" }, { page: 1, pageSize: 1 });
  return { ...totals, topZero, missingInfo: rowsOf<{ n: number }>(missing)[0]?.n ?? 0, divergences: divergences.total };
}

// ───────────────────────────── Ruptura ─────────────────────────────

export async function ruptureList(scope: Scope, f: F, opts: { page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const conds = and(
    eq(s.ruptures.agencyId, scope.agencyId),
    isNull(s.ruptures.deletedAt),
    gte(s.visits.visitDate, f.from),
    lte(s.visits.visitDate, f.to),
    f.status === "open" ? sql`${s.ruptures.status} in ('new','analysis','treatment')` : f.status ? eq(s.ruptures.status, f.status as RuptureStatus) : undefined,
    f.kind ? eq(s.ruptures.situation, f.kind as RuptureSituation) : undefined,
    f.q ? sql`(lower(${s.products.name}) like ${`%${f.q.toLowerCase()}%`} or lower(${s.products.sku}) like ${`%${f.q.toLowerCase()}%`})` : undefined,
    ...commonConds(scope, f),
  );
  const rows = await db
    .select({
      id: s.ruptures.id,
      status: s.ruptures.status,
      situation: s.ruptures.situation,
      knownStock: s.ruptures.knownStock,
      note: s.ruptures.note,
      recordedAt: s.ruptures.recordedAt,
      resolvedAt: s.ruptures.resolvedAt,
      resolutionAction: s.ruptures.resolutionAction,
      fromStock: s.ruptures.fromStockSuggestion,
      visitDate: s.visits.visitDate,
      attendanceId: s.attendances.id,
      productName: s.products.name,
      sku: s.products.sku,
      brandName: s.brands.name,
      storeName: s.stores.name,
      city: s.stores.city,
      promoterName: s.users.name,
      photos: sql<number>`(select count(*)::int from ${s.photos} p where p.rupture_id = ${s.ruptures.id} and p.deleted_at is null)`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(s.ruptures)
    .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.ruptures.productId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(conds)
    .orderBy(desc(s.ruptures.recordedAt))
    .limit(pageSize)
    .offset(((opts.page ?? f.page) - 1) * pageSize);
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function ruptureSummary(scope: Scope, f: F) {
  const db = await getDb();
  const base = and(eq(s.ruptures.agencyId, scope.agencyId), isNull(s.ruptures.deletedAt), gte(s.visits.visitDate, f.from), lte(s.visits.visitDate, f.to), ...commonConds(scope, f));
  const sel = (fields: Record<string, SQL | unknown>) =>
    db
      .select(fields as never)
      .from(s.ruptures)
      .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
      .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
      .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId));

  const [totals] = (await sel({
    total: sql<number>`count(*)::int`,
    new: sql<number>`count(*) filter (where ${s.ruptures.status} = 'new')::int`,
    analysis: sql<number>`count(*) filter (where ${s.ruptures.status} = 'analysis')::int`,
    treatment: sql<number>`count(*) filter (where ${s.ruptures.status} = 'treatment')::int`,
    resolved: sql<number>`count(*) filter (where ${s.ruptures.status} = 'resolved')::int`,
    notConfirmed: sql<number>`count(*) filter (where ${s.ruptures.status} = 'not_confirmed')::int`,
    closed: sql<number>`count(*) filter (where ${s.ruptures.status} = 'closed')::int`,
    unconfirmedSituation: sql<number>`count(*) filter (where ${s.ruptures.situation} = 'unconfirmed')::int`,
    resolvedWithTime: sql<number>`count(*) filter (where ${s.ruptures.status} = 'resolved' and ${s.ruptures.resolvedAt} is not null)::int`,
    avgHours: sql<number | null>`avg(extract(epoch from (${s.ruptures.resolvedAt} - ${s.ruptures.recordedAt})) / 3600) filter (where ${s.ruptures.status} = 'resolved' and ${s.ruptures.resolvedAt} is not null)`,
  }).where(base)) as unknown as {
    total: number;
    new: number;
    analysis: number;
    treatment: number;
    resolved: number;
    notConfirmed: number;
    closed: number;
    unconfirmedSituation: number;
    resolvedWithTime: number;
    avgHours: number | null;
  }[];

  const ranking = async (col: SQL, name: SQL) =>
    (await sel({ id: col, name, n: sql<number>`count(*)::int`, stores: sql<number>`count(distinct ${s.visits.storeId})::int` })
      .innerJoin(s.products, eq(s.products.id, s.ruptures.productId))
      .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
      .where(base)
      .groupBy(col, name)
      .orderBy(desc(sql`count(*)`))
      .limit(10)) as unknown as { id: string; name: string; n: number; stores: number }[];

  const [products, stores, brands] = await Promise.all([
    ranking(sql`${s.products.id}`, sql`${s.products.name}`),
    ranking(sql`${s.stores.id}`, sql`${s.stores.name}`),
    ranking(sql`${s.brands.id}`, sql`${s.brands.name}`),
  ]);

  const daily = (await sel({ date: sql<string>`${s.visits.visitDate}::text`, n: sql<number>`count(*)::int` })
    .where(base)
    .groupBy(s.visits.visitDate)
    .orderBy(asc(s.visits.visitDate))) as unknown as { date: string; n: number }[];

  // Recorrência: mesmo produto na mesma loja em 2+ visitas diferentes no período.
  const recurrent = (await sel({ product: sql<string>`${s.products.name}`, store: sql<string>`${s.stores.name}`, n: sql<number>`count(distinct ${s.visits.id})::int` })
    .innerJoin(s.products, eq(s.products.id, s.ruptures.productId))
    .where(base)
    .groupBy(s.products.name, s.stores.name)
    .having(sql`count(distinct ${s.visits.id}) >= 2`)
    .orderBy(desc(sql`count(distinct ${s.visits.id})`))
    .limit(10)) as unknown as { product: string; store: string; n: number }[];

  return { totals, products, stores, brands, daily, recurrent };
}

// ───────────────────────────── Relatório fotográfico ─────────────────────────────

export async function photoReport(scope: Scope, f: F, pageSize = 24) {
  const db = await getDb();
  const incomplete = sql`(
    (select count(*) from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = 'before' and p.deleted_at is null) < ${s.brands.minBeforePhotos}
    or (select count(*) from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = 'after' and p.deleted_at is null) < ${s.brands.minAfterPhotos}
    or exists (select 1 from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.uploaded_at is null and p.deleted_at is null))`;
  const conds = and(
    eq(s.attendances.agencyId, scope.agencyId),
    gte(s.visits.visitDate, f.from),
    lte(s.visits.visitDate, f.to),
    sql`${s.attendances.status} <> 'in_progress'`,
    f.status === "incomplete" ? and(sql`${s.attendances.status} <> 'cancelled'`, incomplete) : f.status ? eq(s.attendances.status, f.status as never) : undefined,
    f.kind ? sql`exists (select 1 from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = ${f.kind} and p.deleted_at is null)` : undefined,
    ...commonConds(scope, f),
  );
  const rows = await db
    .select({
      id: s.attendances.id,
      status: s.attendances.status,
      date: s.visits.visitDate,
      brandName: s.brands.name,
      storeName: s.stores.name,
      chainName: s.chains.name,
      promoterName: s.users.name,
      finishedAt: s.attendances.finishedAt,
      total: sql<number>`count(*) over()::int`,
    })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(conds)
    .orderBy(desc(s.visits.visitDate), desc(s.attendances.finishedAt))
    .limit(pageSize)
    .offset((f.page - 1) * pageSize);
  const photos = rows.length
    ? await db
        .select({ id: s.photos.id, attendanceId: s.photos.attendanceId, kind: s.photos.kind, takenAt: s.photos.takenAt, uploadedAt: s.photos.uploadedAt, source: s.photos.source })
        .from(s.photos)
        .where(and(sql`${s.photos.attendanceId} in (${sql.join(rows.map((r) => sql`${r.id}`), sql`, `)})`, isNull(s.photos.deletedAt)))
        .orderBy(asc(s.photos.takenAt))
    : [];
  return { rows: rows.map((r) => ({ ...r, photos: photos.filter((p) => p.attendanceId === r.id) })), total: rows[0]?.total ?? 0 };
}
