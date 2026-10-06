import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/auth";
import { getClientSettings } from "@/server/settings";
import { filterOptions, loadFacts, storeRanking, storesLastVisit } from "@/server/analytics";
import { parseFilters, resolveRange } from "@/lib/filters";
import { daysBetween, formatIsoBr, isNearExpiry, todayIso } from "@/lib/validity";
import { Card, PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { StoreMap, type MapStore } from "../_components/store-map";
import { HealthBadge, SectionCard } from "../_components/widgets";

export const metadata: Metadata = { title: "Lojas" };

export default async function StoresPage({ searchParams }: PageProps<"/painel/lojas">) {
  const scope = await getScope();
  const settings = await getClientSettings(scope.clientId);
  const filters = parseFilters(await searchParams, "30d");
  const range = resolveRange(filters);
  const [facts, stores, options] = await Promise.all([loadFacts(scope, filters, range.from, range.to), storesLastVisit(scope), filterOptions(scope)]);
  const ranking = storeRanking(facts, settings);
  const today = todayIso();

  const rows = stores
    .filter((s) => (!filters.storeId || s.storeId === filters.storeId) && (!filters.city || s.city === filters.city) && (!filters.networkId || s.networkId === filters.networkId))
    .map((s) => {
      const r = ranking.find((x) => x.storeId === s.storeId);
      const sf = facts.filter((x) => x.storeId === s.storeId);
      return {
        ...s,
        index: r?.index ?? 0,
        health: r?.health ?? ("normal" as const),
        visits: new Set(sf.map((x) => x.visitId)).size,
        nearExpiry: sf.filter((x) => isNearExpiry(x.severity)).length,
        expired: sf.filter((x) => x.severity === "expired").length,
        ruptures: sf.filter((x) => x.type === "rupture").length,
        damages: sf.filter((x) => x.type === "damage").length,
        daysSince: s.lastVisit ? daysBetween(s.lastVisit, today) : null,
      };
    })
    .sort((a, b) => b.index - a.index || a.name.localeCompare(b.name));

  const mapStores: MapStore[] = rows
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({ id: s.storeId, name: `${s.name}${s.code ? ` · ${s.code}` : ""}`, city: s.city, lat: s.lat!, lng: s.lng!, health: s.health, lastVisit: s.lastVisit, nearExpiry: s.nearExpiry, expired: s.expired, ruptures: s.ruptures, damages: s.damages }));

  return (
    <>
      <PageHeader title="Lojas" subtitle={`${rows.length} lojas · indicadores de ${range.label.toLowerCase()}`} />
      <FilterBar filters={filters} options={options} fields={["network", "store", "city", "promoter", "product", "category", "type"]} />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
                  <th className="font-semibold px-5 py-2.5">Loja</th>
                  <th className="font-semibold px-2 py-2.5 text-right">Visitas</th>
                  <th className="font-semibold px-2 py-2.5 text-right">Próx. venc.</th>
                  <th className="font-semibold px-2 py-2.5 text-right">Vencidos</th>
                  <th className="font-semibold px-2 py-2.5 text-right">Rupt.</th>
                  <th className="font-semibold px-2 py-2.5 text-right">Avar.</th>
                  <th className="font-semibold px-2 py-2.5 text-right">Índice</th>
                  <th className="font-semibold px-3 py-2.5">Situação</th>
                  <th className="font-semibold px-5 py-2.5">Última visita</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.storeId} className="border-b border-line last:border-0 hover:bg-navy-50/40">
                    <td className="px-5 py-2.5">
                      <Link href={`/painel/lojas/${r.storeId}`} className="font-semibold hover:underline">
                        {r.name}
                        {r.code ? <span className="text-muted font-medium"> · {r.code}</span> : null}
                      </Link>
                      <div className="text-[12px] text-muted">
                        {r.city} · {r.networkName}
                      </div>
                    </td>
                    <td className="px-2 text-right tnum">{r.visits}</td>
                    <td className="px-2 text-right tnum">{r.nearExpiry}</td>
                    <td className={`px-2 text-right tnum ${r.expired ? "text-[#B42318] font-bold" : ""}`}>{r.expired}</td>
                    <td className="px-2 text-right tnum">{r.ruptures}</td>
                    <td className="px-2 text-right tnum">{r.damages}</td>
                    <td className="px-2 text-right tnum font-bold">{r.index}</td>
                    <td className="px-3">
                      <HealthBadge health={r.health} />
                    </td>
                    <td className="px-5 tnum">
                      {formatIsoBr(r.lastVisit)}
                      {r.daysSince !== null && r.daysSince > settings.staleVisitDays ? (
                        <div className="text-[11.5px] font-semibold text-[#9A4A00]">há {r.daysSince} dias</div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <SectionCard title="Mapa" subtitle="Clique em uma loja para ver os números">
          <div className="px-4 pb-4">
            <StoreMap stores={mapStores} height={460} />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
