/**
 * Carteira com meta semanal (regras puras — usadas no app, sem internet, e no painel).
 *
 * A meta é "N visitas por semana" em cada marca de cada loja. A semana vai de
 * segunda a domingo. O promotor escolhe o dia; o que importa é cumprir a meta.
 * Ritmo: até hoje, era esperado ter feito a parte proporcional dos dias
 * corridos da semana (ex.: meta 2 → 1 até quinta, 2 até domingo).
 */
import { addDays, daysBetween, weekdayOf } from "./dates";
import type { WorkMode } from "./domain";

export function weekStart(iso: string): string {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7));
}

export function weekEnd(iso: string): string {
  return addDays(weekStart(iso), 6);
}

/** Visitas esperadas até `today` (inclusive) para uma meta semanal. */
export function expectedByToday(perWeek: number, today: string): number {
  const elapsed = Math.min(7, Math.max(1, daysBetween(weekStart(today), today) + 1));
  return Math.floor((perWeek * elapsed) / 7);
}

export type TargetStatus = "done" | "on_track" | "behind";

export function targetStatus(perWeek: number, done: number, today: string): TargetStatus {
  if (done >= perWeek) return "done";
  return done >= expectedByToday(perWeek, today) ? "on_track" : "behind";
}

export const TARGET_STATUS_LABEL: Record<TargetStatus, string> = { done: "Meta cumprida", on_track: "No ritmo", behind: "Atrasada" };
export const TARGET_STATUS_TONE = { done: "success", on_track: "info", behind: "danger" } as const;

/** Forma de trabalho efetiva: a do promotor ou, se vazia, a padrão da agência. */
export function effectiveWorkMode(userMode: WorkMode | null | undefined, agencyDefault: WorkMode): WorkMode {
  return userMode ?? agencyDefault;
}

export interface WeekTotals {
  target: number;
  done: number;
  /** Visitas que contam para a meta (a mais não somam além da meta da combinação). */
  counted: number;
  expected: number;
}

/** Totais da semana: conta no máximo a meta de cada loja × marca. */
export function weekTotals(rows: { perWeek: number; done: number }[], today: string): WeekTotals {
  return rows.reduce<WeekTotals>(
    (t, r) => ({
      target: t.target + r.perWeek,
      done: t.done + r.done,
      counted: t.counted + Math.min(r.done, r.perWeek),
      expected: t.expected + expectedByToday(r.perWeek, today),
    }),
    { target: 0, done: 0, counted: 0, expected: 0 },
  );
}
