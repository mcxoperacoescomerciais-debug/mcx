/** Datas sempre em America/Sao_Paulo, como texto ISO (AAAA-MM-DD). */
import { TIMEZONE } from "./domain";

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** A sexta-feira desta semana (a própria data, se hoje é sexta). */
export function nextFriday(iso: string): string {
  return addDays(iso, (5 - weekday(iso) + 7) % 7);
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function formatBr(iso: string | null | undefined): string {
  if (!iso) return "Sem prazo";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "Hoje", "Amanhã", "Ontem" ou "sex 27/11". */
export function formatRelative(iso: string | null | undefined, today: string): string {
  if (!iso) return "Sem prazo";
  if (iso === today) return "Hoje";
  if (iso === addDays(today, 1)) return "Amanhã";
  if (iso === addDays(today, -1)) return "Ontem";
  const [, m, d] = iso.split("-");
  return `${WEEKDAYS[weekday(iso)]} ${d}/${m}`;
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

/** Último dia do mês de uma data ISO. */
export function lastDayOfMonth(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string): string {
  return `${iso.slice(0, 7)}-${String(lastDayOfMonth(iso)).padStart(2, "0")}`;
}

/** Segunda-feira da semana da data. */
export function weekStart(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

export function isMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function monthLabel(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
}

/** 95 → "1h35"; 30 → "30min". */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
