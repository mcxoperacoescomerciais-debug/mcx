/**
 * Datas no fuso da operação (Belo Horizonte = America/Sao_Paulo).
 *
 * Datas de calendário trafegam como "YYYY-MM-DD" (sem hora, sem fuso) para
 * evitar o erro clássico de "um dia a menos". Instantes (início/fim) trafegam
 * como ISO completo em UTC e só são formatados no fuso na hora de exibir.
 */
export const OPERATION_TZ = "America/Sao_Paulo";

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OPERATION_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function isoDateOf(instant: Date | string): string {
  return todayIso(typeof instant === "string" ? new Date(instant) : instant);
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return new Date(isoToUtcMs(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
export function weekdayOf(iso: string): number {
  return new Date(isoToUtcMs(iso)).getUTCDay();
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Minutos desde 00:00 no fuso da operação. */
export function minutesOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: OPERATION_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

export function hhmmToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("pt-BR", { timeZone: OPERATION_TZ, ...options });
    fmtCache.set(key, f);
  }
  return f;
}

type Instant = Date | string | null | undefined;
const asDate = (v: Instant) => (v ? (typeof v === "string" ? new Date(v) : v) : null);

/** 14:05 */
export function fmtTime(v: Instant): string {
  const d = asDate(v);
  return d ? fmt({ hour: "2-digit", minute: "2-digit" }).format(d) : "—";
}

/** 10/10/2026 14:05 */
export function fmtDateTime(v: Instant): string {
  const d = asDate(v);
  return d ? fmt({ day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) : "—";
}

/** "2026-10-10" → 10/10/2026 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10-10" → sábado, 10 de outubro */
export function fmtLongDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(isoToUtcMs(iso)));
}

/** "há 5 min", "há 2 h", "ontem 18:20" */
export function fmtAgo(v: Instant, now: Date = new Date()): string {
  const d = asDate(v);
  if (!d) return "—";
  const min = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 12 * 60 && todayIso(d) === todayIso(now)) return `há ${Math.floor(min / 60)} h`;
  if (todayIso(d) === todayIso(now)) return `hoje ${fmtTime(d)}`;
  if (todayIso(d) === addDays(todayIso(now), -1)) return `ontem ${fmtTime(d)}`;
  return fmtDateTime(d);
}

/** Duração em "1 h 05 min" / "25 min". */
export function fmtDuration(from: Instant, to: Instant): string {
  const a = asDate(from);
  const b = asDate(to);
  if (!a || !b) return "—";
  const min = Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}
