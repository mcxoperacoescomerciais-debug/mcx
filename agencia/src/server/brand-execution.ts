/**
 * Execução de UMA marca no período: previsto (programação) × realizado
 * (atendimentos), lojas atendidas, pendências e evolução diária.
 */
import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { listVisits } from "./history";
import { listIssues } from "./issues";
import { promoterFilter } from "./scope";
import type { PanelFilters } from "@/lib/filters";

export async function brandExecution(scope: Scope, f: PanelFilters & { brand: string }) {
  const db = await getDb();
  const [planned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.scheduleBrands)
    .innerJoin(s.schedules, eq(s.schedules.id, s.scheduleBrands.scheduleId))
    .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
    .where(
      and(
        eq(s.scheduleBrands.brandId, f.brand),
        eq(s.schedules.agencyId, scope.agencyId),
        eq(s.schedules.status, "active"),
        gte(s.schedules.date, f.from),
        lte(s.schedules.date, f.to),
        promoterFilter(scope, s.schedules.promoterId),
        f.promoter ? eq(s.schedules.promoterId, f.promoter) : undefined,
        f.chain ? eq(s.stores.chainId, f.chain) : undefined,
        f.city ? eq(s.stores.city, f.city) : undefined,
      ),
    );
  const [visits, issues] = await Promise.all([listVisits(scope, f, 5000), listIssues(scope, f)]);
  const attendances = visits
    .flatMap((v) => v.attendances.map((a) => ({ ...a, date: v.date, storeId: v.storeId, storeName: v.storeName, city: v.city, promoterName: v.promoterName })))
    .sort((a, b) => (a.date === b.date ? b.startedAt.getTime() - a.startedAt.getTime() : b.date.localeCompare(a.date)));
  const completed = attendances.filter((a) => a.status === "completed");
  const daily = new Map<string, number>();
  for (const a of completed) daily.set(a.date, (daily.get(a.date) ?? 0) + 1);
  return {
    planned: planned?.n ?? 0,
    attendances,
    completed: completed.length,
    storesServed: new Set(completed.map((a) => a.storeId)).size,
    issues,
    daily: [...daily.entries()].map(([date, n]) => ({ date, n })),
  };
}
