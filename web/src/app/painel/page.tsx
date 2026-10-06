import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { getScope } from "@/server/auth";
import { getClientSettings } from "@/server/settings";
import {
  computeKpis,
  currentAlerts,
  dailySeries,
  filterOptions,
  loadFacts,
  loadVisits,
  productRanking,
  promoterActivity,
  severityDistribution,
  storeRanking,
  storesLastVisit,
} from "@/server/analytics";
import { generateInsights } from "@/server/insights";
import { filtersToQuery, parseFilters, resolveRange } from "@/lib/filters";
import { isNearExpiry } from "@/lib/validity";
import { buttonClass, PageHeader } from "@/components/ui";
import { FilterBar } from "./_components/filter-bar";
import { SeverityChart, TrendChart } from "./_components/charts";
import { StoreMap, type MapStore } from "./_components/store-map";
import { InsightList, KpiCard, ProductRankList, SectionCard, StoreRankTable } from "./_components/widgets";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const scope = await getScope();
  const settings = await getClientSettings(scope.clientId);
  const filters = parseFilters(await searchParams);
  const range = resolveRange(filters);

  const [facts, prevFacts, visits, prevVisits, alerts, stores, options] = await Promise.all([
    loadFacts(scope, filters, range.from, range.to),
    loadFacts(scope, filters, range.prevFrom, range.prevTo),
    loadVisits(scope, filters, range.from, range.to),
    loadVisits(scope, filters, range.prevFrom, range.prevTo),
    currentAlerts(scope, filters, settings),
    storesLastVisit(scope),
    filterOptions(scope),
  ]);

  const kpi = computeKpis(facts, visits, settings);
  const prev = computeKpis(prevFacts, prevVisits, settings);
  const ranking = storeRanking(facts, settings);
  const activity = await promoterActivity(scope, filters, range, facts);
  const insights = generateInsights({
    facts,
    prevFacts,
    visits,
    prevVisits,
    settings,
    stores: stores.filter((s) => (!filters.storeId || s.storeId === filters.storeId) && (!filters.city || s.city === filters.city) && (!filters.networkId || s.networkId === filters.networkId)).map((s) => ({ storeId: s.storeId, name: s.name, code: s.code, lastVisit: s.lastVisit })),
    openItems: alerts,
  });

  const mapStores: MapStore[] = stores
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => {
      const r = ranking.find((x) => x.storeId === s.storeId);
      const sf = facts.filter((x) => x.storeId === s.storeId);
      return {
        id: s.storeId,
        name: `${s.name}${s.code ? ` · ${s.code}` : ""}`,
        city: s.city,
        lat: s.lat!,
        lng: s.lng!,
        health: r?.health ?? "normal",
        lastVisit: s.lastVisit,
        nearExpiry: sf.filter((x) => isNearExpiry(x.severity)).length,
        expired: sf.filter((x) => x.severity === "expired").length,
        ruptures: sf.filter((x) => x.type === "rupture").length,
        damages: sf.filter((x) => x.type === "damage").length,
      };
    });

  const q = filtersToQuery(filters);
  const alertsOpen = alerts.filter((a) => a.severityNow === "expired" || a.severityNow === "critical").length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Operação SUINCO · ${range.label}`}
        actions={
          <a href={`/api/export/occurrences?${q}&formato=xlsx`} className={buttonClass("secondary", "md")}>
            <Download className="size-4" /> Exportar Excel
          </a>
        }
      />
      <FilterBar filters={filters} options={options} />

      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Visitas realizadas" value={kpi.visits} previous={prev.visits} invert={false} href={`/painel/visitas?${q}`} />
        <KpiCard label="Próx. ao vencimento" value={kpi.nearExpiry} previous={prev.nearExpiry} href={`/painel/alertas?${q}`} />
        <KpiCard label="Produtos vencidos" value={kpi.expired} previous={prev.expired} tone="critical" href={`/painel/alertas?${q}`} />
        <KpiCard label="Rupturas" value={kpi.ruptures} previous={prev.ruptures} href={`/painel/alertas?${q}#rupturas`} />
        <KpiCard label="Avarias" value={kpi.damages} previous={prev.damages} href={`/painel/alertas?${q}#avarias`} />
        <KpiCard label="Lojas com alerta" value={kpi.storesWithAlert} previous={prev.storesWithAlert} tone="warning" href={`/painel/lojas?${q}`} />
      </section>

      <div className="grid gap-4 mt-4 xl:grid-cols-[1.1fr_1fr]">
        <SectionCard
          title="O que mudou"
          subtitle="Destaques calculados a partir dos dados do período"
          action={
            alertsOpen ? (
              <Link href="/painel/alertas" className="text-[12.5px] font-semibold text-[#B42318] hover:underline whitespace-nowrap">
                {alertsOpen} alertas críticos abertos →
              </Link>
            ) : null
          }
        >
          <InsightList insights={insights} />
        </SectionCard>
        <SectionCard title="Itens por faixa de validade" subtitle="Quantidade de registros, classificados na data da visita">
          <div className="px-3 pb-3">
            <SeverityChart data={severityDistribution(facts)} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 mt-4 xl:grid-cols-2">
        <SectionCard title="Evolução das ocorrências" subtitle="Registros por dia de visita">
          <div className="px-3 pb-3">
            <TrendChart data={dailySeries(facts, range)} />
          </div>
        </SectionCard>
        <SectionCard title="Produtos com mais unidades próximas ao vencimento" subtitle="Inclui vencidos · soma das unidades registradas" action={<Link href={`/painel/produtos?${q}`} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Ver todos</Link>}>
          <ProductRankList rows={productRanking(facts)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 mt-4 xl:grid-cols-[1.25fr_1fr]">
        <SectionCard
          title="Lojas mais críticas"
          subtitle="Índice = vencidos×10 + críticos×5 + altos×3 + rupturas×3 + avarias×2 + atenção×1 (pesos em Configurações)"
          action={<Link href={`/painel/lojas?${q}`} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Ver todas</Link>}
        >
          <StoreRankTable rows={ranking} />
        </SectionCard>
        <SectionCard title="Mapa das lojas" subtitle="Situação no período filtrado">
          <div className="px-4 pb-4">
            <StoreMap stores={mapStores} height={330} />
          </div>
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title="Atividade dos promotores" subtitle={range.label} action={<Link href={`/painel/promotores?${q}`} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Detalhes</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
                  <th className="font-semibold px-5 py-2">Promotor</th>
                  <th className="font-semibold px-3 py-2 text-right">Visitas</th>
                  <th className="font-semibold px-3 py-2 text-right">Lojas</th>
                  <th className="font-semibold px-3 py-2 text-right">Ocorrências</th>
                  <th className="font-semibold px-5 py-2">Última visita</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((p) => (
                  <tr key={p.promoterId} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 font-semibold">{p.name}</td>
                    <td className="px-3 text-right tnum">{p.visits}</td>
                    <td className="px-3 text-right tnum">{p.stores}</td>
                    <td className="px-3 text-right tnum">{p.occurrences}</td>
                    <td className="px-5 tnum">{p.lastVisit ? p.lastVisit.split("-").reverse().join("/") : <span className="text-[#B42318] font-semibold">sem visitas no período</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
