import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { MapPin } from "lucide-react";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { getClientSettings } from "@/server/settings";
import { computeKpis, currentAlerts, loadFacts, loadVisits, productRanking, storeRanking, weeklySeries } from "@/server/analytics";
import { listVisits } from "@/server/visit-list";
import { addDays, formatIsoBr, todayIso } from "@/lib/validity";
import { parseFilters, resolveRange } from "@/lib/filters";
import { Badge, PageHeader, SeverityBadge } from "@/components/ui";
import { STORE_FORMAT_LABEL as FORMAT_LABEL, type StoreFormat } from "@/lib/domain";
import { FilterBar } from "../../_components/filter-bar";
import { WeeklyStack } from "../../_components/charts";
import { HealthBadge, KpiCard, ProductRankList, SectionCard } from "../../_components/widgets";
import { VisitTable } from "../../_components/visit-table";
import { OpenOccurrence } from "../../_components/occurrence-drawer";

export const metadata: Metadata = { title: "Loja" };

export default async function StorePage({ params, searchParams }: PageProps<"/painel/lojas/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const db = await getDb();
  const [store] = await db
    .select({ store: s.stores, network: s.networks.name })
    .from(s.stores)
    .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
    .where(and(eq(s.stores.id, id), eq(s.stores.clientId, scope.clientId)));
  if (!store) notFound();

  const settings = await getClientSettings(scope.clientId);
  const base = parseFilters(await searchParams, "30d");
  const filters = { ...base, storeId: id };
  const range = resolveRange(filters);
  const today = todayIso();
  const [facts, visits, history, weeklyFacts, alerts] = await Promise.all([
    loadFacts(scope, filters, range.from, range.to),
    loadVisits(scope, filters, range.from, range.to),
    listVisits(scope, { from: addDays(today, -365), to: today, storeId: id, limit: 100 }),
    loadFacts(scope, { period: "custom", storeId: id }, addDays(today, -7 * 12), today),
    currentAlerts(scope, { period: "7d", storeId: id }, settings),
  ]);
  const kpi = computeKpis(facts, visits, settings);
  const rank = storeRanking(facts, settings)[0];
  const st = store.store;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {st.name}
            {st.code ? <span className="text-muted font-normal">Loja {st.code}</span> : null}
            <HealthBadge health={rank?.health ?? "normal"} />
          </span>
        }
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" /> {st.city} – {st.state} · {store.network} {FORMAT_LABEL[st.format as StoreFormat] ?? st.format}
            {st.managerName ? ` · Responsável: ${st.managerName}` : ""}
          </span>
        }
      />
      <FilterBar filters={base} options={{ networks: [], stores: [], cities: [], promoters: [], products: [], categories: [] }} fields={[]} />

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Última visita" value={formatIsoBr(history.find((h) => h.status === "finished")?.visitDate ?? null)} hint={history[0]?.promoterName} />
        <KpiCard label="Visitas no período" value={kpi.visits} />
        <KpiCard label="Próx. ao vencimento" value={kpi.nearExpiry} />
        <KpiCard label="Vencidos" value={kpi.expired} tone="critical" />
        <KpiCard label="Rupturas" value={kpi.ruptures} />
        <KpiCard label="Avarias" value={kpi.damages} />
      </section>

      <div className="grid gap-4 mt-4 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Evolução da loja" subtitle="Ocorrências por semana · últimas 12 semanas">
          <div className="px-3 pb-3">
            <WeeklyStack data={weeklySeries(weeklyFacts, 12, today)} />
          </div>
        </SectionCard>
        <SectionCard title="Situação atual" subtitle="Itens da última visita ainda não tratados">
          {alerts.length ? (
            <ul className="px-5 pb-4 divide-y divide-line">
              {alerts.slice(0, 10).map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-[13px]">
                  <OpenOccurrence id={a.id} className="font-semibold hover:underline min-w-0 truncate">
                    {a.productName}
                  </OpenOccurrence>
                  {a.severityNow ? (
                    <SeverityBadge severity={a.severityNow} days={a.daysNow} size="sm" />
                  ) : (
                    <Badge tone={a.type === "rupture" ? "blue" : "gold"}>{a.type === "rupture" ? "Ruptura" : "Avaria"}</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Nada pendente.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 mt-4 xl:grid-cols-[1fr_1.6fr]">
        <SectionCard title="Produtos com mais unidades próximas ao vencimento" subtitle={range.label}>
          <ProductRankList rows={productRanking(facts)} />
        </SectionCard>
        <SectionCard title="Histórico de visitas" subtitle="Últimos 12 meses">
          <VisitTable rows={history} showStore={false} />
        </SectionCard>
      </div>
    </>
  );
}
