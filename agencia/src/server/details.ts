/**
 * Detalhes de visita e de atendimento para o painel — sempre conferindo o
 * escopo: um gestor restrito a uma marca nunca recebe dados de outra, e um id
 * fora do escopo se comporta como inexistente (404).
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, canSeeBrand, canSeePromoter } from "./scope";
import { trackedProducts } from "./promoter";

export async function getAttendanceDetail(scope: Scope, attendanceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      attendance: s.attendances,
      visit: s.visits,
      brand: s.brands,
      store: s.stores,
      chainName: s.chains.name,
      promoterName: s.users.name,
      promoterEmployment: s.users.employment,
    })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(and(eq(s.attendances.id, attendanceId), eq(s.attendances.agencyId, scope.agencyId)));
  if (!row || !canSeeBrand(scope, row.attendance.brandId) || !canSeePromoter(scope, row.visit.promoterId)) return null;

  const tracked = await trackedProducts(db, row.store.id, row.brand.id);
  const [photos, stock, products, unregistered, ruptures, occurrences, corrections, history, reviewer, validities, damages] = await Promise.all([
    db.select().from(s.photos).where(eq(s.photos.attendanceId, attendanceId)).orderBy(asc(s.photos.takenAt)),
    db.select().from(s.stockEntries).where(eq(s.stockEntries.attendanceId, attendanceId)),
    db.select().from(s.products).where(eq(s.products.brandId, row.brand.id)).orderBy(asc(s.products.sortOrder), asc(s.products.name)),
    db.select().from(s.unregisteredProducts).where(and(eq(s.unregisteredProducts.attendanceId, attendanceId), isNull(s.unregisteredProducts.deletedAt))),
    db
      .select({ rupture: s.ruptures, productName: s.products.name, sku: s.products.sku })
      .from(s.ruptures)
      .innerJoin(s.products, eq(s.products.id, s.ruptures.productId))
      .where(and(eq(s.ruptures.attendanceId, attendanceId), isNull(s.ruptures.deletedAt))),
    db.select().from(s.occurrences).where(and(eq(s.occurrences.attendanceId, attendanceId), isNull(s.occurrences.deletedAt))),
    db
      .select({ c: s.correctionRequests, requestedByName: s.users.name })
      .from(s.correctionRequests)
      .innerJoin(s.users, eq(s.users.id, s.correctionRequests.requestedBy))
      .where(eq(s.correctionRequests.attendanceId, attendanceId))
      .orderBy(desc(s.correctionRequests.requestedAt)),
    db
      .select({ log: s.auditLogs, userName: s.users.name })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
      .where(and(eq(s.auditLogs.agencyId, scope.agencyId), or(and(eq(s.auditLogs.entity, "attendance"), eq(s.auditLogs.entityId, attendanceId)), and(eq(s.auditLogs.entity, "visit"), eq(s.auditLogs.entityId, row.visit.id)))))
      .orderBy(asc(s.auditLogs.createdAt)),
    row.attendance.reviewedBy ? db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, row.attendance.reviewedBy)) : Promise.resolve([]),
    db
      .select({ v: s.validities, productName: s.products.name, sku: s.products.sku })
      .from(s.validities)
      .innerJoin(s.products, eq(s.products.id, s.validities.productId))
      .where(and(eq(s.validities.attendanceId, attendanceId), isNull(s.validities.deletedAt)))
      .orderBy(asc(s.validities.daysToExpiry)),
    db
      .select({ d: s.damages, productName: s.products.name, sku: s.products.sku })
      .from(s.damages)
      .innerJoin(s.products, eq(s.products.id, s.damages.productId))
      .where(and(eq(s.damages.attendanceId, attendanceId), isNull(s.damages.deletedAt))),
  ]);
  const photoHistory = photos.filter((p) => p.deletedAt);
  const live = photos.filter((p) => !p.deletedAt);
  const trackedSet = new Set(tracked);
  const stockRows = products
    .filter((p) => trackedSet.has(p.id) || stock.some((x) => x.productId === p.id))
    .map((p) => ({ product: p, entry: stock.find((x) => x.productId === p.id) ?? null }));
  // Último registro anterior do mesmo produto na mesma loja (para comparar).
  const previous = await previousStock(row.store.id, row.brand.id, row.visit.visitDate, row.attendance.id);

  return {
    ...row,
    photos: live,
    removedPhotos: photoHistory,
    stockRows,
    previous,
    unregistered,
    ruptures,
    validities,
    damages,
    occurrences,
    corrections,
    history,
    reviewerName: reviewer[0]?.name ?? null,
  };
}

async function previousStock(storeId: string, brandId: string, visitDate: string, attendanceId: string) {
  const db = await getDb();
  const rows = await db
    .select({ productId: s.stockEntries.productId, state: s.stockEntries.state, quantity: s.stockEntries.quantity, date: s.visits.visitDate, attendanceId: s.attendances.id })
    .from(s.stockEntries)
    .innerJoin(s.attendances, eq(s.attendances.id, s.stockEntries.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(eq(s.visits.storeId, storeId), eq(s.attendances.brandId, brandId), eq(s.attendances.status, "completed")))
    .orderBy(desc(s.visits.visitDate), desc(s.stockEntries.recordedAt));
  const map = new Map<string, { state: string; quantity: number | null; date: string }>();
  for (const r of rows) {
    if (r.attendanceId === attendanceId || r.date > visitDate) continue;
    if (r.date === visitDate) continue;
    if (!map.has(r.productId)) map.set(r.productId, r);
  }
  return map;
}

export async function getVisitDetail(scope: Scope, visitId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ visit: s.visits, store: s.stores, chainName: s.chains.name, promoterName: s.users.name, promoterId: s.users.id })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(and(eq(s.visits.id, visitId), eq(s.visits.agencyId, scope.agencyId)));
  if (!row || !canSeePromoter(scope, row.visit.promoterId)) return null;

  const planned = row.visit.scheduleId
    ? await db
        .select({ id: s.brands.id, name: s.brands.name })
        .from(s.scheduleBrands)
        .innerJoin(s.brands, eq(s.brands.id, s.scheduleBrands.brandId))
        .where(and(eq(s.scheduleBrands.scheduleId, row.visit.scheduleId), brandFilter(scope, s.brands.id)))
    : [];
  const [schedule] = row.visit.scheduleId ? await db.select().from(s.schedules).where(eq(s.schedules.id, row.visit.scheduleId)) : [];
  const atts = await db
    .select({ a: s.attendances, brandName: s.brands.name, minBefore: s.brands.minBeforePhotos, minAfter: s.brands.minAfterPhotos })
    .from(s.attendances)
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .where(and(eq(s.attendances.visitId, visitId), brandFilter(scope, s.attendances.brandId)));
  if (scope.brandIds !== null && !atts.length && !planned.length) return null;
  const attIds = atts.map((x) => x.a.id);
  const [photos, ruptures, stockCounts] = attIds.length
    ? await Promise.all([
        db.select().from(s.photos).where(and(inArray(s.photos.attendanceId, attIds), isNull(s.photos.deletedAt))),
        db.select({ attendanceId: s.ruptures.attendanceId }).from(s.ruptures).where(and(inArray(s.ruptures.attendanceId, attIds), isNull(s.ruptures.deletedAt))),
        db.select({ attendanceId: s.stockEntries.attendanceId, state: s.stockEntries.state }).from(s.stockEntries).where(inArray(s.stockEntries.attendanceId, attIds)),
      ])
    : [[], [], []];
  return { ...row, planned, schedule: schedule ?? null, attendances: atts, photos, ruptures, stockCounts };
}
