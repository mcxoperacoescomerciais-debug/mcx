import type { Metadata } from "next";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { dashboardData } from "@/server/dashboard";
import { parseFilters } from "@/lib/filters";
import { fmtDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { DashboardView } from "../_components/dashboard-view";
import { LiveRefresh } from "../_components/dashboard-charts";

export const metadata: Metadata = { title: "Indicadores" };

/** Painel gráfico: ruptura por rede, loja e SKU, índice de ruptura, datas críticas, avarias e lojas atendidas — atualiza sozinho. */
export default async function IndicatorsPage({ searchParams }: PageProps<"/painel/indicadores">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const [d, options] = await Promise.all([dashboardData(scope, f), filterOptions(scope)]);
  return (
    <>
      <PageHeader
        title="Indicadores"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {fmtDate(f.from)} a {fmtDate(f.to)} · ruptura, validade, avarias e cobertura de lojas
            <LiveRefresh generatedAt={d.generatedAt} />
          </span>
        }
      />
      <FilterBar range={{ from: f.from, to: f.to }} fields={["period", "brand", "chain", "store", "promoter", "city"]} options={options} />
      <DashboardView d={d} variant="full" from={f.from} to={f.to} />
    </>
  );
}
