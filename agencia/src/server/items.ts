/**
 * Validades e avarias (modo SUINCO) no painel: listas paginadas, resumos e
 * planilhas. Sempre no escopo do usuário (agência + marcas + promotores) e
 * filtradas pelo período da visita — tela, Excel e PDF mostram os mesmos números.
 */
import "server-only";
import { and, desc, asc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { PAGE_SIZE, type PanelFilters } from "@/lib/filters";
import { DAMAGE_KIND_LABEL, VALIDITY_LOCATION_LABEL, type DamageKind, type ValidityLocation } from "@/lib/domain";
import { daysBetween, fmtDateTime, todayIso } from "@/lib/dates";
import { SEVERITIES, SEVERITY_LABEL, type Severity } from "@/lib/validity";
import type { SheetSpec } from "./xlsx";

type F = PanelFilters;

function conds(scope: Scope, f: F): (SQL | undefined)[] {
  return [
    gte(s.visits.visitDate, f.from),
    lte(s.visits.visitDate, f.to),
    brandFilter(scope, s.attendances.brandId),
    promoterFilter(scope, s.visits.promoterId),
    f.brand ? eq(s.attendances.brandId, f.brand) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
    f.q ? sql`(lower(${s.products.name}) like ${`%${f.q.toLowerCase()}%`} or lower(${s.products.sku}) like ${`%${f.q.toLowerCase()}%`})` : undefined,
  ];
}

// ───────────────────────────── Validades ─────────────────────────────

/** status = severidade ("urgent" = vencido + crítico); kind = local (área de vendas / estoque). */
export async function validityList(scope: Scope, f: F, opts: { page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const pageSize = opts.pageSize ?? f.pageSize ?? PAGE_SIZE;
  const where = and(
    eq(s.validities.agencyId, scope.agencyId),
    isNull(s.validities.deletedAt),
    f.status === "urgent" ? sql`${s.validities.severity} in ('expired','critical')` : f.status && (SEVERITIES as readonly string[]).includes(f.status) ? eq(s.validities.severity, f.status as Severity) : undefined,
    f.kind === "sales_floor" || f.kind === "stock" ? eq(s.validities.location, f.kind as ValidityLocation) : undefined,
    ...conds(scope, f),
  );
  const rows = await db
    .select({
      id: s.validities.id,
      attendanceId: s.validities.attendanceId,
      location: s.validities.location,
      quantity: s.validities.quantity,
      unit: s.validities.unit,
      expiryDate: s.validities.expiryDate,
      daysToExpiry: s.validities.daysToExpiry,
      severity: s.validities.severity,
      lot: s.validities.lot,
      price: s.validities.price,
      note: s.validities.note,
      recordedAt: s.validities.recordedAt,
      visitDate: s.visits.visitDate,
      productName: s.products.name,
      sku: s.products.sku,
      brandName: s.brands.name,
      storeId: s.stores.id,
      storeName: s.stores.name,
      city: s.stores.city,
      promoterName: s.users.name,
      photos: sql<number>`(select count(*)::int from ${s.photos} p where p.validity_id = ${s.validities.id} and p.deleted_at is null)`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(s.validities)
    .innerJoin(s.attendances, eq(s.attendances.id, s.validities.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.validities.productId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(where)
    .orderBy(asc(s.validities.expiryDate), desc(s.visits.visitDate))
    .limit(pageSize)
    .offset(((opts.page ?? f.page) - 1) * pageSize);
  const today = todayIso();
  return { rows: rows.map((r) => ({ ...r, daysFromToday: daysBetween(today, r.expiryDate) })), total: rows[0]?.total ?? 0 };
}

export async function validitySummary(scope: Scope, f: F) {
  const db = await getDb();
  const rows = await db
    .select({ severity: s.validities.severity, n: sql<number>`count(*)::int`, units: sql<number>`coalesce(sum(${s.validities.quantity}),0)::int`, stores: sql<number>`count(distinct ${s.visits.storeId})::int` })
    .from(s.validities)
    .innerJoin(s.attendances, eq(s.attendances.id, s.validities.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.validities.productId))
    .where(and(eq(s.validities.agencyId, scope.agencyId), isNull(s.validities.deletedAt), ...conds(scope, f)))
    .groupBy(s.validities.severity);
  const by = Object.fromEntries(SEVERITIES.map((k) => [k, rows.find((r) => r.severity === k) ?? { n: 0, units: 0, stores: 0 }])) as Record<Severity, { n: number; units: number; stores: number }>;
  return { by, total: rows.reduce((t, r) => t + r.n, 0) };
}

/** Visão geral: produtos (loja × produto) com validade vencida ou crítica no período. */
export async function criticalValidities(scope: Scope, from: string, to: string): Promise<{ products: number; expired: number; critical: number }> {
  const db = await getDb();
  const f = { from, to, brand: null, store: null, promoter: null, chain: null, city: null, q: "" } as unknown as F;
  const [r] = await db
    .select({
      products: sql<number>`count(distinct (${s.visits.storeId}, ${s.validities.productId}))::int`,
      expired: sql<number>`count(distinct (${s.visits.storeId}, ${s.validities.productId})) filter (where ${s.validities.severity} = 'expired')::int`,
      critical: sql<number>`count(distinct (${s.visits.storeId}, ${s.validities.productId})) filter (where ${s.validities.severity} = 'critical')::int`,
    })
    .from(s.validities)
    .innerJoin(s.attendances, eq(s.attendances.id, s.validities.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.validities.productId))
    .where(and(eq(s.validities.agencyId, scope.agencyId), isNull(s.validities.deletedAt), sql`${s.validities.severity} in ('expired','critical')`, ...conds(scope, f)));
  return { products: r?.products ?? 0, expired: r?.expired ?? 0, critical: r?.critical ?? 0 };
}

export function validitiesSheet(rows: Awaited<ReturnType<typeof validityList>>["rows"]): SheetSpec {
  return {
    name: "Validades",
    columns: [
      { header: "Data da visita", key: "date", width: 12 },
      { header: "Loja", key: "store", width: 30 },
      { header: "Cidade", key: "city", width: 16 },
      { header: "Marca", key: "brand", width: 16 },
      { header: "Produto", key: "product", width: 36 },
      { header: "SKU", key: "sku" },
      { header: "Local", key: "location", width: 14 },
      { header: "Validade", key: "expiry", width: 12 },
      { header: "Dias (na visita)", key: "days" },
      { header: "Situação", key: "severity", width: 14 },
      { header: "Quantidade", key: "qty" },
      { header: "Unidade", key: "unit" },
      { header: "Preço (R$)", key: "price", numFmt: "#,##0.00" },
      { header: "Lote", key: "lot" },
      { header: "Observação", key: "note", width: 30 },
      { header: "Promotor", key: "promoter", width: 22 },
      { header: "Registrado em", key: "at", width: 18 },
    ],
    rows: rows.map((r) => ({
      date: r.visitDate,
      store: r.storeName,
      city: r.city,
      brand: r.brandName,
      product: r.productName,
      sku: r.sku,
      location: VALIDITY_LOCATION_LABEL[r.location],
      expiry: r.expiryDate,
      days: r.daysToExpiry,
      severity: SEVERITY_LABEL[r.severity],
      qty: r.quantity,
      unit: r.unit,
      price: r.price === null ? null : Number(r.price),
      lot: r.lot,
      note: r.note,
      promoter: r.promoterName,
      at: fmtDateTime(r.recordedAt),
    })),
  };
}

// ───────────────────────────── Avarias ─────────────────────────────

/** kind = tipo da avaria. */
export async function damageList(scope: Scope, f: F, opts: { page?: number; pageSize?: number } = {}) {
  const db = await getDb();
  const pageSize = opts.pageSize ?? f.pageSize ?? PAGE_SIZE;
  const where = and(
    eq(s.damages.agencyId, scope.agencyId),
    isNull(s.damages.deletedAt),
    f.kind && f.kind in DAMAGE_KIND_LABEL ? eq(s.damages.kind, f.kind as DamageKind) : undefined,
    ...conds(scope, f),
  );
  const rows = await db
    .select({
      id: s.damages.id,
      attendanceId: s.damages.attendanceId,
      kind: s.damages.kind,
      quantity: s.damages.quantity,
      unit: s.damages.unit,
      expiryDate: s.damages.expiryDate,
      lot: s.damages.lot,
      note: s.damages.note,
      recordedAt: s.damages.recordedAt,
      visitDate: s.visits.visitDate,
      productName: s.products.name,
      sku: s.products.sku,
      brandName: s.brands.name,
      storeId: s.stores.id,
      storeName: s.stores.name,
      city: s.stores.city,
      promoterName: s.users.name,
      photos: sql<number>`(select count(*)::int from ${s.photos} p where p.damage_id = ${s.damages.id} and p.deleted_at is null)`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(s.damages)
    .innerJoin(s.attendances, eq(s.attendances.id, s.damages.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.damages.productId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(where)
    .orderBy(desc(s.damages.recordedAt))
    .limit(pageSize)
    .offset(((opts.page ?? f.page) - 1) * pageSize);
  return { rows, total: rows[0]?.total ?? 0 };
}

export async function damageSummary(scope: Scope, f: F) {
  const db = await getDb();
  const [t] = await db
    .select({
      n: sql<number>`count(*)::int`,
      units: sql<number>`coalesce(sum(${s.damages.quantity}),0)::int`,
      stores: sql<number>`count(distinct ${s.visits.storeId})::int`,
      products: sql<number>`count(distinct ${s.damages.productId})::int`,
    })
    .from(s.damages)
    .innerJoin(s.attendances, eq(s.attendances.id, s.damages.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.products, eq(s.products.id, s.damages.productId))
    .where(and(eq(s.damages.agencyId, scope.agencyId), isNull(s.damages.deletedAt), ...conds(scope, f)));
  return t ?? { n: 0, units: 0, stores: 0, products: 0 };
}

export function damagesSheet(rows: Awaited<ReturnType<typeof damageList>>["rows"]): SheetSpec {
  return {
    name: "Avarias",
    columns: [
      { header: "Data da visita", key: "date", width: 12 },
      { header: "Loja", key: "store", width: 30 },
      { header: "Cidade", key: "city", width: 16 },
      { header: "Marca", key: "brand", width: 16 },
      { header: "Produto", key: "product", width: 36 },
      { header: "SKU", key: "sku" },
      { header: "Tipo", key: "kind", width: 22 },
      { header: "Quantidade", key: "qty" },
      { header: "Unidade", key: "unit" },
      { header: "Validade", key: "expiry", width: 12 },
      { header: "Lote", key: "lot" },
      { header: "Fotos", key: "photos" },
      { header: "Observação", key: "note", width: 30 },
      { header: "Promotor", key: "promoter", width: 22 },
      { header: "Registrado em", key: "at", width: 18 },
    ],
    rows: rows.map((r) => ({
      date: r.visitDate,
      store: r.storeName,
      city: r.city,
      brand: r.brandName,
      product: r.productName,
      sku: r.sku,
      kind: DAMAGE_KIND_LABEL[r.kind],
      qty: r.quantity,
      unit: r.unit,
      expiry: r.expiryDate,
      lot: r.lot,
      photos: r.photos,
      note: r.note,
      promoter: r.promoterName,
      at: fmtDateTime(r.recordedAt),
    })),
  };
}
