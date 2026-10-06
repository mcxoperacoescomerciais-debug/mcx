/** Lista de visitas com contadores por tipo — página Visitas, página da loja e do promotor. */
import "server-only";
import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";

export interface VisitRow {
  id: string;
  visitDate: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  city: string;
  promoterId: string;
  promoterName: string;
  validity: number;
  stock: number;
  ruptures: number;
  damages: number;
  expired: number;
  critical: number;
  photos: number;
}

export async function listVisits(
  scope: Scope,
  opts: { from: string; to: string; storeId?: string; promoterId?: string; networkId?: string; city?: string; limit?: number },
): Promise<VisitRow[]> {
  const db = await getDb();
  const o = s.occurrences;
  const conds: SQL[] = [eq(s.visits.clientId, scope.clientId), gte(s.visits.visitDate, opts.from), lte(s.visits.visitDate, opts.to)];
  if (scope.promoterId) conds.push(eq(s.visits.promoterId, scope.promoterId));
  if (opts.storeId) conds.push(eq(s.visits.storeId, opts.storeId));
  if (opts.promoterId) conds.push(eq(s.visits.promoterId, opts.promoterId));
  if (opts.networkId) conds.push(eq(s.stores.networkId, opts.networkId));
  if (opts.city) conds.push(eq(s.stores.city, opts.city));
  return db
    .select({
      id: s.visits.id,
      visitDate: s.visits.visitDate,
      startedAt: s.visits.startedAt,
      finishedAt: s.visits.finishedAt,
      status: s.visits.status,
      storeId: s.stores.id,
      storeName: s.stores.name,
      storeCode: s.stores.code,
      city: s.stores.city,
      promoterId: s.users.id,
      promoterName: s.users.name,
      validity: sql<number>`count(${o.id}) filter (where ${o.type} = 'validity' and ${o.location} <> 'stock')`.mapWith(Number),
      stock: sql<number>`count(${o.id}) filter (where ${o.type} = 'validity' and ${o.location} = 'stock')`.mapWith(Number),
      ruptures: sql<number>`count(${o.id}) filter (where ${o.type} = 'rupture')`.mapWith(Number),
      damages: sql<number>`count(${o.id}) filter (where ${o.type} = 'damage')`.mapWith(Number),
      expired: sql<number>`count(${o.id}) filter (where ${o.severity} = 'expired')`.mapWith(Number),
      critical: sql<number>`count(${o.id}) filter (where ${o.severity} = 'critical')`.mapWith(Number),
      photos: sql<number>`(select count(*) from ${s.occurrencePhotos} where ${s.occurrencePhotos.visitId} = ${s.visits.id})`.mapWith(Number),
    })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .leftJoin(o, and(eq(o.visitId, s.visits.id), sql`${o.deletedAt} is null`))
    .where(and(...conds))
    .groupBy(s.visits.id, s.stores.id, s.users.id)
    .orderBy(desc(s.visits.visitDate), desc(s.visits.startedAt))
    .limit(opts.limit ?? 500);
}
