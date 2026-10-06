/**
 * Camada analítica: transforma ocorrências em indicadores de gestão.
 *
 * Estratégia: uma consulta traz os "fatos" (ocorrência + visita + loja +
 * produto) do período já filtrados no banco; as agregações são feitas em
 * TypeScript. Para o volume da operação (dezenas de milhares de linhas por
 * trimestre) isso é rápido, e as mesmas funções servem ao dashboard, às
 * páginas de loja/produto, aos insights e ao relatório semanal — uma única
 * definição de cada indicador.
 */
import "server-only";
import { and, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import type { DashboardFilters, DateRange } from "@/lib/filters";
import type { ClientSettings } from "@/lib/settings";
import { classify, daysBetween, isNearExpiry, todayIso } from "@/lib/validity";
import type { OccurrenceStatus, OccurrenceType, Severity, StoreHealth } from "@/lib/domain";

export interface Fact {
  id: string;
  type: OccurrenceType;
  location: string;
  quantity: number | null;
  unit: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  severity: Severity | null;
  ruptureKind: string | null;
  damageKind: string | null;
  status: OccurrenceStatus;
  notes: string | null;
  visitId: string;
  visitDate: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  city: string;
  networkId: string;
  networkName: string;
  promoterId: string;
  promoterName: string;
  productId: string;
  productName: string;
  category: string;
}

export interface VisitFact {
  id: string;
  visitDate: string;
  storeId: string;
  promoterId: string;
}

function visitConditions(scope: Scope, f: DashboardFilters, from: string, to: string): SQL[] {
  const c: SQL[] = [
    eq(s.visits.clientId, scope.clientId),
    eq(s.visits.status, "finished"),
    gte(s.visits.visitDate, from),
    lte(s.visits.visitDate, to),
  ];
  if (scope.promoterId) c.push(eq(s.visits.promoterId, scope.promoterId));
  if (f.storeId) c.push(eq(s.visits.storeId, f.storeId));
  if (f.promoterId) c.push(eq(s.visits.promoterId, f.promoterId));
  if (f.networkId) c.push(eq(s.stores.networkId, f.networkId));
  if (f.city) c.push(eq(s.stores.city, f.city));
  return c;
}

export async function loadFacts(scope: Scope, f: DashboardFilters, from: string, to: string): Promise<Fact[]> {
  const db = await getDb();
  const conds = visitConditions(scope, f, from, to);
  conds.push(isNull(s.occurrences.deletedAt));
  if (f.productId) conds.push(eq(s.occurrences.productId, f.productId));
  if (f.category) conds.push(eq(s.products.category, f.category));
  if (f.type) conds.push(eq(s.occurrences.type, f.type));
  const rows = await db
    .select({
      id: s.occurrences.id,
      type: s.occurrences.type,
      location: s.occurrences.location,
      quantity: s.occurrences.quantity,
      unit: s.occurrences.unit,
      expiryDate: s.occurrences.expiryDate,
      daysToExpiry: s.occurrences.daysToExpiry,
      severity: s.occurrences.severity,
      ruptureKind: s.occurrences.ruptureKind,
      damageKind: s.occurrences.damageKind,
      status: s.occurrences.status,
      notes: s.occurrences.notes,
      visitId: s.visits.id,
      visitDate: s.visits.visitDate,
      storeId: s.stores.id,
      storeName: s.stores.name,
      storeCode: s.stores.code,
      city: s.stores.city,
      networkId: s.networks.id,
      networkName: s.networks.name,
      promoterId: s.users.id,
      promoterName: s.users.name,
      productId: s.products.id,
      productName: s.products.name,
      category: s.products.category,
    })
    .from(s.occurrences)
    .innerJoin(s.visits, eq(s.visits.id, s.occurrences.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .innerJoin(s.products, eq(s.products.id, s.occurrences.productId))
    .where(and(...conds))
    .limit(200_000);
  return rows;
}

export async function loadVisits(scope: Scope, f: DashboardFilters, from: string, to: string): Promise<VisitFact[]> {
  const db = await getDb();
  return db
    .select({ id: s.visits.id, visitDate: s.visits.visitDate, storeId: s.visits.storeId, promoterId: s.visits.promoterId })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(and(...visitConditions(scope, f, from, to)));
}

// ───────────────────────────── Indicadores ─────────────────────────────

/** Ocorrência que conta como problema: ruptura, avaria ou validade vencida/próxima. */
export function isAlertFact(x: Pick<Fact, "type" | "severity">): boolean {
  return x.type !== "validity" || isNearExpiry(x.severity) || x.severity === "expired";
}

export interface Kpis {
  visits: number;
  storesVisited: number;
  nearExpiry: number;
  nearExpiryUnits: number;
  expired: number;
  critical: number;
  stock: number;
  ruptures: number;
  damages: number;
  storesWithAlert: number;
}

export function computeKpis(facts: Fact[], visits: VisitFact[], settings: ClientSettings): Kpis {
  const validity = facts.filter((x) => x.type === "validity");
  const near = validity.filter((x) => isNearExpiry(x.severity));
  const health = storeRanking(facts, settings);
  return {
    visits: visits.length,
    storesVisited: new Set(visits.map((v) => v.storeId)).size,
    nearExpiry: near.length,
    nearExpiryUnits: near.reduce((n, x) => n + (x.quantity ?? 0), 0),
    expired: validity.filter((x) => x.severity === "expired").length,
    critical: validity.filter((x) => x.severity === "critical").length,
    stock: validity.filter((x) => x.location === "stock").length,
    ruptures: facts.filter((x) => x.type === "rupture").length,
    damages: facts.filter((x) => x.type === "damage").length,
    storesWithAlert: health.filter((h) => h.health !== "normal").length,
  };
}

export function severityDistribution(facts: Fact[]): { severity: Severity; items: number; units: number }[] {
  const order: Severity[] = ["expired", "critical", "high", "attention", "monitor", "normal"];
  return order.map((sev) => {
    const rows = facts.filter((x) => x.type === "validity" && x.severity === sev);
    return { severity: sev, items: rows.length, units: rows.reduce((n, x) => n + (x.quantity ?? 0), 0) };
  });
}

export function dailySeries(facts: Fact[], range: { from: string; to: string }) {
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = new Date(Date.parse(d) + 86_400_000).toISOString().slice(0, 10)) days.push(d);
  return days.map((day) => {
    const rows = facts.filter((x) => x.visitDate === day);
    return {
      day,
      nearExpiry: rows.filter((x) => x.type === "validity" && (isNearExpiry(x.severity) || x.severity === "expired")).length,
      ruptures: rows.filter((x) => x.type === "rupture").length,
      damages: rows.filter((x) => x.type === "damage").length,
    };
  });
}

export interface ProductRank {
  productId: string;
  productName: string;
  category: string;
  items: number;
  units: number;
  stores: number;
  expired: number;
  ruptures: number;
  damages: number;
  minExpiry: string | null;
}

/** Ranking de produtos por quantidade próxima ao vencimento (inclui vencidos). */
export function productRanking(facts: Fact[]): ProductRank[] {
  const map = new Map<string, ProductRank & { storeSet: Set<string> }>();
  for (const x of facts) {
    let r = map.get(x.productId);
    if (!r) {
      r = { productId: x.productId, productName: x.productName, category: x.category, items: 0, units: 0, stores: 0, expired: 0, ruptures: 0, damages: 0, minExpiry: null, storeSet: new Set() };
      map.set(x.productId, r);
    }
    if (x.type === "rupture") r.ruptures++;
    else if (x.type === "damage") r.damages++;
    else if (isNearExpiry(x.severity) || x.severity === "expired") {
      r.items++;
      r.units += x.quantity ?? 0;
      r.storeSet.add(x.storeId);
      if (x.severity === "expired") r.expired++;
      if (x.expiryDate && (!r.minExpiry || x.expiryDate < r.minExpiry)) r.minExpiry = x.expiryDate;
    }
  }
  return [...map.values()]
    .map(({ storeSet, ...r }) => ({ ...r, stores: storeSet.size }))
    .sort((a, b) => b.units - a.units || b.items - a.items);
}

export interface StoreRank {
  storeId: string;
  storeName: string;
  storeCode: string | null;
  city: string;
  networkName: string;
  expired: number;
  critical: number;
  high: number;
  attention: number;
  ruptures: number;
  damages: number;
  occurrences: number;
  index: number;
  health: StoreHealth;
}

export function healthFor(index: number, settings: ClientSettings): StoreHealth {
  if (index >= settings.storeThresholds.critical) return "critical";
  if (index >= settings.storeThresholds.attention) return "attention";
  return "normal";
}

/** Índice de criticidade da loja — pesos configuráveis (Configurações). */
export function storeRanking(facts: Fact[], settings: ClientSettings): StoreRank[] {
  const w = settings.weights;
  const map = new Map<string, StoreRank>();
  for (const x of facts) {
    let r = map.get(x.storeId);
    if (!r) {
      r = { storeId: x.storeId, storeName: x.storeName, storeCode: x.storeCode, city: x.city, networkName: x.networkName, expired: 0, critical: 0, high: 0, attention: 0, ruptures: 0, damages: 0, occurrences: 0, index: 0, health: "normal" };
      map.set(x.storeId, r);
    }
    if (x.type === "rupture") r.ruptures++;
    else if (x.type === "damage") r.damages++;
    else if (x.severity === "expired") r.expired++;
    else if (x.severity === "critical") r.critical++;
    else if (x.severity === "high") r.high++;
    else if (x.severity === "attention") r.attention++;
  }
  for (const r of map.values()) {
    r.occurrences = r.expired + r.critical + r.high + r.attention + r.ruptures + r.damages;
    r.index = r.expired * w.expired + r.critical * w.critical + r.high * w.high + r.attention * w.attention + r.ruptures * w.rupture + r.damages * w.damage;
    r.health = healthFor(r.index, settings);
  }
  return [...map.values()].sort((a, b) => b.index - a.index);
}

export interface PromoterActivity {
  promoterId: string;
  name: string;
  visits: number;
  stores: number;
  lastVisit: string | null;
  occurrences: number;
}

export async function promoterActivity(scope: Scope, f: DashboardFilters, range: DateRange, facts: Fact[]): Promise<PromoterActivity[]> {
  const db = await getDb();
  const promoters = await db
    .select({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .innerJoin(s.userClients, eq(s.userClients.userId, s.users.id))
    .where(and(eq(s.userClients.clientId, scope.clientId), eq(s.users.role, "promoter"), eq(s.users.status, "active")));
  const visits = await loadVisits(scope, f, range.from, range.to);
  return promoters
    .filter((p) => !f.promoterId || p.id === f.promoterId)
    .map((p) => {
      const mine = visits.filter((v) => v.promoterId === p.id);
      return {
        promoterId: p.id,
        name: p.name,
        visits: mine.length,
        stores: new Set(mine.map((v) => v.storeId)).size,
        lastVisit: mine.map((v) => v.visitDate).sort().at(-1) ?? null,
        occurrences: facts.filter((x) => x.promoterId === p.id && isAlertFact(x)).length,
      };
    })
    .sort((a, b) => b.visits - a.visits);
}

// ───────────────────────────── Situação atual / alertas ─────────────────────────────

export interface CurrentAlert extends Fact {
  /** Dias para vencer contados a partir de HOJE (não da visita). */
  daysNow: number | null;
  severityNow: Severity | null;
}

/**
 * Situação atual = ocorrências da ÚLTIMA visita finalizada de cada loja, ainda
 * não tratadas. Quando a loja é visitada de novo, o que a visita anterior
 * registrou deixa de ser alerta (continua no histórico). Evita contar o mesmo
 * lote três vezes porque foi relatado em três visitas seguidas.
 */
export async function currentAlerts(scope: Scope, f: DashboardFilters, settings: ClientSettings): Promise<CurrentAlert[]> {
  const db = await getDb();
  const latest = await db
    .selectDistinctOn([s.visits.storeId], { id: s.visits.id })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(and(...visitConditions(scope, f, "2000-01-01", "2999-12-31")))
    .orderBy(s.visits.storeId, desc(s.visits.visitDate), desc(s.visits.startedAt));
  const ids = latest.map((l) => l.id);
  if (!ids.length) return [];
  const facts = await loadFacts(scope, f, "2000-01-01", "2999-12-31");
  const idSet = new Set(ids);
  const today = todayIso();
  return facts
    .filter((x) => idSet.has(x.visitId) && (x.status === "open" || x.status === "analyzing"))
    .map((x) => {
      const daysNow = x.expiryDate ? daysBetween(today, x.expiryDate) : null;
      return { ...x, daysNow, severityNow: daysNow === null ? null : classify(daysNow, settings.bands) };
    })
    .sort((a, b) => (a.daysNow ?? 9999) - (b.daysNow ?? 9999));
}

/** Lojas ativas e a data da última visita — para o alerta "loja sem visita". */
export async function storesLastVisit(scope: Scope) {
  const db = await getDb();
  return db
    .select({
      storeId: s.stores.id,
      name: s.stores.name,
      code: s.stores.code,
      city: s.stores.city,
      state: s.stores.state,
      lat: s.stores.lat,
      lng: s.stores.lng,
      networkId: s.stores.networkId,
      networkName: s.networks.name,
      lastVisit: sql<string | null>`(select max(${s.visits.visitDate}) from ${s.visits} where ${s.visits.storeId} = ${s.stores.id} and ${s.visits.status} = 'finished')`,
    })
    .from(s.stores)
    .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
    .where(and(eq(s.stores.clientId, scope.clientId), eq(s.stores.status, "active")))
    .orderBy(s.stores.name);
}

// ───────────────────────────── Opções dos filtros ─────────────────────────────

export async function filterOptions(scope: Scope) {
  const db = await getDb();
  const [networks, stores, promoters, products] = await Promise.all([
    db.select({ id: s.networks.id, name: s.networks.name }).from(s.networks).where(eq(s.networks.clientId, scope.clientId)).orderBy(s.networks.name),
    db.select({ id: s.stores.id, name: s.stores.name, code: s.stores.code, city: s.stores.city }).from(s.stores).where(eq(s.stores.clientId, scope.clientId)).orderBy(s.stores.name),
    db
      .select({ id: s.users.id, name: s.users.name })
      .from(s.users)
      .innerJoin(s.userClients, eq(s.userClients.userId, s.users.id))
      .where(and(eq(s.userClients.clientId, scope.clientId), eq(s.users.role, "promoter")))
      .orderBy(s.users.name),
    db.select({ id: s.products.id, name: s.products.name, category: s.products.category }).from(s.products).where(eq(s.products.clientId, scope.clientId)).orderBy(s.products.name),
  ]);
  return {
    networks,
    stores: stores.map((st) => ({ id: st.id, name: `${st.name}${st.code ? ` · ${st.code}` : ""}` })),
    cities: [...new Set(stores.map((st) => st.city))].sort(),
    promoters,
    products: products.map((p) => ({ id: p.id, name: p.name })),
    categories: [...new Set(products.map((p) => p.category))].sort(),
  };
}
export type FilterOptions = Awaited<ReturnType<typeof filterOptions>>;


// ───────────────────────────── Evolução semanal ─────────────────────────────

/** Segunda-feira da semana de uma data ISO. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Ocorrências que são alerta, agrupadas por semana (segunda a domingo). */
export function weeklySeries(facts: Fact[], weeks: number, today: string) {
  const out: { week: string; start: string; nearExpiry: number; ruptures: number; damages: number }[] = [];
  let start = weekStart(today);
  for (let i = 0; i < weeks; i++) {
    out.unshift({ week: `${start.slice(8, 10)}/${start.slice(5, 7)}`, start, nearExpiry: 0, ruptures: 0, damages: 0 });
    start = new Date(Date.parse(start) - 7 * 86_400_000).toISOString().slice(0, 10);
  }
  for (const x of facts) {
    const w = out.find((o) => o.start === weekStart(x.visitDate));
    if (!w) continue;
    if (x.type === "rupture") w.ruptures++;
    else if (x.type === "damage") w.damages++;
    else if (isNearExpiry(x.severity) || x.severity === "expired") w.nearExpiry++;
  }
  return out;
}
