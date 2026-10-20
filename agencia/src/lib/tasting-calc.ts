/**
 * Calculadora de degustação: quanto cobrar por ação em cada cidade para não ter
 * prejuízo e para chegar à margem desejada. Funções puras (tela e testes).
 *
 * Custeio variável: a calculadora não rateia despesas administrativas (elas
 * entram no DRE geral). Preço P de uma cidade com custo direto C:
 *   P − impostos(P) − C = margem de contribuição(P)
 *   ⇒ P = C ÷ (1 − imposto% − margem%)
 * Preço mínimo (empate) = C ÷ (1 − imposto%).
 */

export interface CalcGlobals {
  /** Impostos sobre o faturamento (%), ex.: Simples Nacional. */
  taxPct: number;
  /** Não usado: despesas administrativas entram no DRE geral (mantido para orçamentos antigos). */
  adminPct?: number;
  /** Margem de contribuição desejada sobre o preço (%), antes das despesas administrativas. */
  marginPct: number;
}

/** Uma cidade do pedido da marca. */
export interface CalcCity {
  city: string;
  /** Quantas ações (dias × lojas) na cidade. */
  actions: number;
  /** Degustadoras por ação. */
  tasters: number;
  /** Cachê de cada degustadora por ação (R$). */
  tasterFee: number;
  /** Transporte de cada degustadora por ação (R$). */
  tasterTransport: number;
  /** Alimentação de cada degustadora por ação (R$). */
  meal: number;
  /** Descartáveis e consumíveis por ação (copinhos, guardanapos, mexedores…). */
  consumables: number;
  /** Produto que a agência compra para degustar, por ação (0 se a marca fornece). */
  product: number;
  /** Desgaste/aluguel de equipamentos por ação (air fryer, máquina de café…). */
  equipment: number;
  /** Quilômetros de ida e volta da equipe até a cidade (uma vez por viagem). */
  km: number;
  /** Custo por km (combustível + desgaste do veículo). */
  costPerKm: number;
  /** Viagens da equipe/supervisão até a cidade no período. */
  trips: number;
  /** Hospedagem e diárias da equipe na cidade (total). */
  lodging: number;
  /** Frete de materiais e equipamentos até a cidade (total). */
  freight: number;
  /** Supervisão e coordenação dedicada à cidade (total). */
  supervision: number;
  /** Preço que a marca propõe/aceita por ação (opcional) para ver a margem real. */
  offeredPrice: number | null;
}

export interface CityResult {
  city: string;
  actions: number;
  /** Custos que se repetem a cada ação. */
  perActionCost: number;
  variableCost: number;
  /** Custos da cidade (deslocamento, hospedagem, frete, supervisão), rateados nas ações. */
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

export function calcTasting(g: CalcGlobals, cities: CalcCity[]): CalcResult {
  const tax = n(g.taxPct) / 100;
  const margin = n(g.marginPct) / 100;
  const keepBE = 1 - tax;
  const keep = keepBE - margin;
  const invalid = keep <= 0 || keepBE <= 0;
  const results: CityResult[] = cities.map((c) => {
    const actions = Math.max(0, Math.round(n(c.actions)));
    const people = Math.max(1, Math.round(n(c.tasters)) || 1);
    const perActionCost = people * (n(c.tasterFee) + n(c.tasterTransport) + n(c.meal)) + n(c.consumables) + n(c.product) + n(c.equipment);
    const variableCost = perActionCost * actions;
    const fixedCost = n(c.km) * n(c.costPerKm) * Math.max(1, Math.round(n(c.trips)) || 1) * (n(c.km) ? 1 : 0) + n(c.lodging) + n(c.freight) + n(c.supervision);
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
  return { city, actions: 4, tasters: 1, tasterFee: 0, tasterTransport: 0, meal: 0, consumables: 0, product: 0, equipment: 0, km: 0, costPerKm: 1.2, trips: 1, lodging: 0, freight: 0, supervision: 0, offeredPrice: null };
}
