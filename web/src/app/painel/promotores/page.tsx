import type { Metadata } from "next";
import { ListSearch } from "@/app/painel/_components/list-search";
import { and, eq } from "drizzle-orm";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { filterOptions, loadFacts, promoterActivity } from "@/server/analytics";
import { parseFilters, resolveRange } from "@/lib/filters";
import { daysBetween, formatIsoBr, todayIso } from "@/lib/validity";
import { Badge, Card, PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";

export const metadata: Metadata = { title: "Promotores" };

export default async function PromotersPage({ searchParams }: PageProps<"/painel/promotores">) {
  const scope = await getScope();
  const filters = parseFilters(await searchParams);
  const range = resolveRange(filters);
  const db = await getDb();
  const [facts, options, assignments] = await Promise.all([
    loadFacts(scope, filters, range.from, range.to),
    filterOptions(scope),
    db
      .select({ userId: s.storeAssignments.userId, storeId: s.storeAssignments.storeId })
      .from(s.storeAssignments)
      .innerJoin(s.stores, eq(s.stores.id, s.storeAssignments.storeId))
      .where(and(eq(s.stores.clientId, scope.clientId), eq(s.stores.status, "active"))),
  ]);
  const activity = await promoterActivity(scope, filters, range, facts);
  const today = todayIso();

  return (
    <>
      <PageHeader title="Promotores" subtitle={`Atividade · ${range.label.toLowerCase()}`} />
      <FilterBar filters={filters} options={options} fields={["network", "city", "promoter"]} />
      <Card className="overflow-hidden">
        <ListSearch placeholder="Pesquisar promotor..." />
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
              <th className="font-semibold px-5 py-2.5">Promotor</th>
              <th className="font-semibold px-3 py-2.5 text-right">Lojas atribuídas</th>
              <th className="font-semibold px-3 py-2.5 text-right">Visitas</th>
              <th className="font-semibold px-3 py-2.5 text-right">Lojas visitadas</th>
              <th className="font-semibold px-3 py-2.5">Cobertura</th>
              <th className="font-semibold px-3 py-2.5 text-right">Ocorrências</th>
              <th className="font-semibold px-5 py-2.5">Última visita</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((p) => {
              const assigned = assignments.filter((a) => a.userId === p.promoterId).length;
              const coverage = assigned ? p.stores / assigned : 0;
              const since = p.lastVisit ? daysBetween(p.lastVisit, today) : null;
              return (
                <tr key={p.promoterId} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-semibold">
                    <a href={`/painel/visitas?promotor=${p.promoterId}&periodo=${filters.period}`} className="hover:underline">
                      {p.name}
                    </a>
                  </td>
                  <td className="px-3 text-right tnum">{assigned}</td>
                  <td className="px-3 text-right tnum">{p.visits}</td>
                  <td className="px-3 text-right tnum">{p.stores}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 rounded-full bg-navy-50 overflow-hidden">
                        <div className="h-full rounded-full bg-navy-700" style={{ width: `${Math.min(100, coverage * 100)}%` }} />
                      </div>
                      <span className="tnum text-[12px]">{Math.round(coverage * 100)}%</span>
                    </div>
                  </td>
                  <td className="px-3 text-right tnum">{p.occurrences}</td>
                  <td className="px-5 tnum">
                    {formatIsoBr(p.lastVisit)}
                    {since === null ? <Badge tone="red" className="ml-2">sem visitas</Badge> : since > 2 ? <Badge tone="orange" className="ml-2">há {since} dias</Badge> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
