/**
 * Regras de validade (vindas do sistema SUINCO) — módulo puro, usado no celular
 * (classificação instantânea enquanto o promotor digita) e no servidor
 * (gravação, painel, PDF e alerta). Uma única fonte de verdade para "quantos
 * dias faltam" e "qual a classificação".
 *
 * Datas trafegam como "YYYY-MM-DD" (sem hora, sem fuso) — ver src/lib/dates.ts.
 */
import { daysBetween } from "./dates";

export const SEVERITIES = ["expired", "critical", "high", "attention", "monitor", "normal"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  expired: "Vencido",
  critical: "Crítico",
  high: "Alto",
  attention: "Atenção",
  monitor: "Monitoramento",
  normal: "Normal",
};

/** Cores de severidade (app, painel e PDF). Sempre exibidas junto do rótulo. */
export const SEVERITY_COLOR: Record<Severity, { bg: string; fg: string; solid: string }> = {
  expired: { bg: "#FDE8E8", fg: "#8E1B1B", solid: "#B42318" },
  critical: { bg: "#FDECEC", fg: "#B42318", solid: "#E5484D" },
  high: { bg: "#FFF1E5", fg: "#9A4A00", solid: "#F07C1B" },
  attention: { bg: "#FFF8DB", fg: "#7A5B00", solid: "#E3B008" },
  monitor: { bg: "#E8F1FE", fg: "#1D4E9E", solid: "#3B82F6" },
  normal: { bg: "#E7F6EC", fg: "#1D6B3A", solid: "#2F9E5B" },
};

export interface SeverityBands {
  /** Limite superior (inclusive) de cada faixa, em dias para vencer. */
  critical: number;
  high: number;
  attention: number;
  monitor: number;
}

export const DEFAULT_BANDS: SeverityBands = { critical: 3, high: 7, attention: 15, monitor: 30 };

export function classify(daysToExpiry: number, bands: SeverityBands = DEFAULT_BANDS): Severity {
  if (daysToExpiry < 0) return "expired";
  if (daysToExpiry <= bands.critical) return "critical";
  if (daysToExpiry <= bands.high) return "high";
  if (daysToExpiry <= bands.attention) return "attention";
  if (daysToExpiry <= bands.monitor) return "monitor";
  return "normal";
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, "0");

export type ParsedExpiry = { ok: true; iso: string; inferredYear: boolean } | { ok: false; reason: "incomplete" | "invalid" };

/**
 * Interpreta o que o promotor digita no campo de validade (só números):
 *   "0510" → 05/10 do ano inferido · "051026" → 05/10/2026 · "05102026" → 05/10/2026.
 * Sem ano: assume o ano da visita; se cair mais de 60 dias no passado, o ano seguinte.
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

/** "0510" → "05/10" (máscara visual do campo). */
export function maskExpiryDigits(digits: string): string {
  const c = digits.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

/** "2026-10-05" → "05102026" (dígitos para reabrir o campo em edição). */
export function isoToDigits(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}${m}${y}`;
}

export interface PlausibilityWarning {
  message: string;
  /** Correção sugerida em 1 toque (ex.: 2016 → 2026). */
  suggestionIso?: string;
}

/** Datas válidas mas improváveis pedem confirmação, não bloqueio. */
export function plausibilityWarning(iso: string, referenceIso: string): PlausibilityWarning | null {
  const diff = daysBetween(referenceIso, iso);
  const refYear = Number(referenceIso.slice(0, 4));
  if (diff < -60) {
    const [, m, d] = iso.split("-").map(Number);
    const candidate = `${refYear}-${pad(m)}-${pad(d)}`;
    const suggestion = isValidDate(refYear, m, d) && daysBetween(referenceIso, candidate) >= -60 ? candidate : undefined;
    return { message: `Esta data venceu há ${Math.abs(diff)} dias. Confira o ano.`, suggestionIso: suggestion };
  }
  if (diff > 730) return { message: "Validade com mais de 2 anos. Confira o ano." };
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
  return `vence em ${days} dias`;
}

export interface AlertRule {
  /** Vencido ou vencendo em até `bands.critical` dias. */
  bands: SeverityBands;
  /** Validade próxima: vencendo em até `nearDays` dias, qualquer quantidade. */
  nearDays?: number;
  /** Grande quantidade: vencendo em até `bulkDays` dias e quantidade acima de `bulkMinQty`. */
  bulkDays: number;
  bulkMinQty: number;
}

/** Item de validade que entra no alerta de WhatsApp (mesma regra no servidor e nos testes). */
export function isAlertItem(daysToExpiry: number, quantity: number, rule: AlertRule): boolean {
  return daysToExpiry <= alertNearDays(rule) || (daysToExpiry <= rule.bulkDays && quantity > rule.bulkMinQty);
}

/** Até quantos dias qualquer quantidade entra no alerta (o maior entre "Crítico até" e "Validade próxima"). */
export function alertNearDays(rule: AlertRule): number {
  return Math.max(rule.bands.critical, rule.nearDays ?? 0);
}
