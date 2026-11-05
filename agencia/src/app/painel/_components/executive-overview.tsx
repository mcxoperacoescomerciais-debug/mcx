/** Visão geral executiva (gráficos de ruptura, datas críticas, avarias e lojas não atendidas), também usada no painel da marca. */
import type { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { parseFilters } from "@/lib/filters";
import { dashboardData } from "@/server/dashboard";
import { fmtDate, fmtLongDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { DashboardView } from "./dashboard-view";
import { LiveRefresh } from "./dashboard-charts";
import { FilterBar } from "./filter-bar";

export async function ExecutiveOverview({ scope, sp, brand }: { scope: Awaited<ReturnType<typeof getScope>>; sp: Record<string, string | string[] | undefined>; brand?: { id: string; name: string } }) {
  const parsed = parseFilters(sp, 7);
  // Painel da marca: a marca é fixa (não entra no filtro).
  const f = brand ? { ...parsed, brand: brand.id } : parsed;
  const [d, options] = await Promise.all([dashboardData(scope, f), filterOptions(scope)]);
  return (
    <>
      <PageHeader
        eyebrow={scope.agencyName}
        title={brand ? `Painel da marca · ${brand.name}` : "Visão geral"}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {f.from === f.to ? fmtLongDate(f.from) : `${fmtDate(f.from)} a ${fmtDate(f.to)}`} · ruptura, datas críticas, avarias e lojas não atendidas
            <LiveRefresh generatedAt={d.generatedAt} />
          </span>
        }
      />
      <FilterBar range={{ from: f.from, to: f.to }} fields={["period", "chain", "store", "promoter", "city"]} options={options} />
      <DashboardView d={d} variant="executive" from={f.from} to={f.to} />
    </>
  );
}
