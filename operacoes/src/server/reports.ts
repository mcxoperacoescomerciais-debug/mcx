/**
 * Relatórios do mês (dono e gestor): horas por contratante, por categoria e
 * tipo, tempo médio por tipo, capacidade semanal e Horas × Receita.
 * Também o painel inicial (uma tela, dados reais).
 */
import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays, monthEnd, monthStart, todayIso, weekStart } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { median } from "@/lib/routines";
import { getDb, schema as s } from "./db";
import type { Actor } from "./demands";
import { generatedToday } from "./routines";
import { entriesBetween } from "./time";

export interface Entry {
  minutes: number;
  day: string;
  userId: string;
  demandId: string;
  clientId: string;
  clientName: string;
  categoryName: string;
  typeId: string | null;
  status: string;
}

function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(key(r), (out.get(key(r)) ?? 0) + value(r));
  return out;
}

/** Horas por contratante, do maior para o menor. */
export function hoursByClient(entries: Entry[]) {
  const names = new Map(entries.map((e) => [e.clientId, e.clientName]));
  return [...sumBy(entries, (e) => e.clientId, (e) => e.minutes)].map(([clientId, minutes]) => ({ clientId, clientName: names.get(clientId) ?? "", minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** Tempo por tipo: total, quantidade de demandas concluídas, média e mediana (por demanda). */
export function statsByType(entries: Entry[], typeNames: Map<string, string>) {
  const perDemand = new Map<string, { key: string; category: string; type: string; minutes: number; done: boolean }>();
  for (const e of entries) {
    const type = e.typeId ? (typeNames.get(e.typeId) ?? "Sem tipo") : "Sem tipo";
    const cur = perDemand.get(e.demandId) ?? { key: `${e.categoryName}|${type}`, category: e.categoryName, type, minutes: 0, done: e.status === "done" };
    cur.minutes += e.minutes;
    perDemand.set(e.demandId, cur);
  }
  const groups = new Map<string, { category: string; type: string; minutes: number; done: number[] }>();
  for (const d of perDemand.values()) {
    const g = groups.get(d.key) ?? { category: d.category, type: d.type, minutes: 0, done: [] };
    g.minutes += d.minutes;
    if (d.done) g.done.push(d.minutes);
    groups.set(d.key, g);
  }
  return [...groups.values()]
    .map((g) => ({ category: g.category, type: g.type, minutes: g.minutes, count: g.done.length, average: g.done.length ? Math.round(g.done.reduce((a, b) => a + b, 0) / g.done.length) : 0, median: Math.round(median(g.done)) }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Capacidade: horas apontadas ÷ horas disponíveis, por semana (segunda a domingo). */
export function capacityByWeek(entries: Entry[], people: { id: string; name: string; weeklyHours: number }[], weeks: string[]) {
  const perWeek = sumBy(entries, (e) => `${weekStart(e.day)}|${e.userId}`, (e) => e.minutes);
  const rows = weeks.map((week) => {
    const persons = people.map((p) => {
      const minutes = perWeek.get(`${week}|${p.id}`) ?? 0;
      return { id: p.id, name: p.name, minutes, percent: p.weeklyHours > 0 ? Math.round((minutes / (p.weeklyHours * 60)) * 100) : 0 };
    });
    const available = people.reduce((a, p) => a + p.weeklyHours * 60, 0);
    const used = persons.reduce((a, p) => a + p.minutes, 0);
    return { week, persons, teamPercent: available > 0 ? Math.round((used / available) * 100) : 0 };
  });
  return rows;
}

/** Sinal de contratação: equipe acima de 80% por 4 semanas seguidas. */
export function hiringSignal(weeks: { teamPercent: number }[]): boolean {
  let streak = 0;
  for (const w of weeks) {
    streak = w.teamPercent > 80 ? streak + 1 : 0;
    if (streak >= 4) return true;
  }
  return false;
}

/** Horas × Receita por contratante: custo estimado, valor do contrato, resultado e margem. */
export function hoursRevenue(entries: Entry[], costCents: Map<string, number | null>, clients: { id: string; name: string; monthlyValueCents: number | null }[]) {
  const minutes = sumBy(entries, (e) => e.clientId, (e) => e.minutes);
  const cost = sumBy(entries, (e) => e.clientId, (e) => ((costCents.get(e.userId) ?? 0) * e.minutes) / 60);
  const missingCost = entries.some((e) => costCents.get(e.userId) == null);
  const rows = clients
    .filter((c) => minutes.has(c.id) || c.monthlyValueCents)
    .map((c) => {
      const costValue = Math.round(cost.get(c.id) ?? 0);
      const revenue = c.monthlyValueCents;
      const result = revenue === null ? null : revenue - costValue;
      return { clientId: c.id, clientName: c.name, minutes: minutes.get(c.id) ?? 0, costCents: costValue, revenueCents: revenue, resultCents: result, margin: revenue && result !== null ? Math.round((result / revenue) * 100) : null };
    })
    .sort((a, b) => b.minutes - a.minutes);
  return { rows, missingCost };
}

export async function monthReport(actor: Actor, month: string) {
  if (!can(actor.role, "report.view")) return null;
  const from = monthStart(`${month}-01`);
  const to = monthEnd(from);
  const db = await getDb();
  // Capacidade olha 8 semanas para trás (para o sinal de 4 semanas seguidas).
  const firstWeek = weekStart(addDays(to > todayIso() ? todayIso() : to, -49));
  const [entries, wide, types, people, clients] = await Promise.all([
    entriesBetween(actor, from, to),
    entriesBetween(actor, firstWeek, to),
    db.select({ id: s.demandTypes.id, name: s.demandTypes.name }).from(s.demandTypes),
    db.select({ id: s.users.id, name: s.users.name, weeklyHours: s.users.weeklyHours, costPerHourCents: s.users.costPerHourCents }).from(s.users).where(eq(s.users.status, "active")).orderBy(asc(s.users.name)),
    db.select({ id: s.clients.id, name: s.clients.name, monthlyValueCents: s.clients.monthlyValueCents }).from(s.clients).where(isNull(s.clients.deletedAt)),
  ]);
  const weeks: string[] = [];
  for (let w = firstWeek; w <= to && w <= todayIso(); w = addDays(w, 7)) weeks.push(w);
  const capacity = capacityByWeek(wide, people, weeks);
  const showCost = can(actor.role, "cost.view");
  return {
    from,
    to,
    totalMinutes: entries.reduce((a, e) => a + e.minutes, 0),
    byClient: hoursByClient(entries),
    byType: statsByType(entries, new Map(types.map((t) => [t.id, t.name]))),
    capacity,
    hiring: hiringSignal(capacity),
    revenue: showCost ? hoursRevenue(entries, new Map(people.map((p) => [p.id, p.costPerHourCents])), clients) : null,
  };
}

/** Painel inicial: uma tela, dados reais. O operacional vê só o que é dele. */
export async function dashboard(actor: Actor, month: string) {
  const db = await getDb();
  const today = todayIso();
  const from = monthStart(`${month}-01`);
  const to = monthEnd(from);
  const all = can(actor.role, "demand.viewAll");
  const mine = all ? undefined : eq(s.demands.assigneeId, actor.id);
  const open = and(isNull(s.demands.deletedAt), inArray(s.demands.status, OPEN_STATUSES), mine);
  const [byAssignee, [counts], [done], routinesToday] = await Promise.all([
    db
      .select({ id: s.demands.assigneeId, name: s.users.name, n: sql<number>`count(*)::int` })
      .from(s.demands)
      .leftJoin(s.users, eq(s.users.id, s.demands.assigneeId))
      .where(open)
      .groupBy(s.demands.assigneeId, s.users.name)
      .orderBy(asc(s.users.name)),
    db
      .select({
        overdue: sql<number>`count(*) filter (where ${s.demands.dueDate} < ${today})::int`,
        followUp: sql<number>`count(*) filter (where ${s.demands.status} = 'waiting' and ${s.demands.followUpDate} <= ${today})::int`,
        unassigned: sql<number>`count(*) filter (where ${s.demands.assigneeId} is null)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(s.demands)
      .where(open),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.demands)
      .where(and(isNull(s.demands.deletedAt), eq(s.demands.status, "done"), mine, gte(sql`(${s.demands.completedAt} at time zone 'America/Sao_Paulo')::date`, sql`${from}::date`), lte(sql`(${s.demands.completedAt} at time zone 'America/Sao_Paulo')::date`, sql`${to}::date`))),
    generatedToday(today),
  ]);
  const report = await monthReport(actor, month);
  return {
    byAssignee,
    open: counts?.total ?? 0,
    overdue: counts?.overdue ?? 0,
    followUp: counts?.followUp ?? 0,
    unassigned: counts?.unassigned ?? 0,
    done: done?.n ?? 0,
    routinesToday,
    revenue: report?.revenue ?? null,
    byClient: report?.byClient ?? null,
  };
}
