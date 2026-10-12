/**
 * Consultas de período (histórico de visitas e atendimentos) usadas pelas
 * páginas de promotor, loja e relatórios. Paginadas e filtradas no servidor.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import type { PanelFilters } from "@/lib/filters";

export async function listPromoters(scope: Scope) {
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name, region: s.users.region, employment: s.users.employment, status: s.users.status, managerId: s.users.managerId, internalCode: s.users.internalCode })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), promoterFilter(scope, s.users.id)))
    .orderBy(asc(s.users.name));
}

type F = Pick<PanelFilters, "from" | "to" | "brand" | "chain" | "store" | "promoter" | "city">;

/** Visitas do período com os atendimentos (no escopo). */
export async function listVisits(scope: Scope, f: F, limit = 300) {
  const db = await getDb();
  const conds: (SQL | undefined)[] = [
    eq(s.visits.agencyId, scope.agencyId),
    gte(s.visits.visitDate, f.from),
    lte(s.visits.visitDate, f.to),
    ne(s.visits.status, "cancelled"),
    promoterFilter(scope, s.visits.promoterId),
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
  ];
  const visits = await db
    .select({
      id: s.visits.id,
      date: s.visits.visitDate,
      status: s.visits.status,
      origin: s.visits.origin,
      startedAt: s.visits.startedAt,
      finishedAt: s.visits.finishedAt,
      closeReason: s.visits.closeReason,
      storeId: s.stores.id,
      storeName: s.stores.name,
      chainName: s.chains.name,
      city: s.stores.city,
      promoterId: s.users.id,
      promoterName: s.users.name,
    })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(and(...conds))
    .orderBy(desc(s.visits.startedAt))
    .limit(limit);
  if (!visits.length) return [];
  const atts = await db
    .select({
      id: s.attendances.id,
      visitId: s.attendances.visitId,
      brandId: s.attendances.brandId,
      brandName: s.brands.name,
      status: s.attendances.status,
      startedAt: s.attendances.startedAt,
      finishedAt: s.attendances.finishedAt,
      exceptionItems: s.attendances.exceptionItems,
      ruptures: sql<number>`(select count(*)::int from ${s.ruptures} r where r.attendance_id = ${s.attendances.id} and r.deleted_at is null)`,
      photos: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.deleted_at is null)`,
    })
    .from(s.attendances)
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .where(and(inArray(s.attendances.visitId, visits.map((v) => v.id)), brandFilter(scope, s.attendances.brandId), f.brand ? eq(s.attendances.brandId, f.brand) : undefined))
    .orderBy(asc(s.attendances.startedAt));
  return visits
    .map((v) => ({ ...v, attendances: atts.filter((a) => a.visitId === v.id) }))
    .filter((v) => (scope.brandIds === null && !f.brand) || v.attendances.length > 0);
}
