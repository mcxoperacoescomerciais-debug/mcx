/**
 * Calculadora de degustação: quanto cobrar por ação em cada cidade para não ter
 * prejuízo e para chegar à margem desejada. Funções puras (tela e testes).
 *
 * Custeio variável: a calculadora não rateia despesas administrativas (elas
 * entram no DRE geral). Preço P de uma cidade com custo direto C:
 *   P − impostos(P) − C = margem de contribuição(P)
 *   ⇒ P = C ÷ (1 − imposto% − margem%)
 * Preço mínimo (empate) = C ÷ (1 − imposto%).
 *
 * Deslocamento pelo km: litros = km ÷ km por litro do veículo; custo = litros ×
 * preço do combustível. Transporte é por ação (× ações); frete é por viagem
 * (× viagens, muitas vezes só 1: levar o material do balcão até a loja).
 */

export interface CalcGlobals {
  /** Impostos sobre o faturamento (%), ex.: Simples Nacional. */
  taxPct: number;
  /** Não usado: despesas administrativas entram no DRE geral (mantido para orçamentos antigos). */
  adminPct?: number;
  /** Margem de contribuição desejada sobre o preço (%), antes das despesas administrativas. */
  marginPct: number;
  /** Preço do litro do combustível (R$), usado no transporte e no frete calculados pelo km. */
  fuelPrice?: number;
}

export const DEFAULT_FUEL_PRICE = 6.2;

/** Uma cidade do pedido da marca. */
export interface CalcCity {
  city: string;
  /** Quantas ações (dias × lojas) na cidade. */
  actions: number;
  /** Degustadoras por ação. */
  tasters: number;
  /** Cachê de cada degustadora por ação (R$). */
  tasterFee: number;
  /** Alimentação de cada degustadora por ação (R$). */
  meal: number;
  /** Descartáveis e consumíveis por ação (copinhos, guardanapos, mexedores…). */
  consumables: number;
  /** Produto que a agência compra para degustar, por ação (0 se a marca fornece). */
  product: number;
  /** Desgaste/aluguel de equipamentos por ação (air fryer, máquina de café…). */
  equipment: number;
  /** Km rodados (ida e volta) em cada ação; com o km/l, calcula o transporte por ação. */
  transportKm: number;
  /** Km por litro do veículo do transporte (ex.: 10, 18, 30). */
  transportKml: number;
  /** Transporte por ação (R$) digitado, quando não calcula pelo km. */
  transport: number;
  /** Hospedagem e diárias da equipe na cidade (total). */
  lodging: number;
  /** Km rodados (ida e volta) em cada viagem de frete. */
  freightKm: number;
  /** Km por litro do veículo do frete. */
  freightKml: number;
  /** Viagens de frete no período (normalmente 1). */
  freightTrips: number;
  /** Frete por viagem (R$) digitado, quando não calcula pelo km. */
  freight: number;
  /** Supervisão e coordenação dedicada à cidade (total). */
  supervision: number;
  /** Preço que a marca propõe/aceita por ação (opcional) para ver a margem real. */
  offeredPrice: number | null;
}

export interface CityResult {
  city: string;
  actions: number;
  /** Custos que se repetem a cada ação (inclui o transporte). */
  perActionCost: number;
  /** Transporte por ação (calculado pelo km ou digitado) e total (× ações). */
  transportPerAction: number;
  transportTotal: number;
  /** Frete por viagem e total (× viagens). */
  freightPerTrip: number;
  freightTotal: number;
  variableCost: number;
  /** Custos da cidade (frete, hospedagem, supervisão), rateados nas ações. */
  fixedCost: number;
  directCost: number;
  costPerAction: number;
  /** Preço mínimo por ação para não ter prejuízo (paga impostos e os custos da ação). */
  breakEvenPerAction: number;
  /** Preço por ação que entrega a margem desejada. */
  suggestedPerAction: number;
  suggestedTotal: number;
  /** Com o preço oferecido pela marca (quando informado). */
  offered: { perAction: number; revenue: number; result: number; margin: number | null } | null;
  /** Ações mínimas na cidade para os custos fixos não passarem do preço sugerido (informativo). */
  feasible: boolean;
}

export interface CalcResult {
  cities: CityResult[];
  totals: {
    actions: number;
    directCost: number;
    suggestedTotal: number;
    breakEvenTotal: number;
    /** Preço único por ação que entrega a margem desejada no pedido inteiro. */
    uniquePrice: number;
    /** Com o preço único, o resultado de cada cidade (para ver qual sustenta qual). */
    uniqueByCity: { city: string; revenue: number; result: number; margin: number | null }[];
    offeredRevenue: number | null;
    offeredResult: number | null;
    offeredMargin: number | null;
  };
  /** Divisor inválido (impostos + margem ≥ 100%). */
  invalid: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Custo de combustível de um trajeto: km ÷ km/l × R$/litro (0 se faltar km ou km/l). */
export function fuelCost(km: number, kml: number, fuelPrice: number) {
  return n(km) && n(kml) ? (n(km) / n(kml)) * n(fuelPrice) : 0;
}

/** Transporte por ação e frete por viagem: pelo km quando informado, senão o valor digitado. */
export function logistics(c: Pick<CalcCity, "transportKm" | "transportKml" | "transport" | "freightKm" | "freightKml" | "freight">, fuelPrice: number) {
  const transportByKm = n(c.transportKm) > 0;
  const freightByKm = n(c.freightKm) > 0;
  return {
    transportByKm,
    freightByKm,
    transport: transportByKm ? fuelCost(c.transportKm, c.transportKml, fuelPrice) : n(c.transport),
    freight: freightByKm ? fuelCost(c.freightKm, c.freightKml, fuelPrice) : n(c.freight),
  };
}

export function calcTasting(g: CalcGlobals, cities: CalcCity[]): CalcResult {
  const tax = n(g.taxPct) / 100;
  const margin = n(g.marginPct) / 100;
  const keepBE = 1 - tax;
  const keep = keepBE - margin;
  const invalid = keep <= 0 || keepBE <= 0;
  const fuel = g.fuelPrice === undefined ? DEFAULT_FUEL_PRICE : n(g.fuelPrice);
  const results: CityResult[] = cities.map((c) => {
    const actions = Math.max(0, Math.round(n(c.actions)));
    const people = Math.max(1, Math.round(n(c.tasters)) || 1);
    const lg = logistics(c, fuel);
    const freightTrips = Math.max(1, Math.round(n(c.freightTrips)) || 1);
    const freightTotal = lg.freight * freightTrips;
    const perActionCost = people * (n(c.tasterFee) + n(c.meal)) + lg.transport + n(c.consumables) + n(c.product) + n(c.equipment);
    const variableCost = perActionCost * actions;
    const fixedCost = freightTotal + n(c.lodging) + n(c.supervision);
    const directCost = variableCost + fixedCost;
    const costPerAction = actions ? directCost / actions : 0;
    const breakEvenPerAction = invalid || !actions ? 0 : costPerAction / keepBE;
    const suggestedPerAction = invalid || !actions ? 0 : costPerAction / keep;
    const offeredPrice = c.offeredPrice !== null && Number.isFinite(c.offeredPrice) && c.offeredPrice > 0 ? c.offeredPrice : null;
    let offered: CityResult["offered"] = null;
    if (offeredPrice !== null && actions) {
      const revenue = offeredPrice * actions;
      const result = revenue * keepBE - directCost;
      offered = { perAction: r2(offeredPrice), revenue: r2(revenue), result: r2(result), margin: revenue ? Math.round((result / revenue) * 1000) / 10 : null };
    }
    return {
      city: c.city.trim() || "Cidade",
      actions,
      perActionCost: r2(perActionCost),
      transportPerAction: r2(lg.transport),
      transportTotal: r2(lg.transport * actions),
      freightPerTrip: r2(lg.freight),
      freightTotal: r2(freightTotal),
      variableCost: r2(variableCost),
      fixedCost: r2(fixedCost),
      directCost: r2(directCost),
      costPerAction: r2(costPerAction),
      breakEvenPerAction: r2(breakEvenPerAction),
      suggestedPerAction: r2(suggestedPerAction),
      suggestedTotal: r2(suggestedPerAction * actions),
      offered,
      feasible: actions > 0,
    };
  });
  const actions = results.reduce((t, c) => t + c.actions, 0);
  const directCost = results.reduce((t, c) => t + c.directCost, 0);
  const uniquePrice = invalid || !actions ? 0 : directCost / actions / keep;
  const uniqueByCity = results.map((c) => {
    const revenue = uniquePrice * c.actions;
    const result = revenue * keepBE - c.directCost;
    return { city: c.city, revenue: r2(revenue), result: r2(result), margin: revenue ? Math.round((result / revenue) * 1000) / 10 : null };
  });
  const withOffer = results.filter((c) => c.offered);
  const offeredRevenue = withOffer.length ? withOffer.reduce((t, c) => t + c.offered!.revenue, 0) : null;
  const offeredResult = withOffer.length ? withOffer.reduce((t, c) => t + c.offered!.result, 0) : null;
  return {
    cities: results,
    totals: {
      actions,
      directCost: r2(directCost),
      suggestedTotal: r2(results.reduce((t, c) => t + c.suggestedTotal, 0)),
      breakEvenTotal: r2(results.reduce((t, c) => t + c.breakEvenPerAction * c.actions, 0)),
      uniquePrice: r2(uniquePrice),
      uniqueByCity,
      offeredRevenue: offeredRevenue === null ? null : r2(offeredRevenue),
      offeredResult: offeredResult === null ? null : r2(offeredResult),
      offeredMargin: offeredRevenue ? Math.round((offeredResult! / offeredRevenue) * 1000) / 10 : null,
    },
    invalid,
  };
}

export function blankCity(city = ""): CalcCity {
  return { city, actions: 4, tasters: 1, tasterFee: 0, meal: 0, transportKm: 0, transportKml: 10, transport: 0, consumables: 0, product: 0, equipment: 0, freightKm: 0, freightKml: 10, freightTrips: 1, freight: 0, lodging: 0, supervision: 0, offeredPrice: null };
}

/**
 * Lê uma cidade salva (inclusive orçamentos do modelo antigo, que tinham
 * transporte por degustadora e km × R$/km × viagens da cidade).
 */
export function normalizeCity(raw: unknown): CalcCity {
  const o = (raw ?? {}) as Record<string, unknown>;
  const v = (k: string, max = 1_000_000) => {
    const x = o[k];
    return typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= max ? x : 0;
  };
  const has = (k: string) => typeof o[k] === "number";
  const tasters = Math.max(1, Math.round(v("tasters", 20)) || 1);
  const c: CalcCity = {
    ...blankCity(String(o.city ?? "").slice(0, 80)),
    actions: Math.round(v("actions", 1000)),
    tasters,
    tasterFee: v("tasterFee"),
    meal: v("meal"),
    consumables: v("consumables"),
    product: v("product"),
    equipment: v("equipment"),
    lodging: v("lodging"),
    supervision: v("supervision"),
    freight: v("freight"),
    offeredPrice: typeof o.offeredPrice === "number" && Number.isFinite(o.offeredPrice) && o.offeredPrice > 0 ? o.offeredPrice : null,
  };
  if (has("transportKm") || has("transport")) {
    c.transportKm = v("transportKm", 10000);
    c.transportKml = v("transportKml", 100) || 10;
    c.transport = v("transport");
    c.freightKm = v("freightKm", 10000);
    c.freightKml = v("freightKml", 100) || 10;
    c.freightTrips = Math.max(1, Math.round(v("freightTrips", 100)) || 1);
  } else {
    // Modelo antigo: transporte por degustadora vira transporte por ação; o deslocamento da cidade soma no frete.
    c.transport = Math.round(v("tasterTransport") * tasters * 100) / 100;
    const route = v("km", 10000) * v("costPerKm", 100) * Math.max(1, Math.round(v("trips", 100)) || 1);
    c.freight = Math.round((c.freight + route) * 100) / 100;
  }
  return c;
}
