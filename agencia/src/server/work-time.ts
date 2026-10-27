/** Tempo de trabalho dos promotores no período (tempo em loja, deslocamento, jornada). */
import "server-only";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { promoterFilter } from "./scope";
import { todayIso } from "@/lib/dates";
import { workSummary, type WorkSummary, type WorkVisit } from "@/lib/work-time";

export async function workTimes(scope: Scope, from: string, to: string, promoterId?: string): Promise<Map<string, WorkSummary>> {
  const db = await getDb();
  const rows = await db
    .select({ promoterId: s.visits.promoterId, date: s.visits.visitDate, startedAt: s.visits.startedAt, finishedAt: s.visits.finishedAt, status: s.visits.status })
    .from(s.visits)
    .where(
      and(
        eq(s.visits.agencyId, scope.agencyId),
        gte(s.visits.visitDate, from),
        lte(s.visits.visitDate, to),
        ne(s.visits.status, "cancelled"),
        promoterFilter(scope, s.visits.promoterId),
        promoterId ? eq(s.visits.promoterId, promoterId) : undefined,
      ),
    );
  const by = new Map<string, WorkVisit[]>();
  for (const r of rows) by.set(r.promoterId, [...(by.get(r.promoterId) ?? []), r]);
  const today = todayIso();
  const now = new Date();
  return new Map([...by].map(([id, list]) => [id, workSummary(list, today, now)]));
}
