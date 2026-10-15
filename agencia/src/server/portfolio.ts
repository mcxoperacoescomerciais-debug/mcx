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
import { addDays, todayIso, weekdayOf } from "@/lib/dates";
import { effectiveWorkMode, expectedByToday, periodWindow, targetStatus, PERIOD_LABEL, TARGET_PERIODS, weekEnd, weekStart, weekTotals, type TargetPeriod, type TargetStatus } from "@/lib/portfolio";

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
  /** Vezes por período. */
  perWeek: number;
  period: TargetPeriod;
  weekdays: number[];
  done: number;
  expected: number;
  status: TargetStatus;
  lastVisit: string | null;
  windowFrom: string;
  windowTo: string;
}

/**
 * Atribuições com o realizado no período de cada uma (semana, quinzena ou mês
 * que contém `f.date`); "hoje" para o ritmo = hoje limitado ao período.
 */
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
      period: s.visitTargets.period,
      weekdays: s.visitTargets.weekdays,
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

  const windows = (["week", "fortnight", "month"] as const).map((p) => periodWindow(f.date, p));
  const minFrom = windows.reduce((m, w) => (w.from < m ? w.from : m), windows[0].from);
  const maxTo = windows.reduce((m, w) => (w.to > m ? w.to : m), windows[0].to);
  const promoterIds = [...new Set(targets.map((t) => t.promoterId))];
  const visits = promoterIds.length
    ? await db
        .select({ promoterId: s.visits.promoterId, storeId: s.visits.storeId, brandId: s.attendances.brandId, date: sql<string>`${s.visits.visitDate}::text` })
        .from(s.attendances)
        .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
        .where(and(inArray(s.visits.promoterId, promoterIds), gte(s.visits.visitDate, minFrom), lte(s.visits.visitDate, maxTo), inArray(s.attendances.status, ["completed", "correction_requested"])))
    : [];
  const last = promoterIds.length
    ? await db
        .select({ promoterId: s.visits.promoterId, storeId: s.visits.storeId, brandId: s.attendances.brandId, d: sql<string>`max(${s.visits.visitDate})::text` })
        .from(s.attendances)
        .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
        .where(and(inArray(s.visits.promoterId, promoterIds), lte(s.visits.visitDate, maxTo), inArray(s.attendances.status, ["completed", "correction_requested"])))
        .groupBy(s.visits.promoterId, s.visits.storeId, s.attendances.brandId)
    : [];
  const key = (x: { promoterId: string; storeId: string; brandId: string }) => `${x.promoterId}:${x.storeId}:${x.brandId}`;
  const lastBy = new Map(last.map((d) => [key(d), d.d]));
  const rows: PortfolioRow[] = targets.map((t) => {
    const w = periodWindow(f.date, t.period);
    const tRef = today < w.from ? w.from : today > w.to ? w.to : today;
    const n = visits.filter((v) => key(v) === key(t) && v.date >= w.from && v.date <= w.to).length;
    return { ...t, done: n, expected: expectedByToday(t.perWeek, tRef, t.period), status: targetStatus(t.perWeek, n, tRef, t.period), lastVisit: lastBy.get(key(t)) ?? null, windowFrom: w.from, windowTo: w.to };
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
  /** Vezes por período. */
  perWeek: number;
  period?: TargetPeriod;
  /** Dias fixos (0 = dom … 6 = sáb); vazio = só a quantidade. */
  weekdays?: number[];
}

function validTimes(i: { perWeek: number; period?: TargetPeriod }): string | null {
  const period = i.period ?? "week";
  if (!TARGET_PERIODS.includes(period)) return "Período inválido.";
  const max = period === "month" ? 31 : 14;
  if (!Number.isInteger(i.perWeek) || i.perWeek < 1 || i.perWeek > max) return `Informe de 1 a ${max} visitas ${PERIOD_LABEL[period]}.`;
  return null;
}

const cleanDays = (d: number[] | undefined) => [...new Set((d ?? []).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();

async function checkPromoterStore(scope: Scope, promoterId: string, storeId: string): Promise<string | null> {
  const db = await getDb();
  const [p] = await db.select({ agencyId: s.users.agencyId, role: s.users.role }).from(s.users).where(eq(s.users.id, promoterId));
  if (!p || p.agencyId !== scope.agencyId || p.role !== "promoter") return "Promotor não encontrado.";
  const [st] = await db.select({ agencyId: s.stores.agencyId }).from(s.stores).where(eq(s.stores.id, storeId));
  if (st?.agencyId !== scope.agencyId) return "Loja não encontrada.";
  return null;
}

/** Cria ou altera uma atribuição (uma por promotor × loja × marca). */
export async function saveTarget(scope: Scope, i: TargetInput): Promise<ActionResult> {
  if (!canManage(scope)) return fail("Sem permissão.");
  const bad = validTimes(i) ?? (await checkPromoterStore(scope, i.promoterId, i.storeId));
  if (bad) return fail(bad);
  const db = await getDb();
  const [b] = await db.select({ agencyId: s.brands.agencyId }).from(s.brands).where(eq(s.brands.id, i.brandId));
  if (b?.agencyId !== scope.agencyId) return fail("Marca não encontrada.");
  const [sb] = await db.select().from(s.storeBrands).where(and(eq(s.storeBrands.storeId, i.storeId), eq(s.storeBrands.brandId, i.brandId)));
  if (!sb) return fail("Esta marca não é atendida nesta loja (ajuste em Redes e lojas).");
  const period = i.period ?? "week";
  const weekdays = cleanDays(i.weekdays);
  await db.transaction(async (tx) => {
    // A atribuição só funciona se o promotor puder atender a loja e a marca.
    await tx.insert(s.userStores).values({ userId: i.promoterId, storeId: i.storeId }).onConflictDoNothing();
    await tx.insert(s.userBrands).values({ userId: i.promoterId, brandId: i.brandId }).onConflictDoNothing();
    const [row] = await tx
      .insert(s.visitTargets)
      .values({ agencyId: scope.agencyId, promoterId: i.promoterId, storeId: i.storeId, brandId: i.brandId, perWeek: i.perWeek, period, weekdays, createdBy: scope.userId, updatedBy: scope.userId })
      .onConflictDoUpdate({ target: [s.visitTargets.promoterId, s.visitTargets.storeId, s.visitTargets.brandId], set: { perWeek: i.perWeek, period, weekdays, updatedAt: new Date(), updatedBy: scope.userId } })
      .returning({ id: s.visitTargets.id });
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "target", row.id, "saved", { after: { ...i, period, weekdays } }, tx);
  });
  return { ok: true, message: "Atribuição salva." };
}

/**
 * Cadastro do promotor: grava TODAS as marcas dele numa loja de uma vez
 * (substitui as da loja). Lista vazia = tira a loja do promotor.
 */
export async function saveStoreAssignment(scope: Scope, promoterId: string, storeId: string, rows: { brandId: string; perWeek: number; period?: TargetPeriod; weekdays?: number[] }[]): Promise<ActionResult> {
  if (!canManage(scope)) return fail("Sem permissão.");
  const bad = await checkPromoterStore(scope, promoterId, storeId);
  if (bad) return fail(bad);
  for (const r of rows) {
    const e = validTimes(r);
    if (e) return fail(e);
  }
  const db = await getDb();
  const storeBrandIds = (await db.select({ id: s.storeBrands.brandId }).from(s.storeBrands).where(eq(s.storeBrands.storeId, storeId))).map((x) => x.id);
  if (rows.some((r) => !storeBrandIds.includes(r.brandId))) return fail("Uma das marcas não é atendida nesta loja (ajuste em Redes e lojas).");
  await db.transaction(async (tx) => {
    const before = await tx.select().from(s.visitTargets).where(and(eq(s.visitTargets.promoterId, promoterId), eq(s.visitTargets.storeId, storeId)));
    await tx.delete(s.visitTargets).where(and(eq(s.visitTargets.promoterId, promoterId), eq(s.visitTargets.storeId, storeId)));
    if (rows.length) {
      await tx.insert(s.userStores).values({ userId: promoterId, storeId }).onConflictDoNothing();
      for (const r of rows) await tx.insert(s.userBrands).values({ userId: promoterId, brandId: r.brandId }).onConflictDoNothing();
      await tx.insert(s.visitTargets).values(
        rows.map((r) => ({ agencyId: scope.agencyId, promoterId, storeId, brandId: r.brandId, perWeek: r.perWeek, period: r.period ?? "week", weekdays: cleanDays(r.weekdays), createdBy: scope.userId, updatedBy: scope.userId })),
      );
    } else {
      await tx.delete(s.userStores).where(and(eq(s.userStores.userId, promoterId), eq(s.userStores.storeId, storeId)));
    }
    await audit(
      { agencyId: scope.agencyId, userId: scope.userId },
      "user",
      promoterId,
      "assignment_saved",
      { before: before.map((b) => ({ brandId: b.brandId, perWeek: b.perWeek, period: b.period, weekdays: b.weekdays })), after: { storeId, rows } },
      tx,
    );
  });
  return { ok: true, message: rows.length ? "Loja salva na carteira do promotor." : "Loja retirada do promotor." };
}

export interface AssignmentView {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  chainName: string | null;
  city: string;
  brands: { brandId: string; brandName: string; perWeek: number; period: TargetPeriod; weekdays: number[] }[];
}

/** Atribuições do promotor agrupadas por loja (cadastro do promotor e quadro semanal). */
export async function listAssignments(scope: Scope, promoterId: string): Promise<AssignmentView[]> {
  const db = await getDb();
  const rows = await db
    .select({
      storeId: s.visitTargets.storeId,
      storeName: s.stores.name,
      storeCode: s.stores.code,
      chainName: s.chains.name,
      city: s.stores.city,
      brandId: s.visitTargets.brandId,
      brandName: s.brands.name,
      perWeek: s.visitTargets.perWeek,
      period: s.visitTargets.period,
      weekdays: s.visitTargets.weekdays,
    })
    .from(s.visitTargets)
    .innerJoin(s.stores, eq(s.stores.id, s.visitTargets.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.brands, eq(s.brands.id, s.visitTargets.brandId))
    .where(and(eq(s.visitTargets.promoterId, promoterId), eq(s.visitTargets.agencyId, scope.agencyId)))
    .orderBy(asc(s.stores.city), asc(s.stores.name), asc(s.brands.name));
  const map = new Map<string, AssignmentView>();
  for (const r of rows) {
    const v = map.get(r.storeId) ?? { storeId: r.storeId, storeName: r.storeName, storeCode: r.storeCode, chainName: r.chainName, city: r.city, brands: [] };
    v.brands.push({ brandId: r.brandId, brandName: r.brandName, perWeek: r.perWeek, period: r.period, weekdays: r.weekdays });
    map.set(r.storeId, v);
  }
  return [...map.values()];
}

/**
 * Programação a partir das atribuições com dias fixos: em cada dia, uma loja por
 * promotor com as marcas daquele dia. Não duplica o que já existe.
 */
export async function generateFromAssignments(scope: Scope, from: string, to: string): Promise<{ created: number; skipped: number }> {
  const db = await getDb();
  const { createSchedule } = await import("./schedules");
  const targets = await db
    .select({ promoterId: s.visitTargets.promoterId, storeId: s.visitTargets.storeId, brandId: s.visitTargets.brandId, weekdays: s.visitTargets.weekdays })
    .from(s.visitTargets)
    .innerJoin(s.users, eq(s.users.id, s.visitTargets.promoterId))
    .where(and(eq(s.visitTargets.agencyId, scope.agencyId), eq(s.users.status, "active"), promoterFilter(scope, s.visitTargets.promoterId)));
  let created = 0;
  let skipped = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    const byStop = new Map<string, { promoterId: string; storeId: string; brands: string[] }>();
    for (const t of targets) {
      if (!t.weekdays.includes(wd)) continue;
      const k = `${t.promoterId}:${t.storeId}`;
      const g = byStop.get(k) ?? { promoterId: t.promoterId, storeId: t.storeId, brands: [] };
      g.brands.push(t.brandId);
      byStop.set(k, g);
    }
    for (const g of byStop.values()) {
      const r = await createSchedule(scope, { promoterId: g.promoterId, storeId: g.storeId, date: d, plannedStart: null, brandIds: g.brands, notes: null });
      if (r.ok) created++;
      else skipped++;
    }
  }
  return { created, skipped };
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
