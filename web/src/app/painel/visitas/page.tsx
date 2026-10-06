import type { Metadata } from "next";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/analytics";
import { listVisits } from "@/server/visit-list";
import { parseFilters, resolveRange } from "@/lib/filters";
import { Card, PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { VisitTable } from "../_components/visit-table";

export const metadata: Metadata = { title: "Visitas" };

export default async function VisitsPage({ searchParams }: PageProps<"/painel/visitas">) {
  const scope = await getScope();
  const filters = parseFilters(await searchParams);
  const range = resolveRange(filters);
  const [rows, options] = await Promise.all([
    listVisits(scope, { from: range.from, to: range.to, storeId: filters.storeId, promoterId: filters.promoterId, networkId: filters.networkId, city: filters.city }),
    filterOptions(scope),
  ]);
  return (
    <>
      <PageHeader title="Visitas" subtitle={`${rows.length} visitas · ${range.label.toLowerCase()}`} />
      <FilterBar filters={filters} options={options} fields={["network", "store", "city", "promoter"]} />
      <Card className="overflow-hidden">
        <VisitTable rows={rows} />
      </Card>
    </>
  );
}
