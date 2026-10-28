/**
 * Execução das marcas no período (todas as do acesso, ou uma filtrada): previsto (programação) × realizado
 * (atendimentos), lojas atendidas, pendências e evolução diária.
 */
import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { listVisits } from "./history";
import { listIssues } from "./issues";
import { brandFilter, promoterFilter } from "./scope";
import type { PanelFilters } from "@/lib/filters";
import { expectedInRange } from "@/lib/portfolio";
import { filterIn } from "@/server/filter-sql";

export async function brandExecution(scope: Scope, f: PanelFilters) {
  const db = await getDb();
  const [planned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.scheduleBrands)
    .innerJoin(s.schedules, eq(s.schedules.id, s.scheduleBrands.scheduleId))
    .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
    .where(
      and(
        f.brand ? filterIn(s.scheduleBrands.brandId, f.brand) : brandFilter(scope, s.scheduleBrands.brandId),
        eq(s.schedules.agencyId, scope.agencyId),
        eq(s.schedules.status, "active"),
        gte(s.schedules.date, f.from),
        lte(s.schedules.date, f.to),
        promoterFilter(scope, s.schedules.promoterId),
        f.promoter ? filterIn(s.schedules.promoterId, f.promoter) : undefined,
        f.chain ? filterIn(s.stores.chainId, f.chain) : undefined,
        f.city ? filterIn(s.stores.city, f.city) : undefined,
      ),
    );
  // Previsto = o que foi ATRIBUÍDO (vezes por semana/quinzena/mês × dias do período); sem atribuições, a programação.
  const targets = await db
    .select({ perWeek: s.visitTargets.perWeek, period: s.visitTargets.period })
    .from(s.visitTargets)
    .innerJoin(s.stores, eq(s.stores.id, s.visitTargets.storeId))
    .innerJoin(s.users, eq(s.users.id, s.visitTargets.promoterId))
    .where(
      and(
        eq(s.visitTargets.agencyId, scope.agencyId),
        eq(s.users.status, "active"),
        f.brand ? filterIn(s.visitTargets.brandId, f.brand) : brandFilter(scope, s.visitTargets.brandId),
        promoterFilter(scope, s.visitTargets.promoterId),
        f.promoter ? filterIn(s.visitTargets.promoterId, f.promoter) : undefined,
        f.chain ? filterIn(s.stores.chainId, f.chain) : undefined,
        f.city ? filterIn(s.stores.city, f.city) : undefined,
      ),
    );
  const fromTargets = Math.round(targets.reduce((n, t) => n + expectedInRange(t.perWeek, t.period, f.from, f.to), 0));
  const [visits, issues] = await Promise.all([listVisits(scope, f, 5000), listIssues(scope, f)]);
  const attendances = visits
    .flatMap((v) => v.attendances.map((a) => ({ ...a, date: v.date, storeId: v.storeId, storeName: v.storeName, city: v.city, promoterName: v.promoterName })))
    .sort((a, b) => (a.date === b.date ? b.startedAt.getTime() - a.startedAt.getTime() : b.date.localeCompare(a.date)));
  const completed = attendances.filter((a) => a.status === "completed");
  const daily = new Map<string, number>();
  for (const a of completed) daily.set(a.date, (daily.get(a.date) ?? 0) + 1);
  return {
    planned: targets.length ? fromTargets : (planned?.n ?? 0),
    plannedSource: targets.length ? ("assignments" as const) : ("schedule" as const),
    attendances,
    completed: completed.length,
    storesServed: new Set(completed.map((a) => a.storeId)).size,
    issues,
    daily: [...daily.entries()].map(([date, n]) => ({ date, n })),
  };
}
