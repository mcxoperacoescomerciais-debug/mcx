/**
 * Filtros salvos por tela: ao voltar para uma aba do painel, os filtros que a
 * pessoa deixou marcados continuam valendo até ela mesma desmarcar (ou clicar
 * em "Limpar filtros"). Fica no aparelho (localStorage), separado por agência
 * e por tela. Datas só valem no mesmo dia — no dia seguinte a tela volta ao
 * período padrão, mas marcas, redes, lojas, promotores etc. continuam.
 */
export const FILTER_KEYS = ["date", "from", "to", "brand", "chain", "store", "promoter", "city", "status", "kind", "q"] as const;
const DATE_KEYS = new Set(["date", "from", "to"]);

export interface SavedFilters {
  day: string;
  values: Record<string, string>;
}

export const savedFiltersKey = (agency: string, pathname: string) => `mcx-filtros:${agency}:${pathname}`;

/** Só os filtros (sem página, aba etc.) que estão preenchidos. */
export function pickFilters(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
}

/** O que deve voltar para a URL (datas de outro dia ficam de fora). */
export function filtersToRestore(saved: SavedFilters | null, today: string): Record<string, string> {
  if (!saved || typeof saved !== "object" || !saved.values) return {};
  const out: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = saved.values[k];
    if (typeof v !== "string" || !v) continue;
    if (DATE_KEYS.has(k) && saved.day !== today) continue;
    out[k] = v;
  }
  return out;
}

export function readSavedFilters(key: string): SavedFilters | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SavedFilters) : null;
  } catch {
    return null;
  }
}

export function writeSavedFilters(key: string, values: Record<string, string>, today: string) {
  try {
    if (Object.keys(values).length) localStorage.setItem(key, JSON.stringify({ day: today, values } satisfies SavedFilters));
    else localStorage.removeItem(key);
  } catch {
    // Sem localStorage (aba anônima bloqueada etc.): o filtro só não fica salvo.
  }
}
