/**
 * Leitura dos campos da correção feita pelo gestor (formulário do painel) e o texto
 * do que mudou, gravado no histórico. Funções puras: usadas no servidor e nos testes.
 */

/** Data do campo <input type="date"> (AAAA-MM-DD); null se não for uma data real. */
export function parseCorrectionDate(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Quantidade inteira a partir de `min`; null se inválida. */
export function parseCorrectionQuantity(raw: string, min: number): number | null {
  const t = raw.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= 100_000 ? n : null;
}

/** Preço "12,90", "1.234,56" ou "12.9". Vazio = sem preço (null); inválido = undefined. */
export function parseCorrectionPrice(raw: string): number | null | undefined {
  const t = raw.trim().replace(/^R\$\s*/i, "");
  if (!t) return null;
  if (!/^\d[\d.,]*$/.test(t)) return undefined;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return undefined;
  return Math.round(n * 100) / 100;
}

/** "validade 20/11/2026 → 20/11/2027; preço R$ 9,90 → R$ 12,90" — só o que mudou; null se nada mudou. */
export function correctionSummary(fields: [label: string, before: string, after: string][]): string | null {
  const changed = fields.filter(([, before, after]) => before !== after).map(([label, before, after]) => `${label} ${before} → ${after}`);
  return changed.length ? changed.join("; ") : null;
}
