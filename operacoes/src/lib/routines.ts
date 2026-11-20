/** Recorrência das rotinas: em que datas uma rotina "acontece". Funções puras. */
import { addDays, lastDayOfMonth, monthLabel, weekday, formatBr } from "./dates";

export type Frequency = "weekly" | "monthly" | "interval";
export const FREQUENCY_LABEL: Record<Frequency, string> = { weekly: "Semanal", monthly: "Mensal", interval: "A cada N dias" };
export const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export interface RoutineRule {
  frequency: Frequency;
  weekdays: number[];
  monthDay: number | null;
  intervalDays: number | null;
  startDate: string;
}

export function occursOn(rule: RoutineRule, day: string): boolean {
  if (day < rule.startDate) return false;
  if (rule.frequency === "weekly") return rule.weekdays.includes(weekday(day));
  if (rule.frequency === "monthly") {
    if (!rule.monthDay) return false;
    // Mês curto: dia 31 cai no último dia do mês.
    return Number(day.slice(8, 10)) === Math.min(rule.monthDay, lastDayOfMonth(day));
  }
  if (!rule.intervalDays || rule.intervalDays < 1) return false;
  const diff = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${rule.startDate}T12:00:00Z`)) / 86_400_000);
  return diff % rule.intervalDays === 0;
}

/** Ocorrências entre duas datas (inclusive). */
export function occurrencesBetween(rule: RoutineRule, from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) if (occursOn(rule, day)) out.push(day);
  return out;
}

/** Título da demanda gerada: "Fechamento mensal Barão — nov/2026" ou "… — 27/11/2026". */
export function routineTitle(name: string, frequency: Frequency, occurrence: string): string {
  return `${name} — ${frequency === "monthly" ? monthLabel(occurrence) : formatBr(occurrence)}`;
}

export function describeRule(rule: RoutineRule): string {
  if (rule.frequency === "weekly") return `Toda ${rule.weekdays.map((d) => WEEKDAY_LABEL[d]).join(", ") || "semana"}`;
  if (rule.frequency === "monthly") return `Todo dia ${rule.monthDay} do mês`;
  return `A cada ${rule.intervalDays} dias`;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
