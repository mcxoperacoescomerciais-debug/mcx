/**
 * Carteira com meta semanal no painel: metas (promotor × loja × marca × visitas
 * por semana) e o realizado da semana, com o ritmo esperado até hoje.
 */
import "server-only";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { brandFilter, promoterFilter } from "./scope";
import type { ActionResult } from "./manager";
import type { PanelFilters } from "@/lib/filters";
import { addDays, todayIso, weekdayOf } from "@/lib/dates";
import { effectiveWorkMode, expectedByToday, expectedInRange, periodWindow, targetStatus, PERIOD_LABEL, TARGET_PERIODS, weekEnd, weekStart, weekTotals, type TargetPeriod, type TargetStatus } from "@/lib/portfolio";
import { filterIn } from "@/server/filter-sql";

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
  /** assignment = atribuição (meta); schedule = lojas programadas na semana (roteiro ou à mão) sem atribuição. */
  source: "assignment" | "schedule";
  /** Só na programação: quantas estavam programadas até hoje. */
  expectedFixed?: number;
  /** Período escolhido (não a semana): meta proporcional aos dias do período. */
  goal?: number;
}

/**
 * Atribuições com o realizado no período de cada uma (semana, quinzena ou mês
 * que contém `f.date`); "hoje" para o ritmo = hoje limitado ao período.
 */
/**
 * Resultado das metas na semana de `f.date` ou, com `range`, num período
 * qualquer: aí a meta de cada loja × marca é proporcional aos dias escolhidos
 * (2x por semana em 14 dias = 4) e o realizado é o que foi feito no período.
 */
export async function portfolioWeek(scope: Scope, f: Pick<PanelFilters, "date" | "promoter" | "brand" | "store" | "city">, range?: { from: string; to: string }) {
  const db = await getDb();
  const from = range?.from ?? weekStart(f.date);
  const to = range?.to ?? weekEnd(f.date);
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
        f.promoter ? filterIn(s.visitTargets.promoterId, f.promoter) : undefined,
        f.brand ? filterIn(s.visitTargets.brandId, f.brand) : undefined,
        f.store ? filterIn(s.visitTargets.storeId, f.store) : undefined,
        f.city ? filterIn(s.stores.city, f.city) : undefined,
      ),
    )
    .orderBy(asc(s.users.name), asc(s.stores.name), asc(s.brands.name));

  const windows = (["week", "fortnight", "month"] as const).map((p) => periodWindow(f.date, p));
  const minFrom = windows.reduce((m, w) => (w.from < m ? w.from : m), from);
  const maxTo = windows.reduce((m, w) => (w.to > m ? w.to : m), to);
  // Lojas programadas na semana (roteiro ou programadas à mão) que não vêm de atribuição também contam.
  const scheduled = await db
    .select({
      promoterId: s.schedules.promoterId,
      promoterName: s.users.name,
      storeId: s.schedules.storeId,
      storeName: s.stores.name,
      city: s.stores.city,
      brandId: s.scheduleBrands.brandId,
      brandName: s.brands.name,
      date: sql<string>`${s.schedules.date}::text`,
    })
    .from(s.schedules)
    .innerJoin(s.scheduleBrands, eq(s.scheduleBrands.scheduleId, s.schedules.id))
    .innerJoin(s.users, and(eq(s.users.id, s.schedules.promoterId), eq(s.users.status, "active")))
    .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
    .innerJoin(s.brands, eq(s.brands.id, s.scheduleBrands.brandId))
    .where(
      and(
        eq(s.schedules.agencyId, scope.agencyId),
        eq(s.schedules.status, "active"),
        gte(s.schedules.date, from),
        lte(s.schedules.date, to),
        brandFilter(scope, s.scheduleBrands.brandId),
        promoterFilter(scope, s.schedules.promoterId),
        f.promoter ? filterIn(s.schedules.promoterId, f.promoter) : undefined,
        f.brand ? filterIn(s.scheduleBrands.brandId, f.brand) : undefined,
        f.store ? filterIn(s.schedules.storeId, f.store) : undefined,
        f.city ? filterIn(s.stores.city, f.city) : undefined,
      ),
    );
  const covered = new Set(targets.map((t) => `${t.promoterId}:${t.storeId}:${t.brandId}`));
  const extra = new Map<string, (typeof scheduled)[number] & { dates: string[] }>();
  for (const r of scheduled) {
    const k = `${r.promoterId}:${r.storeId}:${r.brandId}`;
    if (covered.has(k)) continue;
    const g = extra.get(k) ?? { ...r, dates: [] };
    g.dates.push(r.date);
    extra.set(k, g);
  }
  const promoterIds = [...new Set([...targets.map((t) => t.promoterId), ...[...extra.values()].map((e) => e.promoterId)])];
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
    if (range) {
      const n = visits.filter((v) => key(v) === key(t) && v.date >= from && v.date <= to).length;
      const goal = Math.max(1, Math.round(expectedInRange(t.perWeek, t.period, from, to)));
      const expected = Math.min(goal, Math.floor(expectedInRange(t.perWeek, t.period, from, ref)));
      const status = n >= goal ? "done" : n >= expected ? "on_track" : "behind";
      return { ...t, source: "assignment" as const, done: n, goal, expected, expectedFixed: expected, status, lastVisit: lastBy.get(key(t)) ?? null, windowFrom: from, windowTo: to };
    }
    const w = periodWindow(f.date, t.period);
    const tRef = today < w.from ? w.from : today > w.to ? w.to : today;
    const n = visits.filter((v) => key(v) === key(t) && v.date >= w.from && v.date <= w.to).length;
    return { ...t, source: "assignment" as const, done: n, expected: expectedByToday(t.perWeek, tRef, t.period), status: targetStatus(t.perWeek, n, tRef, t.period), lastVisit: lastBy.get(key(t)) ?? null, windowFrom: w.from, windowTo: w.to };
  });
  for (const e of extra.values()) {
    const dates = [...new Set(e.dates)].sort();
    const n = visits.filter((v) => key(v) === key(e) && v.date >= from && v.date <= to).length;
    // Programado para hoje ainda não está atrasado: conta até ontem (semana passada: tudo).
    const expected = dates.filter((d) => (ref === today ? d < today : d <= ref)).length;
    rows.push({
      id: `sch:${key(e)}`,
      promoterId: e.promoterId,
      promoterName: e.promoterName,
      storeId: e.storeId,
      storeName: e.storeName,
      city: e.city,
      brandId: e.brandId,
      brandName: e.brandName,
      perWeek: dates.length,
      period: "week",
      weekdays: [...new Set(dates.map((d) => weekdayOf(d)))].sort((a, b) => a - b),
      source: "schedule",
      expectedFixed: expected,
      done: n,
      expected,
      status: n >= dates.length ? "done" : n >= expected ? "on_track" : "behind",
      lastVisit: lastBy.get(key(e)) ?? null,
      windowFrom: from,
      windowTo: to,
    });
  }
  rows.sort((a, b) => a.promoterName.localeCompare(b.promoterName, "pt-BR") || a.storeName.localeCompare(b.storeName, "pt-BR") || a.brandName.localeCompare(b.brandName, "pt-BR"));

  const byPromoter = new Map<string, { promoterId: string; promoterName: string; rows: PortfolioRow[] }>();
  for (const r of rows) {
    const g = byPromoter.get(r.promoterId) ?? { promoterId: r.promoterId, promoterName: r.promoterName, rows: [] };
    g.rows.push(r);
    byPromoter.set(r.promoterId, g);
  }
  const promoters = [...byPromoter.values()].map((g) => ({ ...g, totals: weekTotals(g.rows, ref), behind: g.rows.filter((r) => r.status === "behind").length }));
  // Todos os promotores ativos (para mostrar também quem não tem meta nem loja programada na semana).
  const everyone = await db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"), promoterFilter(scope, s.users.id), f.promoter ? filterIn(s.users.id, f.promoter) : undefined))
    .orderBy(asc(s.users.name));
  const idle = everyone.filter((u) => !byPromoter.has(u.id));
  return { from, to, ref, rows, promoters, idle, registered: everyone.length, totals: weekTotals(rows, ref) };
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
  /** VR ATEND (valor do mês ao promotor); undefined = mantém o que já tem. */
  payValue?: number | null;
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
export async function saveTarget(scope: Scope, i: TargetInput, opts: { sync?: boolean } = {}): Promise<ActionResult> {
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
      .values({ agencyId: scope.agencyId, promoterId: i.promoterId, storeId: i.storeId, brandId: i.brandId, perWeek: i.perWeek, period, weekdays, payValue: i.payValue ?? null, createdBy: scope.userId, updatedBy: scope.userId })
      .onConflictDoUpdate({ target: [s.visitTargets.promoterId, s.visitTargets.storeId, s.visitTargets.brandId], set: { perWeek: i.perWeek, period, weekdays, ...(i.payValue !== undefined ? { payValue: i.payValue } : {}), updatedAt: new Date(), updatedBy: scope.userId } })
      .returning({ id: s.visitTargets.id });
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "target", row.id, "saved", { after: { ...i, period, weekdays } }, tx);
  });
  // Dias fixos viram programação na hora (o promotor vê no Hoje sem ninguém gerar).
  if (opts.sync !== false) await syncPromoterSchedules(scope.agencyId, scope.userId, [i.promoterId], i.storeId);
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
  // Marca nova para a loja ("Adicionar marca" no cadastro do promotor): passa a ser atendida na loja.
  const newBrands = [...new Set(rows.map((r) => r.brandId).filter((b) => !storeBrandIds.includes(b)))];
  if (newBrands.length) {
    const ok = await db.select({ id: s.brands.id }).from(s.brands).where(and(inArray(s.brands.id, newBrands), eq(s.brands.agencyId, scope.agencyId), eq(s.brands.status, "active")));
    if (ok.length !== newBrands.length) return fail("Marca não encontrada nesta agência.");
  }
  await db.transaction(async (tx) => {
    if (newBrands.length) await tx.insert(s.storeBrands).values(newBrands.map((brandId) => ({ storeId, brandId }))).onConflictDoNothing();
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
  await syncPromoterSchedules(scope.agencyId, scope.userId, [promoterId], storeId);
  return { ok: true, message: rows.length ? "Loja salva na carteira do promotor." : "Loja retirada do promotor." };
}

/**
 * Quadro semanal do promotor: arrastar a loja de um dia para outro move as marcas
 * daquele dia (fromDay -1 = sem dia fixo; toDay -1 = vira sem dia fixo).
 */
export async function moveStoreDay(scope: Scope, promoterId: string, storeId: string, fromDay: number, toDay: number): Promise<ActionResult> {
  if (!canManage(scope)) return fail("Sem permissão.");
  const valid = (d: number) => Number.isInteger(d) && d >= -1 && d <= 6;
  if (!valid(fromDay) || !valid(toDay) || fromDay === toDay) return fail("Dia inválido.");
  const bad = await checkPromoterStore(scope, promoterId, storeId);
  if (bad) return fail(bad);
  const db = await getDb();
  const rows = await db.select().from(s.visitTargets).where(and(eq(s.visitTargets.promoterId, promoterId), eq(s.visitTargets.storeId, storeId), eq(s.visitTargets.agencyId, scope.agencyId)));
  const moving = rows.filter((r) => (fromDay === -1 ? r.weekdays.length === 0 : r.weekdays.includes(fromDay)));
  if (!moving.length) return fail("Nada para mover neste dia.");
  await db.transaction(async (tx) => {
    for (const r of moving) {
      const kept = r.weekdays.filter((d) => d !== fromDay);
      const weekdays = toDay === -1 ? kept : [...new Set([...kept, toDay])].sort((a, b) => a - b);
      await tx.update(s.visitTargets).set({ weekdays, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.visitTargets.id, r.id));
    }
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "user", promoterId, "assignment_day_moved", { after: { storeId, fromDay, toDay, brands: moving.map((m) => m.brandId) } }, tx);
  });
  await syncPromoterSchedules(scope.agencyId, scope.userId, [promoterId], storeId);
  return { ok: true, message: "Loja movida de dia." };
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

/** Motivo gravado quando a programação some porque o dia saiu da atribuição (volta sozinha se o dia voltar). */
export const AUTO_CANCEL_REASON = "Atribuição alterada: dia retirado.";
/** Quantos dias à frente a programação das atribuições é mantida. */
export const ASSIGNMENT_HORIZON_DAYS = 13;

export interface ScheduleSyncInput {
  agencyId: string;
  actorId: string | null;
  from: string;
  to: string;
  /** null = todos os promotores da agência. */
  promoterIds?: string[] | null;
  storeId?: string;
  /** Também retira (do dia de hoje em diante) o que a atribuição deixou de prever. */
  prune?: boolean;
}

/**
 * Programação a partir das atribuições com dias fixos: em cada dia, uma loja por
 * promotor com as marcas daquele dia. Cria o que falta, acerta as marcas do que
 * foi gerado pela atribuição e (com prune) retira o que deixou de ser previsto.
 * Nunca mexe em loja já iniciada, nem no que o gestor programou ou cancelou à mão.
 */
export async function syncAssignmentSchedules(o: ScheduleSyncInput): Promise<{ created: number; updated: number; cancelled: number }> {
  const result = { created: 0, updated: 0, cancelled: 0 };
  if (o.from > o.to || (o.promoterIds && !o.promoterIds.length)) return result;
  const db = await getDb();
  const today = todayIso();
  const targets = await db
    .select({ promoterId: s.visitTargets.promoterId, storeId: s.visitTargets.storeId, brandId: s.visitTargets.brandId, weekdays: s.visitTargets.weekdays })
    .from(s.visitTargets)
    .innerJoin(s.users, and(eq(s.users.id, s.visitTargets.promoterId), eq(s.users.status, "active")))
    .innerJoin(s.stores, and(eq(s.stores.id, s.visitTargets.storeId), eq(s.stores.status, "active")))
    .innerJoin(s.brands, and(eq(s.brands.id, s.visitTargets.brandId), eq(s.brands.status, "active")))
    .where(
      and(
        eq(s.visitTargets.agencyId, o.agencyId),
        o.promoterIds ? inArray(s.visitTargets.promoterId, o.promoterIds) : undefined,
        o.storeId ? eq(s.visitTargets.storeId, o.storeId) : undefined,
      ),
    );

  const desired = new Map<string, { promoterId: string; storeId: string; date: string; brands: Set<string> }>();
  for (let d = o.from; d <= o.to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const t of targets) {
      if (!t.weekdays.includes(wd)) continue;
      const k = `${t.promoterId}|${t.storeId}|${d}`;
      const g = desired.get(k) ?? { promoterId: t.promoterId, storeId: t.storeId, date: d, brands: new Set<string>() };
      g.brands.add(t.brandId);
      desired.set(k, g);
    }
  }

  const existing = await db
    .select({ id: s.schedules.id, promoterId: s.schedules.promoterId, storeId: s.schedules.storeId, date: s.schedules.date, status: s.schedules.status, origin: s.schedules.origin, cancelReason: s.schedules.cancelReason })
    .from(s.schedules)
    .where(
      and(
        eq(s.schedules.agencyId, o.agencyId),
        gte(s.schedules.date, o.from),
        lte(s.schedules.date, o.to),
        o.promoterIds ? inArray(s.schedules.promoterId, o.promoterIds) : undefined,
        o.storeId ? eq(s.schedules.storeId, o.storeId) : undefined,
      ),
    );
  if (!desired.size && !(o.prune && existing.some((e) => e.origin === "assignment" && e.status === "active"))) return result;
  const ids = existing.map((e) => e.id);
  const [brandRows, startedRows, seqRows] = await Promise.all([
    ids.length ? db.select().from(s.scheduleBrands).where(inArray(s.scheduleBrands.scheduleId, ids)) : [],
    ids.length ? db.select({ scheduleId: s.visits.scheduleId }).from(s.visits).where(and(inArray(s.visits.scheduleId, ids), ne(s.visits.status, "cancelled"))) : [],
    // Próxima posição do dia: depois de tudo o que o promotor já tem (inclusive outras lojas).
    db
      .select({ promoterId: s.schedules.promoterId, date: s.schedules.date, next: sql<number>`coalesce(max(${s.schedules.seq}), -1)::int + 1` })
      .from(s.schedules)
      .where(and(eq(s.schedules.agencyId, o.agencyId), gte(s.schedules.date, o.from), lte(s.schedules.date, o.to), o.promoterIds ? inArray(s.schedules.promoterId, o.promoterIds) : undefined))
      .groupBy(s.schedules.promoterId, s.schedules.date),
  ]);
  const brandsOf = new Map<string, Set<string>>();
  for (const b of brandRows) brandsOf.set(b.scheduleId, (brandsOf.get(b.scheduleId) ?? new Set<string>()).add(b.brandId));
  const started = new Set(startedRows.map((r) => r.scheduleId));
  const nextSeq = new Map(seqRows.map((r) => [`${r.promoterId}|${r.date}`, Number(r.next)]));
  const byKey = new Map<string, typeof existing>();
  for (const e of existing) {
    const k = `${e.promoterId}|${e.storeId}|${e.date}`;
    byKey.set(k, [...(byKey.get(k) ?? []), e]);
  }
  const same = (a: Set<string> | undefined, b: Set<string>) => !!a && a.size === b.size && [...b].every((x) => a.has(x));

  await db.transaction(async (tx) => {
    const setBrands = async (scheduleId: string, brands: Set<string>) => {
      await tx.delete(s.scheduleBrands).where(eq(s.scheduleBrands.scheduleId, scheduleId));
      await tx.insert(s.scheduleBrands).values([...brands].map((brandId) => ({ scheduleId, brandId })));
    };
    for (const [k, g] of desired) {
      const rows = byKey.get(k) ?? [];
      const active = rows.find((r) => r.status === "active");
      if (active) {
        if (active.origin === "assignment" && !started.has(active.id) && !same(brandsOf.get(active.id), g.brands)) {
          await setBrands(active.id, g.brands);
          await tx.update(s.schedules).set({ updatedAt: new Date(), updatedBy: o.actorId }).where(eq(s.schedules.id, active.id));
          result.updated++;
        }
        continue;
      }
      // Cancelada à mão pelo gestor: respeita. Cancelada pela própria atribuição: volta.
      const auto = rows.find((r) => r.origin === "assignment" && r.cancelReason === AUTO_CANCEL_REASON);
      if (rows.length && !auto) continue;
      if (auto) {
        await tx.update(s.schedules).set({ status: "active", cancelReason: null, updatedAt: new Date(), updatedBy: o.actorId }).where(eq(s.schedules.id, auto.id));
        await setBrands(auto.id, g.brands);
        result.created++;
        continue;
      }
      const sk = `${g.promoterId}|${g.date}`;
      const seq = nextSeq.get(sk) ?? 0;
      nextSeq.set(sk, seq + 1);
      const [row] = await tx
        .insert(s.schedules)
        .values({ agencyId: o.agencyId, promoterId: g.promoterId, storeId: g.storeId, date: g.date, seq, origin: "assignment", createdBy: o.actorId, updatedBy: o.actorId })
        .returning({ id: s.schedules.id });
      await tx.insert(s.scheduleBrands).values([...g.brands].map((brandId) => ({ scheduleId: row.id, brandId })));
      result.created++;
    }
    if (o.prune) {
      for (const e of existing) {
        const k = `${e.promoterId}|${e.storeId}|${e.date}`;
        if (e.status !== "active" || e.origin !== "assignment" || e.date < today || started.has(e.id) || desired.has(k)) continue;
        await tx.update(s.schedules).set({ status: "cancelled", cancelReason: AUTO_CANCEL_REASON, updatedAt: new Date(), updatedBy: o.actorId }).where(eq(s.schedules.id, e.id));
        result.cancelled++;
      }
    }
  });
  return result;
}

/**
 * Depois de mudar atribuições: acerta a programação do promotor de hoje até o
 * horizonte (ou até o último dia já programado, se for mais longe).
 */
export async function syncPromoterSchedules(agencyId: string, actorId: string | null, promoterIds: string[], storeId?: string) {
  if (!promoterIds.length) return { created: 0, updated: 0, cancelled: 0 };
  const db = await getDb();
  const today = todayIso();
  const [last] = await db
    .select({ max: sql<string | null>`max(${s.schedules.date})::text` })
    .from(s.schedules)
    .where(and(eq(s.schedules.agencyId, agencyId), inArray(s.schedules.promoterId, promoterIds), eq(s.schedules.status, "active")));
  const horizon = addDays(today, ASSIGNMENT_HORIZON_DAYS);
  const to = last?.max && last.max > horizon ? last.max : horizon;
  return syncAssignmentSchedules({ agencyId, actorId, from: today, to, promoterIds, storeId, prune: true });
}

/** Botão "Gerar programação": também acerta o que a atribuição deixou de prever. */
export async function generateFromAssignments(scope: Scope, from: string, to: string): Promise<{ created: number; skipped: number }> {
  const r = await syncAssignmentSchedules({ agencyId: scope.agencyId, actorId: scope.userId, from, to, promoterIds: scope.promoterIds, prune: true });
  return { created: r.created, skipped: 0 };
}

export async function deleteTarget(scope: Scope, id: string): Promise<ActionResult> {
  if (!canManage(scope)) return fail("Sem permissão.");
  const db = await getDb();
  const [row] = await db.select().from(s.visitTargets).where(and(eq(s.visitTargets.id, id), eq(s.visitTargets.agencyId, scope.agencyId)));
  if (!row) return fail("Meta não encontrada.");
  await db.delete(s.visitTargets).where(eq(s.visitTargets.id, id));
  await syncPromoterSchedules(scope.agencyId, scope.userId, [row.promoterId], row.storeId);
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "target", id, "deleted", { before: { promoterId: row.promoterId, storeId: row.storeId, brandId: row.brandId, perWeek: row.perWeek } });
  return { ok: true, message: "Meta removida." };
}
