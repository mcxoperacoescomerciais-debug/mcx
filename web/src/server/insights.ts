/**
 * Insights automáticos — regras determinísticas sobre os dados agregados.
 *
 * Cada regra: calcula uma métrica para testa uma condição com AMOSTRA MÍNIMA →
 * escreve a frase com os números reais. Nenhuma frase é gerada sem base
 * estatística, e nenhuma informação é inventada. Um modelo de IA pode, no
 * futuro, apenas redigir um resumo a partir destes fatos.
 */
import "server-only";
import { isAlertFact, productRanking, storeRanking, type Fact, type VisitFact } from "./analytics";
import type { ClientSettings } from "@/lib/settings";
import { daysBetween, isNearExpiry, todayIso } from "@/lib/validity";

export type InsightTone = "critical" | "warning" | "info" | "positive";

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
  /** Maior = mais importante. */
  priority: number;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface InsightInput {
  facts: Fact[];
  prevFacts: Fact[];
  visits: VisitFact[];
  prevVisits: VisitFact[];
  settings: ClientSettings;
  /** Lojas ativas com a última visita (para "loja sem visita"). */
  stores?: { storeId: string; name: string; code: string | null; lastVisit: string | null }[];
  /** Itens abertos da situação atual, com dias contados a partir de hoje. */
  openItems?: { daysNow: number | null; type: string }[];
  periodLabel?: string;
}

export function generateInsights(input: InsightInput): Insight[] {
  const { facts, prevFacts, visits, prevVisits, settings } = input;
  const out: Insight[] = [];
  const alerts = facts.filter(isAlertFact);
  const prevAlerts = prevFacts.filter(isAlertFact);

  // 1. Concentração: poucas lojas concentram boa parte das ocorrências.
  const stores = storeRanking(facts, settings).sort((a, b) => b.occurrences - a.occurrences);
  if (alerts.length >= 10 && stores.length >= 5) {
    const top = Math.min(4, Math.max(2, Math.round(stores.length * 0.25)));
    const share = stores.slice(0, top).reduce((n, s) => n + s.occurrences, 0) / alerts.length;
    if (share >= 0.4) {
      out.push({
        id: "concentration",
        tone: "warning",
        priority: 60 + share * 20,
        text: `${top} lojas concentram ${pct(share)} das ocorrências do período (${stores.slice(0, top).map((s) => s.storeName + (s.storeCode ? ` ${s.storeCode}` : "")).join(", ")}).`,
      });
    }
  }

  // 2. Produto com maior recorrência de alerta.
  const products = productRanking(facts)
    .map((p) => ({ ...p, alerts: p.items + p.ruptures + p.damages }))
    .sort((a, b) => b.alerts - a.alerts);
  const topProduct = products[0];
  if (topProduct && topProduct.alerts >= 3 && (products[1]?.alerts ?? 0) < topProduct.alerts) {
    const storesAffected = new Set(facts.filter((x) => x.productId === topProduct.productId && isAlertFact(x)).map((x) => x.storeId)).size;
    out.push({
      id: "top-product",
      tone: "info",
      priority: 55,
      text: `${topProduct.productName} foi o produto com maior recorrência de alerta: ${plural(topProduct.alerts, "registro", "registros")} em ${plural(storesAffected, "loja", "lojas")}.`,
    });
  }

  // 3. Variação vs. período anterior, por tipo (amostra mínima de 5 em cada lado).
  const kinds: [string, (x: Fact) => boolean, string][] = [
    ["ruptures", (x) => x.type === "rupture", "Rupturas"],
    ["damages", (x) => x.type === "damage", "Avarias"],
    ["near", (x) => x.type === "validity" && (isNearExpiry(x.severity) || x.severity === "expired"), "Itens vencidos ou próximos ao vencimento"],
  ];
  for (const [id, pred, label] of kinds) {
    const now = facts.filter(pred).length;
    const before = prevFacts.filter(pred).length;
    if (now >= 5 && before >= 5) {
      const change = (now - before) / before;
      if (Math.abs(change) >= 0.2) {
        out.push({
          id: `trend-${id}`,
          tone: change > 0 ? "warning" : "positive",
          priority: 45 + Math.min(30, Math.abs(change) * 30),
          text: `${label} ${change > 0 ? "aumentaram" : "diminuíram"} ${pct(Math.abs(change))} em relação ao período anterior (de ${before} para ${now}).`,
        });
      }
    }
  }

  // 4. Loja com aumento expressivo.
  const prevByStore = new Map<string, number>();
  for (const x of prevAlerts) prevByStore.set(x.storeId, (prevByStore.get(x.storeId) ?? 0) + 1);
  const rising = stores
    .map((s) => ({ s, before: prevByStore.get(s.storeId) ?? 0 }))
    .filter(({ s, before }) => s.occurrences >= 5 && before >= 3 && (s.occurrences - before) / before >= 0.25)
    .sort((a, b) => (b.s.occurrences - b.before) / b.before - (a.s.occurrences - a.before) / a.before)[0];
  if (rising) {
    out.push({
      id: "store-rising",
      tone: "warning",
      priority: 50,
      text: `A loja ${rising.s.storeName}${rising.s.storeCode ? ` ${rising.s.storeCode}` : ""} apresentou aumento de ${pct((rising.s.occurrences - rising.before) / rising.before)} nas ocorrências em relação ao período anterior (de ${rising.before} para ${rising.s.occurrences}).`,
    });
  }

  // 5. Vencidos na área de vendas (sempre relevante, qualquer quantidade).
  const expiredFloor = facts.filter((x) => x.type === "validity" && x.severity === "expired" && x.location !== "stock");
  if (expiredFloor.length) {
    const storesN = new Set(expiredFloor.map((x) => x.storeId)).size;
    out.push({
      id: "expired-floor",
      tone: "critical",
      priority: 90,
      text: `${plural(expiredFloor.length, "produto vencido foi encontrado", "produtos vencidos foram encontrados")} na área de vendas, em ${plural(storesN, "loja", "lojas")}.`,
    });
  }

  // 6. Janela de risco: itens abertos vencendo nos próximos 7 dias (situação atual).
  if (input.openItems) {
    const soon = input.openItems.filter((i) => i.daysNow !== null && i.daysNow >= 0 && i.daysNow <= 7).length;
    if (soon > 0) {
      out.push({ id: "risk-window", tone: "critical", priority: 85, text: `Existem ${plural(soon, "item", "itens")} em aberto com vencimento nos próximos 7 dias.` });
    }
  }

  // 7. Recorrência de itens críticos na mesma loja (≥ 3 visitas).
  const criticalVisitsByStore = new Map<string, Set<string>>();
  for (const x of facts) {
    if (x.severity === "critical" || x.severity === "expired") {
      if (!criticalVisitsByStore.has(x.storeId)) criticalVisitsByStore.set(x.storeId, new Set());
      criticalVisitsByStore.get(x.storeId)!.add(x.visitId);
    }
  }
  const recurrent = [...criticalVisitsByStore.entries()].filter(([, v]) => v.size >= 3).sort((a, b) => b[1].size - a[1].size)[0];
  if (recurrent) {
    const st = facts.find((x) => x.storeId === recurrent[0])!;
    out.push({
      id: "store-recurrence",
      tone: "warning",
      priority: 65,
      text: `${st.storeName}${st.storeCode ? ` ${st.storeCode}` : ""} apresenta recorrência de produtos críticos ou vencidos (${recurrent[1].size} visitas no período).`,
    });
  }

  // 8. Lojas sem visita há mais de N dias.
  if (input.stores) {
    const today = todayIso();
    const stale = input.stores.filter((s) => !s.lastVisit || daysBetween(s.lastVisit, today) > settings.staleVisitDays);
    if (stale.length) {
      out.push({
        id: "stale-stores",
        tone: "warning",
        priority: 70,
        text: `${plural(stale.length, "loja está", "lojas estão")} há mais de ${settings.staleVisitDays} dias sem visita${stale.length <= 3 ? `: ${stale.map((s) => s.name + (s.code ? ` ${s.code}` : "")).join(", ")}` : ""}.`,
      });
    }
  }

  // 9. Volume de visitas vs. período anterior.
  if (visits.length >= 5 && prevVisits.length >= 5) {
    const change = (visits.length - prevVisits.length) / prevVisits.length;
    if (change <= -0.2) {
      out.push({
        id: "visits-drop",
        tone: "warning",
        priority: 58,
        text: `O número de visitas caiu ${pct(-change)} em relação ao período anterior (de ${prevVisits.length} para ${visits.length}).`,
      });
    }
  }

  return out.sort((a, b) => b.priority - a.priority);
}

/** Recomendações derivadas dos insights — regras fixas, sem texto inventado. */
export function recommendationsFor(insights: Insight[]): string[] {
  const recs: string[] = [];
  const has = (id: string) => insights.some((i) => i.id === id || i.id.startsWith(id));
  if (has("expired-floor")) recs.push("Solicitar retirada imediata dos produtos vencidos da área de vendas e registrar a ação no sistema.");
  if (has("risk-window")) recs.push("Negociar rebaixa de preço ou ação promocional para os itens que vencem nos próximos 7 dias.");
  if (has("concentration") || has("store-recurrence")) recs.push("Priorizar as lojas mais críticas na rota da semana e alinhar o giro com o gerente de cada loja.");
  if (has("trend-ruptures")) recs.push("Revisar pedidos e abastecimento dos produtos com ruptura recorrente junto ao comercial SUINCO.");
  if (has("trend-damages")) recs.push("Verificar transporte e armazenamento: aumento de avarias indica problema de manuseio ou embalagem.");
  if (has("stale-stores") || has("visits-drop")) recs.push("Revisar a agenda dos promotores para cobrir as lojas sem visita.");
  if (has("top-product")) recs.push("Avaliar o volume enviado do produto com maior recorrência de alerta nas lojas afetadas.");
  return recs;
}
