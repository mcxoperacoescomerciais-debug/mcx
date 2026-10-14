/**
 * Carteira com meta semanal no painel: metas (promotor × loja × marca × visitas
 * por semana) e o realizado da semana, com o ritmo esperado até hoje.
 */
import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { brandFilter, promoterFilter } from "./scope";
import type { ActionResult } from "./manager";
import type { PanelFilters } from "@/lib/filters";
import { todayIso } from "@/lib/dates";
import { effectiveWorkMode, expectedByToday, targetStatus, weekEnd, weekStart, weekTotals, type TargetStatus } from "@/lib/portfolio";

const fail = (error: string): ActionResult => ({ ok: false, error });

function canManage(scope: Scope): boolean {
  return (scope.role === "admin" || scope.role === "manager") && scope.brandIds === null;
}

export interface PortfolioRow {
  id: string;
  promoterId: string;
  promoterName: string;
  storeId: string;
  storeName: string;
  city: string;
  brandId: string;
  brandName: string;
  perWeek: number;
  done: number;
  expected: number;
  status: TargetStatus;
  lastVisit: string | null;
}

/** Semana que contém `ref` (segunda a domingo); "hoje" para o ritmo = o menor entre hoje e o domingo. */
export async function portfolioWeek(scope: Scope, f: Pick<PanelFilters, "date" | "promoter" | "brand" | "store" | "city">) {
  const db = await getDb();
  const from = weekStart(f.date);
  const to = weekEnd(f.date);
  const today = todayIso();
  const ref = today < from ? from : today > to ? to : today;
  const targets = await db
    .select({
      id: s.visitTargets.id,
      promoterId: s.visitTargets.promoterId,
      promoterName: s.users.name,
      storeId: s.visitTargets.storeId,
      storeName: s.stores.name,
      city: s.stores.city,
      brandId: s.visitTargets.brandId,
      brandName: s.brands.name,
      perWeek: s.visitTargets.perWeek,
    })
    .from(s.visitTargets)
    .innerJoin(s.users, eq(s.users.id, s.visitTargets.promoterId))
    .innerJoin(s.stores, eq(s.stores.id, s.visitTargets.storeId))
    .innerJoin(s.brands, eq(s.brands.id, s.visitTargets.brandId))
    .where(
      and(
        eq(s.visitTargets.agencyId, scope.agencyId),
        eq(s.users.status, "active"),
        brandFilter(scope, s.visitTargets.brandId),
        promoterFilter(scope, s.visitTargets.promoterId),
        f.promoter ? eq(s.visitTargets.promoterId, f.promoter) : undefined,
        f.brand ? eq(s.visitTargets.brandId, f.brand) : undefined,
        f.store ? eq(s.visitTargets.storeId, f.store) : undefined,
        f.city ? eq(s.stores.city, f.city) : undefined,
      ),
    )
    .orderBy(asc(s.users.name), asc(s.stores.name), asc(s.brands.name));

  const promoterIds = [...new Set(targets.map((t) => t.promoterId))];
  const done = promoterIds.length
    ? await db
        .select({ promoterId: s.visits.promoterId, storeId: s.visits.storeId, brandId: s.attendances.brandId, n: sql<number>`count(*)::int` })
        .from(s.attendances)
        .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
        .where(and(inArray(s.visits.promoterId, promoterIds), gte(s.visits.visitDate, from), lte(s.visits.visitDate, to), inArray(s.attendances.status, ["completed", "correction_requested"])))
        .groupBy(s.visits.promoterId, s.visits.storeId, s.attendances.brandId)
    : [];
  const last = promoterIds.length
    ? await db
        .select({ promoterId: s.visits.promoterId, storeId: s.visits.storeId, brandId: s.attendances.brandId, d: sql<string>`max(${s.visits.visitDate})::text` })
        .from(s.attendances)
        .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
        .where(and(inArray(s.visits.promoterId, promoterIds), lte(s.visits.visitDate, to), inArray(s.attendances.status, ["completed", "correction_requested"])))
        .groupBy(s.visits.promoterId, s.visits.storeId, s.attendances.brandId)
    : [];
  const key = (x: { promoterId: string; storeId: string; brandId: string }) => `${x.promoterId}:${x.storeId}:${x.brandId}`;
  const doneBy = new Map(done.map((d) => [key(d), d.n]));
  const lastBy = new Map(last.map((d) => [key(d), d.d]));
  const rows: PortfolioRow[] = targets.map((t) => {
    const n = doneBy.get(key(t)) ?? 0;
    return { ...t, done: n, expected: expectedByToday(t.perWeek, ref), status: targetStatus(t.perWeek, n, ref), lastVisit: lastBy.get(key(t)) ?? null };
  });

  const byPromoter = new Map<string, { promoterId: string; promoterName: string; rows: PortfolioRow[] }>();
  for (const r of rows) {
    const g = byPromoter.get(r.promoterId) ?? { promoterId: r.promoterId, promoterName: r.promoterName, rows: [] };
    g.rows.push(r);
    byPromoter.set(r.promoterId, g);
  }
  const promoters = [...byPromoter.values()].map((g) => ({ ...g, totals: weekTotals(g.rows, ref), behind: g.rows.filter((r) => r.status === "behind").length }));
  return { from, to, ref, rows, promoters, totals: weekTotals(rows, ref) };
}

export type PortfolioWeek = Awaited<ReturnType<typeof portfolioWeek>>;

/** Promotores que trabalham por carteira (efetivamente), para o formulário de metas. */
export async function portfolioPromoters(scope: Scope) {
  const db = await getDb();
  const rows = await db
    .select({ id: s.users.id, name: s.users.name, workMode: s.users.workMode })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"), promoterFilter(scope, s.users.id)))
    .orderBy(asc(s.users.name));
  return rows.map((r) => ({ id: r.id, name: r.name, mode: effectiveWorkMode(r.workMode, scope.settings.defaultWorkMode) }));
}

export interface TargetInput {
  promoterId: string;
  storeId: string;
  brandId: string;
  perWeek: number;
}

/** Cria ou altera a meta (uma por promotor × loja × marca). */
export async function saveTarget(scope: Scope, i: TargetInput): Promise<ActionResult> {
  if (!canManage(scope)) return fail("Sem permissão.");
  if (!Number.isInteger(i.perWeek) || i.perWeek < 1 || i.perWeek > 14) return fail("Informe de 1 a 14 visitas por semana.");
  const db = await getDb();
  const [p] = await db.select({ agencyId: s.users.agencyId, role: s.users.role }).from(s.users).where(eq(s.users.id, i.promoterId));
  if (!p || p.agencyId !== scope.agencyId || p.role !== "promoter") return fail("Promotor não encontrado.");
  const [st] = await db.select({ agencyId: s.stores.agencyId }).from(s.stores).where(eq(s.stores.id, i.storeId));
  const [b] = await db.select({ agencyId: s.brands.agencyId }).from(s.brands).where(eq(s.brands.id, i.brandId));
  if (st?.agencyId !== scope.agencyId || b?.agencyId !== scope.agencyId) return fail("Loja ou marca não encontrada.");
  const [sb] = await db.select().from(s.storeBrands).where(and(eq(s.storeBrands.storeId, i.storeId), eq(s.storeBrands.brandId, i.brandId)));
  if (!sb) return fail("Esta marca não é atendida nesta loja (ajuste em Redes e lojas).");
  await db.transaction(async (tx) => {
    // A meta só funciona se o promotor puder atender a loja e a marca.
    await tx.insert(s.userStores).values({ userId: i.promoterId, storeId: i.storeId }).onConflictDoNothing();
    await tx.insert(s.userBrands).values({ userId: i.promoterId, brandId: i.brandId }).onConflictDoNothing();
    const [row] = await tx
      .insert(s.visitTargets)
      .values({ agencyId: scope.agencyId, promoterId: i.promoterId, storeId: i.storeId, brandId: i.brandId, perWeek: i.perWeek, createdBy: scope.userId, updatedBy: scope.userId })
      .onConflictDoUpdate({ target: [s.visitTargets.promoterId, s.visitTargets.storeId, s.visitTargets.brandId], set: { perWeek: i.perWeek, updatedAt: new Date(), updatedBy: scope.userId } })
      .returning({ id: s.visitTargets.id });
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "target", row.id, "saved", { after: { ...i } }, tx);
  });
  return { ok: true, message: "Meta salva." };
}

export async function deleteTarget(scope: Scope, id: string): Promise<ActionResult> {
  if (!canManage(scope)) return fail("Sem permissão.");
  const db = await getDb();
  const [row] = await db.select().from(s.visitTargets).where(and(eq(s.visitTargets.id, id), eq(s.visitTargets.agencyId, scope.agencyId)));
  if (!row) return fail("Meta não encontrada.");
  await db.delete(s.visitTargets).where(eq(s.visitTargets.id, id));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "target", id, "deleted", { before: { promoterId: row.promoterId, storeId: row.storeId, brandId: row.brandId, perWeek: row.perWeek } });
  return { ok: true, message: "Meta removida." };
}
