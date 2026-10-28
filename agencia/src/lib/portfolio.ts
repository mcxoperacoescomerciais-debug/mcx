/**
 * Atribuições e metas de visita (regras puras — usadas no app, sem internet, e no painel).
 *
 * Uma atribuição = promotor × loja × marca × N vezes por período (semana,
 * quinzena ou mês), com ou sem dias fixos. Sem dias fixos o promotor escolhe o
 * dia; o que importa é cumprir a quantidade do período.
 * Semana = segunda a domingo; quinzena = pares de semanas (contados a partir de
 * 05/01/2026); mês = mês do calendário.
 * Ritmo: até hoje, era esperado ter feito a parte proporcional dos dias corridos
 * do período (ex.: 2 por semana → 1 até quinta, 2 até domingo).
 */
import { addDays, daysBetween, weekdayOf } from "./dates";
import type { WorkMode } from "./domain";

export type TargetPeriod = "week" | "fortnight" | "month";
export const TARGET_PERIODS: TargetPeriod[] = ["week", "fortnight", "month"];
export const PERIOD_LABEL: Record<TargetPeriod, string> = { week: "por semana", fortnight: "por quinzena", month: "por mês" };
export const PERIOD_SHORT: Record<TargetPeriod, string> = { week: "sem", fortnight: "quinz", month: "mês" };

export function weekStart(iso: string): string {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

/** Segunda-feira de referência das quinzenas. */
const FORTNIGHT_EPOCH = "2026-01-05";

export function periodWindow(iso: string, period: TargetPeriod = "week"): { from: string; to: string } {
  if (period === "month") {
    const from = `${iso.slice(0, 8)}01`;
    const next = new Date(`${from}T12:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
  }
  const ws = weekStart(iso);
  if (period === "fortnight") {
    const weeks = Math.floor(daysBetween(FORTNIGHT_EPOCH, ws) / 7);
    const from = ((weeks % 2) + 2) % 2 === 0 ? ws : addDays(ws, -7);
    return { from, to: addDays(from, 13) };
  }
  return { from: ws, to: addDays(ws, 6) };
}

/** Visitas esperadas até `today` (inclusive) no período que contém `today`. */
export function expectedByToday(times: number, today: string, period: TargetPeriod = "week"): number {
  const w = periodWindow(today, period);
  const total = daysBetween(w.from, w.to) + 1;
  const elapsed = Math.min(total, Math.max(1, daysBetween(w.from, today) + 1));
  return Math.floor((times * elapsed) / total);
}

export type TargetStatus = "done" | "on_track" | "behind";

export function targetStatus(times: number, done: number, today: string, period: TargetPeriod = "week"): TargetStatus {
  if (done >= times) return "done";
  return done >= expectedByToday(times, today, period) ? "on_track" : "behind";
}

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = { done: "Meta cumprida", on_track: "No ritmo", behind: "Atrasada" };
export const TARGET_STATUS_TONE = { done: "success", on_track: "info", behind: "danger" } as const;

/** "2x por semana", "1x por quinzena"… */
export function frequencyLabel(times: number, period: TargetPeriod = "week"): string {
  return `${times}x ${PERIOD_LABEL[period]}`;
}

/** Visitas previstas num intervalo de datas (proporcional aos dias, para qualquer período). */
export function expectedInRange(times: number, period: TargetPeriod, from: string, to: string): number {
  const days = daysBetween(from, to) + 1;
  const perDay = period === "week" ? times / 7 : period === "fortnight" ? times / 14 : (times * 12) / 365;
  return Math.round(perDay * days * 10) / 10;
}

/** Forma de trabalho efetiva: a do promotor ou, se vazia, a padrão da agência. */
export function effectiveWorkMode(userMode: WorkMode | null | undefined, agencyDefault: WorkMode): WorkMode {
  return userMode ?? agencyDefault;
}

export interface WeekTotals {
  target: number;
  done: number;
  /** Visitas que contam para a meta (as a mais não somam além da meta da combinação). */
  counted: number;
  expected: number;
}

/** Totais: conta no máximo a meta de cada loja × marca. */
export function weekTotals(rows: { perWeek: number; done: number; period?: TargetPeriod; expectedFixed?: number; goal?: number }[], today: string): WeekTotals {
  return rows.reduce<WeekTotals>(
    (t, r) => ({
      target: t.target + (r.goal ?? r.perWeek),
      done: t.done + r.done,
      counted: t.counted + Math.min(r.done, r.goal ?? r.perWeek),
      // Programação com dia marcado: o esperado é o que estava programado até hoje.
      expected: t.expected + (r.expectedFixed ?? expectedByToday(r.perWeek, today, r.period ?? "week")),
    }),
    { target: 0, done: 0, counted: 0, expected: 0 },
  );
}

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function weekdaysLabel(days: number[]): string {
  return days.length ? [...days].sort().map((d) => DAY_SHORT[d]).join("/") : "sem dia fixo";
}
