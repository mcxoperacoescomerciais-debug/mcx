/**
 * Tempo gasto em cada marca: do início ao fim do atendimento da marca (registrado
 * no aparelho). Base dos tempos médios por marca no promotor e na visita.
 */
import "server-only";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { stat, type Stat } from "@/lib/work-time";

/** Atendimento mais longo que isso foi deixado aberto: não entra na média. */
const MAX_MINUTES = 8 * 60;

export interface BrandTimeRow {
  attendanceId: string;
  visitId: string;
  date: string;
  storeName: string;
  city: string;
  promoterId: string;
  promoterName: string;
  minutes: number;
  status: string;
}

export interface BrandTime extends Stat {
  brandId: string;
  brandName: string;
  totalMinutes: number;
  rows: BrandTimeRow[];
}

export async function brandTimes(scope: Scope, f: { from: string; to: string; promoterId?: string | null; brandIds?: string[] }): Promise<BrandTime[]> {
  const db = await getDb();
  const rows = await db
    .select({
      attendanceId: s.attendances.id,
      visitId: s.attendances.visitId,
      brandId: s.attendances.brandId,
      brandName: s.brands.name,
      startedAt: s.attendances.startedAt,
      finishedAt: s.attendances.finishedAt,
      status: s.attendances.status,
      date: s.visits.visitDate,
      storeName: s.stores.name,
      city: s.stores.city,
      promoterId: s.visits.promoterId,
      promoterName: s.users.name,
    })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(
      and(
        eq(s.attendances.agencyId, scope.agencyId),
        eq(s.attendances.status, "completed"),
        isNotNull(s.attendances.finishedAt),
        gte(s.visits.visitDate, f.from),
        lte(s.visits.visitDate, f.to),
        brandFilter(scope, s.attendances.brandId),
        promoterFilter(scope, s.visits.promoterId),
        f.promoterId ? eq(s.visits.promoterId, f.promoterId) : undefined,
        f.brandIds?.length ? inArray(s.attendances.brandId, f.brandIds) : undefined,
      ),
    );
  const by = new Map<string, { brandName: string; rows: BrandTimeRow[] }>();
  for (const r of rows) {
    const minutes = Math.round((r.finishedAt!.getTime() - r.startedAt.getTime()) / 60_000);
    if (minutes < 0 || minutes > MAX_MINUTES) continue;
    const g = by.get(r.brandId) ?? { brandName: r.brandName, rows: [] };
    g.rows.push({ attendanceId: r.attendanceId, visitId: r.visitId, date: r.date, storeName: r.storeName, city: r.city, promoterId: r.promoterId, promoterName: r.promoterName, minutes, status: r.status });
    by.set(r.brandId, g);
  }
  return [...by]
    .map(([brandId, g]) => {
      g.rows.sort((a, b) => b.date.localeCompare(a.date) || b.minutes - a.minutes);
      const st = stat(g.rows.map((x) => x.minutes));
      return { brandId, brandName: g.brandName, ...st, totalMinutes: g.rows.reduce((t, x) => t + x.minutes, 0), rows: g.rows };
    })
    .sort((a, b) => b.n - a.n || (b.avg ?? 0) - (a.avg ?? 0));
}
