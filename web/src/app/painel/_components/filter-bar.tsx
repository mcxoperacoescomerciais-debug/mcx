"use client";

/**
 * Barra de filtros do painel. Cada alteração vai para a URL, a página é
 * recalculada no servidor e TODOS os indicadores seguem o mesmo filtro.
 */
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { filtersToQuery, PERIODS, type DashboardFilters, type PeriodKey } from "@/lib/filters";
import { OCCURRENCE_TYPE_LABEL } from "@/lib/domain";
import type { FilterOptions } from "@/server/analytics";
import { SearchSelect } from "./search-select";

type Field = "network" | "store" | "city" | "promoter" | "product" | "category" | "type";

const selectClass =
  "h-9 rounded-lg border border-line-strong bg-surface pl-3 pr-8 text-[13px] text-ink max-w-[190px] focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function FilterBar({
  filters,
  options,
  fields = ["network", "store", "city", "promoter", "product", "category", "type"],
  showPeriod = true,
}: {
  filters: DashboardFilters;
  options: FilterOptions;
  fields?: Field[];
  showPeriod?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  function update(patch: Partial<DashboardFilters>) {
    const next = { ...filters, ...patch };
    const q = filtersToQuery(next);
    start(() => router.push(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  }

  const sel = (field: Field, label: string, value: string | undefined, items: { id: string; name: string }[], key: keyof DashboardFilters) =>
    fields.includes(field) ? (
      <SearchSelect key={field} label={label} value={value} items={items} onChange={(id) => update({ [key]: id })} />
    ) : null;

  const active = Boolean(filters.networkId || filters.storeId || filters.city || filters.promoterId || filters.productId || filters.category || filters.type);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 no-print">
      {showPeriod ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 overflow-x-auto max-w-full">
            {(Object.keys(PERIODS) as PeriodKey[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => update({ period: p })}
                className={clsx("h-8 px-2.5 rounded-md text-[12.5px] font-semibold whitespace-nowrap", filters.period === p ? "bg-navy-900 text-white" : "text-ink-2 hover:bg-navy-50")}
              >
                {PERIODS[p]}
              </button>
            ))}
          </div>
          {filters.period === "custom" ? (
            <div className="flex items-center gap-1.5">
              <input type="date" aria-label="Data inicial" value={filters.from ?? ""} onChange={(e) => update({ from: e.target.value })} className={selectClass} />
              <span className="text-muted text-[12px]">até</span>
              <input type="date" aria-label="Data final" value={filters.to ?? ""} onChange={(e) => update({ to: e.target.value })} className={selectClass} />
            </div>
          ) : null}
        </div>
      ) : null}
      {sel("network", "Todas as redes", filters.networkId, options.networks, "networkId")}
      {sel("store", "Todas as lojas", filters.storeId, options.stores, "storeId")}
      {sel("city", "Todas as cidades", filters.city, options.cities.map((c) => ({ id: c, name: c })), "city")}
      {sel("promoter", "Todos os promotores", filters.promoterId, options.promoters, "promoterId")}
      {sel("product", "Todos os produtos", filters.productId, options.products, "productId")}
      {sel("category", "Todas as categorias", filters.category, options.categories.map((c) => ({ id: c, name: c })), "category")}
      {sel("type", "Todos os tipos", filters.type, Object.entries(OCCURRENCE_TYPE_LABEL).map(([id, name]) => ({ id, name })), "type")}
      {active ? (
        <button
          type="button"
          onClick={() => start(() => router.push(`${pathname}?${filtersToQuery({ period: filters.period, from: filters.from, to: filters.to })}`))}
          className="h-9 px-3 rounded-lg text-[13px] font-semibold text-navy-700 hover:bg-navy-50 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="size-3.5" /> Limpar
        </button>
      ) : null}
      {pending ? <Loader2 className="size-4 animate-spin text-muted" /> : null}
    </div>
  );
}
