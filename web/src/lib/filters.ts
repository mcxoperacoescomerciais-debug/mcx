/**
 * Filtros do painel — lidos e gravados na URL (?periodo=7d&rede=...), então
 * qualquer visão filtrada pode ser compartilhada por link.
 */
import { addDays, todayIso } from "./validity";

export const PERIODS = {
  hoje: "Hoje",
  "7d": "Últimos 7 dias",
  "15d": "Últimos 15 dias",
  "30d": "Últimos 30 dias",
  mes: "Mês atual",
  "mes-anterior": "Mês anterior",
  custom: "Personalizado",
} as const;
export type PeriodKey = keyof typeof PERIODS;

export interface DashboardFilters {
  period: PeriodKey;
  from?: string;
  to?: string;
  networkId?: string;
  storeId?: string;
  city?: string;
  promoterId?: string;
  productId?: string;
  category?: string;
  type?: "validity" | "rupture" | "damage";
}

export interface DateRange {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  label: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(sp: Record<string, string | string[] | undefined>, defaultPeriod: PeriodKey = "7d"): DashboardFilters {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length < 100 ? s : undefined;
  };
  const period = (one("periodo") as PeriodKey) in PERIODS ? (one("periodo") as PeriodKey) : defaultPeriod;
  const type = one("tipo");
  return {
    period,
    from: ISO.test(one("de") ?? "") ? one("de") : undefined,
    to: ISO.test(one("ate") ?? "") ? one("ate") : undefined,
    networkId: one("rede"),
    storeId: one("loja"),
    city: one("cidade"),
    promoterId: one("promotor"),
    productId: one("produto"),
    category: one("categoria"),
    type: type === "validity" || type === "rupture" || type === "damage" ? type : undefined,
  };
}

export function filtersToQuery(f: Partial<DashboardFilters>): string {
  const map: Record<string, string | undefined> = {
    periodo: f.period,
    de: f.period === "custom" ? f.from : undefined,
    ate: f.period === "custom" ? f.to : undefined,
    rede: f.networkId,
    loja: f.storeId,
    cidade: f.city,
    promotor: f.promoterId,
    produto: f.productId,
    categoria: f.category,
    tipo: f.type,
  };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(map)) if (v) p.set(k, v);
  return p.toString();
}

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function fmt(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Intervalo do período + intervalo anterior de mesmo tamanho (para as variações). */
export function resolveRange(f: DashboardFilters, today = todayIso()): DateRange {
  let from: string;
  let to = today;
  switch (f.period) {
    case "hoje":
      from = today;
      break;
    case "15d":
      from = addDays(today, -14);
      break;
    case "30d":
      from = addDays(today, -29);
      break;
    case "mes":
      from = monthStart(today);
      break;
    case "mes-anterior": {
      const firstThis = monthStart(today);
      to = addDays(firstThis, -1);
      from = monthStart(to);
      break;
    }
    case "custom":
      from = f.from ?? addDays(today, -6);
      to = f.to ?? today;
      if (from > to) [from, to] = [to, from];
      break;
    default:
      from = addDays(today, -6);
  }
  const len = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  const label = f.period === "custom" || f.period === "mes-anterior" ? `${fmt(from)} a ${fmt(to)}` : PERIODS[f.period];
  return { from, to, prevFrom, prevTo, label };
}
