/**
 * Relatório do período para o gestor da marca SUINCO — o gestor escolhe o
 * período (padrão: semana anterior, segunda a domingo) e o sistema grava um
 * SNAPSHOT imutável em weekly_reports. O PDF é sempre gerado a partir do
 * snapshot: o relatório enviado não muda se alguém corrigir um dado depois.
 * A comparação é com o período anterior de mesmo tamanho.
 */
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { getClientSettings } from "./settings";
import {
  computeKpis,
  currentAlerts,
  dailySeries,
  loadFacts,
  loadVisits,
  productRanking,
  severityDistribution,
  storeRanking,
  storesLastVisit,
  type Kpis,
} from "./analytics";
import { generateInsights, recommendationsFor } from "./insights";
import { addDays, daysBetween, todayIso } from "@/lib/validity";
import { DAMAGE_KIND_LABEL, RUPTURE_KIND_LABEL, type DamageKind, type RuptureKind, type Severity, type StoreHealth } from "@/lib/domain";

export interface WeeklyReportData {
  version: 1;
  clientName: string;
  period: { start: string; end: string };
  previous: { start: string; end: string };
  kpis: Kpis;
  previousKpis: Kpis;
  severity: { severity: Severity; items: number; units: number }[];
  daily: { day: string; nearExpiry: number; ruptures: number; damages: number }[];
  topProducts: { productId: string; name: string; units: number; items: number; stores: number; minExpiry: string | null }[];
  topStores: { storeId: string; name: string; city: string; occurrences: number; index: number; health: StoreHealth }[];
  expired: { product: string; store: string; city: string; quantity: number | null; unit: string; expiryDate: string | null; visitDate: string; location: string }[];
  ruptures: { byProduct: { name: string; count: number; stores: number }[]; byKind: { kind: string; count: number }[]; total: number };
  damages: { byProduct: { name: string; count: number; units: number }[]; byKind: { kind: string; count: number }[]; total: number };
  insights: { tone: string; text: string }[];
  recommendations: string[];
}

/** Semana anterior completa (segunda a domingo) em relação a `today`. */
export function previousWeek(today = todayIso()): { start: string; end: string } {
  const d = new Date(`${today}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  const thisMonday = addDays(today, -dow);
  return { start: addDays(thisMonday, -7), end: addDays(thisMonday, -1) };
}

function countBy<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
  return m;
}

export async function buildWeeklyReport(scope: Scope, start: string, end: string): Promise<WeeklyReportData> {
  const db = await getDb();
  const settings = await getClientSettings(scope.clientId);
  const [client] = await db.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, scope.clientId));
  const days = daysBetween(start, end) + 1;
  const prev = { start: addDays(start, -days), end: addDays(start, -1) };
  const f = { period: "custom" as const };

  const [facts, prevFacts, visits, prevVisits, stores, alerts] = await Promise.all([
    loadFacts(scope, f, start, end),
    loadFacts(scope, f, prev.start, prev.end),
    loadVisits(scope, f, start, end),
    loadVisits(scope, f, prev.start, prev.end),
    storesLastVisit(scope),
    currentAlerts(scope, f, settings),
  ]);

  const insights = generateInsights({
    facts,
    prevFacts,
    visits,
    prevVisits,
    settings,
    stores: stores.map((x) => ({ storeId: x.storeId, name: x.name, code: x.code, lastVisit: x.lastVisit })),
    openItems: alerts,
  });

  const ruptures = facts.filter((x) => x.type === "rupture");
  const damages = facts.filter((x) => x.type === "damage");
  const label = (name: string, code: string | null) => `${name}${code ? ` ${code}` : ""}`;

  return {
    version: 1,
    clientName: client?.name ?? "",
    period: { start, end },
    previous: prev,
    kpis: computeKpis(facts, visits, settings),
    previousKpis: computeKpis(prevFacts, prevVisits, settings),
    severity: severityDistribution(facts),
    daily: dailySeries(facts, { from: start, to: end }),
    topProducts: productRanking(facts)
      .filter((p) => p.units > 0)
      .slice(0, 10)
      .map((p) => ({ productId: p.productId, name: p.productName, units: p.units, items: p.items, stores: p.stores, minExpiry: p.minExpiry })),
    topStores: storeRanking(facts, settings)
      .filter((r) => r.index > 0)
      .slice(0, 10)
      .map((r) => ({ storeId: r.storeId, name: label(r.storeName, r.storeCode), city: r.city, occurrences: r.occurrences, index: r.index, health: r.health })),
    expired: facts
      .filter((x) => x.severity === "expired")
      .sort((a, b) => (a.expiryDate ?? "").localeCompare(b.expiryDate ?? ""))
      .map((x) => ({ product: x.productName, store: label(x.storeName, x.storeCode), city: x.city, quantity: x.quantity, unit: x.unit, expiryDate: x.expiryDate, visitDate: x.visitDate, location: x.location })),
    ruptures: {
      total: ruptures.length,
      byProduct: [...countBy(ruptures, (x) => x.productName)]
        .map(([name, rows]) => ({ name, count: rows.length, stores: new Set(rows.map((r) => r.storeId)).size }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      byKind: [...countBy(ruptures, (x) => x.ruptureKind ?? "total")].map(([kind, rows]) => ({ kind: RUPTURE_KIND_LABEL[kind as RuptureKind] ?? kind, count: rows.length })),
    },
    damages: {
      total: damages.length,
      byProduct: [...countBy(damages, (x) => x.productName)]
        .map(([name, rows]) => ({ name, count: rows.length, units: rows.reduce((n, r) => n + (r.quantity ?? 0), 0) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      byKind: [...countBy(damages, (x) => x.damageKind ?? "other")].map(([kind, rows]) => ({ kind: DAMAGE_KIND_LABEL[kind as DamageKind] ?? kind, count: rows.length })),
    },
    insights: insights.map((i) => ({ tone: i.tone, text: i.text })),
    recommendations: recommendationsFor(insights),
  };
}

/** Gera (ou regera) o snapshot do período [start, end]. */
export async function generateWeeklyReport(scope: Scope, start: string, end: string, generatedBy: string | null): Promise<string> {
  const data = await buildWeeklyReport(scope, start, end);
  const db = await getDb();
  const [row] = await db
    .insert(s.weeklyReports)
    .values({ tenantId: scope.tenantId, clientId: scope.clientId, periodStart: start, periodEnd: end, data, generatedBy, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: [s.weeklyReports.clientId, s.weeklyReports.periodStart, s.weeklyReports.periodEnd],
      set: { data, generatedBy, generatedAt: new Date() },
    })
    .returning({ id: s.weeklyReports.id });
  return row.id;
}

export async function listWeeklyReports(scope: Scope) {
  const db = await getDb();
  return db
    .select({ id: s.weeklyReports.id, periodStart: s.weeklyReports.periodStart, periodEnd: s.weeklyReports.periodEnd, generatedAt: s.weeklyReports.generatedAt, generatedBy: s.weeklyReports.generatedBy, data: s.weeklyReports.data })
    .from(s.weeklyReports)
    .where(eq(s.weeklyReports.clientId, scope.clientId))
    .orderBy(desc(s.weeklyReports.generatedAt))
    .limit(60);
}

export async function getWeeklyReport(scope: Scope, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(s.weeklyReports)
    .where(and(eq(s.weeklyReports.id, id), eq(s.weeklyReports.clientId, scope.clientId)));
  return row ? { ...row, data: row.data as WeeklyReportData } : null;
}

/** "Relatório Semanal" quando o período tem 7 dias; "Relatório do Período" nos demais. */
export function reportTitle(d: Pick<WeeklyReportData, "period">): string {
  return daysBetween(d.period.start, d.period.end) === 6 ? "Relatório Semanal" : "Relatório do Período";
}
