/**
 * Filtros do painel, sempre refletidos na URL (o link filtrado pode ser
 * compartilhado e o "voltar" do navegador funciona).
 */
import { addDays, isIsoDate, todayIso } from "./dates";

export interface PanelFilters {
  /** Data de referência (painéis do dia). */
  date: string;
  /** Período (painéis analíticos). */
  from: string;
  to: string;
  brand: string | null;
  chain: string | null;
  store: string | null;
  promoter: string | null;
  city: string | null;
  status: string | null;
  kind: string | null;
  q: string;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: string) => (UUID.test(v) ? v : null);

export function parseFilters(params: Params, defaultDays = 7): PanelFilters {
  const today = todayIso();
  const date = isIsoDate(one(params.date)) ? one(params.date) : today;
  let to = isIsoDate(one(params.to)) ? one(params.to) : today;
  let from = isIsoDate(one(params.from)) ? one(params.from) : addDays(to, -(defaultDays - 1));
  if (from > to) [from, to] = [to, from];
  const page = Math.max(1, Math.min(10_000, Number(one(params.page)) || 1));
  return {
    date,
    from,
    to,
    brand: id(one(params.brand)),
    chain: id(one(params.chain)),
    store: id(one(params.store)),
    promoter: id(one(params.promoter)),
    city: one(params.city).trim().slice(0, 80) || null,
    status: /^[a-z_]{2,40}$/.test(one(params.status)) ? one(params.status) : null,
    kind: /^[a-z_]{2,40}$/.test(one(params.kind)) ? one(params.kind) : null,
    q: one(params.q).trim().slice(0, 80),
    page,
  };
}

/** Monta a query string mantendo os filtros atuais e trocando alguns. */
type QueryValues = Record<string, string | number | null | undefined>;
export function withParams(base: QueryValues, patch: QueryValues = {}): string {
  const merged = { ...base, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v !== null && v !== undefined && v !== "" && !(k === "page" && v === 1)) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const PAGE_SIZE = 50;

export const isUuid = (v: string) => UUID.test(v);
