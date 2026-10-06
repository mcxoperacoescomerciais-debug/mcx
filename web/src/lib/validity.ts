/**
 * Regras de validade — módulo puro, usado no celular (classificação instantânea
 * enquanto o promotor digita) e no servidor (gravação e relatórios). Uma única
 * fonte de verdade para "quantos dias faltam" e "qual a classificação".
 *
 * Datas trafegam como string ISO "YYYY-MM-DD" (sem hora, sem fuso) para evitar
 * o clássico erro de um dia a menos causado por conversão de fuso.
 */
import type { Severity } from "./domain";

export interface SeverityBands {
  /** Limite superior (inclusive) de cada faixa, em dias. */
  critical: number;
  high: number;
  attention: number;
  monitor: number;
}

export const DEFAULT_BANDS: SeverityBands = { critical: 3, high: 7, attention: 15, monitor: 30 };

/** Fuso operacional: a "data de hoje" é a de Brasília, não a do servidor (UTC). */
export const OPERATION_TZ = "America/Sao_Paulo";

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: OPERATION_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function isoToUtcMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMs(toIso) - isoToUtcMs(fromIso)) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  return new Date(isoToUtcMs(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

export function classify(daysToExpiry: number, bands: SeverityBands = DEFAULT_BANDS): Severity {
  if (daysToExpiry < 0) return "expired";
  if (daysToExpiry <= bands.critical) return "critical";
  if (daysToExpiry <= bands.high) return "high";
  if (daysToExpiry <= bands.attention) return "attention";
  if (daysToExpiry <= bands.monitor) return "monitor";
  return "normal";
}

/** "Próximo ao vencimento" = qualquer faixa entre crítico e monitoramento. */
export function isNearExpiry(severity: Severity | null | undefined): boolean {
  return severity === "critical" || severity === "high" || severity === "attention" || severity === "monitor";
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= daysInMonth;
}

const pad = (n: number) => String(n).padStart(2, "0");

export type ParsedExpiry =
  | { ok: true; iso: string; inferredYear: boolean }
  | { ok: false; reason: "incomplete" | "invalid" };

/**
 * Interpreta o que o promotor digita no campo de validade (só números):
 *   "0510"     → 05/10 do ano inferido
 *   "051026"   → 05/10/2026
 *   "05102026" → 05/10/2026
 * Sem ano: assume o ano da visita; se isso cair mais de 60 dias no passado,
 * assume o ano seguinte (validade "05/01" digitada em dezembro = janeiro que vem).
 * Datas impossíveis ("28/20") nunca passam.
 */
export function parseExpiryDigits(digits: string, referenceIso: string): ParsedExpiry {
  const clean = digits.replace(/\D/g, "");
  if (clean.length < 4 || clean.length === 5 || clean.length === 7) return { ok: false, reason: "incomplete" };
  if (clean.length > 8) return { ok: false, reason: "invalid" };

  const d = Number(clean.slice(0, 2));
  const m = Number(clean.slice(2, 4));
  const refYear = Number(referenceIso.slice(0, 4));

  if (clean.length === 4) {
    if (!isValidDate(refYear, m, d) && !isValidDate(refYear + 1, m, d)) return { ok: false, reason: "invalid" };
    let y = refYear;
    if (!isValidDate(y, m, d) || daysBetween(referenceIso, `${y}-${pad(m)}-${pad(d)}`) < -60) y += 1;
    return { ok: true, iso: `${y}-${pad(m)}-${pad(d)}`, inferredYear: true };
  }

  const y = clean.length === 6 ? 2000 + Number(clean.slice(4, 6)) : Number(clean.slice(4, 8));
  if (!isValidDate(y, m, d)) return { ok: false, reason: "invalid" };
  return { ok: true, iso: `${y}-${pad(m)}-${pad(d)}`, inferredYear: false };
}

/** Formata os dígitos digitados como máscara visual: "0510" → "05/10". */
export function maskExpiryDigits(digits: string): string {
  const c = digits.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

export interface PlausibilityWarning {
  message: string;
  /** Correção sugerida em 1 toque (ex.: 2016 → 2026). */
  suggestionIso?: string;
}

/**
 * Datas válidas mas improváveis pedem confirmação, não bloqueio:
 * - vencida há mais de 60 dias (pega o erro "07/12/2016");
 * - mais de 2 anos no futuro.
 */
export function plausibilityWarning(iso: string, referenceIso: string): PlausibilityWarning | null {
  const diff = daysBetween(referenceIso, iso);
  const refYear = Number(referenceIso.slice(0, 4));
  if (diff < -60) {
    const [, m, d] = iso.split("-").map(Number);
    const candidate = `${refYear}-${pad(m)}-${pad(d)}`;
    const suggestion =
      isValidDate(refYear, m, d) && daysBetween(referenceIso, candidate) >= -60 ? candidate : undefined;
    return { message: `Esta data venceu há ${Math.abs(diff)} dias. Confira o ano.`, suggestionIso: suggestion };
  }
  if (diff > 730) {
    return { message: "Validade com mais de 2 anos. Confira o ano." };
  }
  return null;
}

export function formatIsoBr(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

export function describeDays(days: number): string {
  if (days < 0) return `vencido há ${Math.abs(days)} ${Math.abs(days) === 1 ? "dia" : "dias"}`;
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `${days} dias`;
}
