"use client";

/**
 * Barra de filtros global. Cada alteração vai para a URL; a página é
 * recalculada no servidor e TODOS os números da tela seguem o mesmo filtro.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Search } from "lucide-react";
import clsx from "clsx";
import { addDays, todayIso } from "@/lib/dates";
import { SearchSelect } from "./search-select";

type Option = { id: string; name: string };
export type FilterField = "date" | "period" | "brand" | "chain" | "store" | "promoter" | "city" | "status" | "kind" | "q";

export interface FilterOptionsProps {
  brands?: Option[];
  chains?: Option[];
  stores?: Option[];
  promoters?: Option[];
  cities?: string[];
  statuses?: Option[];
  kinds?: Option[];
}

/** Filtros com caixinhas de marcação (vários itens de uma vez). */
const MULTI: FilterField[] = ["brand", "chain", "store", "promoter", "city"];

const rangeDateClass = "h-9 w-[128px] rounded-lg bg-transparent px-2 text-[13px] text-ink focus:outline-none";

export function FilterBar({
  fields,
  options,
  range,
  statusLabel = "Todos os status",
  kindLabel = "Todos os tipos",
  qPlaceholder = "Buscar…",
}: {
  fields: FilterField[];
  options: FilterOptionsProps;
  /** Período efetivamente aplicado pela página (inclui o padrão quando a URL não informa). */
  range?: { from: string; to: string };
  statusLabel?: string;
  kindLabel?: string;
  qPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const today = todayIso();

  function update(patch: Record<string, string | null | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    start(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Busca com pequeno atraso (não recarrega a cada tecla).
  useEffect(() => {
    if (!fields.includes("q")) return;
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const date = params.get("date") ?? today;
  const from = range?.from ?? params.get("from") ?? addDays(today, -6);
  const to = range?.to ?? params.get("to") ?? today;
  const sel = (field: FilterField, label: string, items: Option[] | undefined) =>
    fields.includes(field) && items ? (
      <SearchSelect
        key={field}
        label={label}
        value={params.get(field) ?? undefined}
        items={items}
        multiple={MULTI.includes(field)}
        onChange={(id) => update({ [field]: id ?? null })}
      />
    ) : null;
  const active = ["brand", "chain", "store", "promoter", "city", "status", "kind", "q"].some((k) => params.get(k));

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 no-print">
      {fields.includes("date") ? (
        <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
          <button type="button" aria-label="Dia anterior" onClick={() => update({ date: addDays(date, -1) })} className="h-9 w-8 grid place-items-center text-ink-2 hover:bg-subtle rounded-l-lg">
            <ChevronLeft className="size-4" />
          </button>
          <input type="date" aria-label="Data de referência" value={date} max={addDays(today, 30)} onChange={(e) => update({ date: e.target.value || null })} className="h-9 px-1 text-[13px] bg-transparent focus:outline-none" />
          <button type="button" aria-label="Próximo dia" onClick={() => update({ date: addDays(date, 1) })} className="h-9 w-8 grid place-items-center text-ink-2 hover:bg-subtle rounded-r-lg">
            <ChevronRight className="size-4" />
          </button>
          {date !== today ? (
            <button type="button" onClick={() => update({ date: null })} className="h-9 px-2.5 text-[12.5px] font-semibold text-brand-700 border-l border-line">
              Hoje
            </button>
          ) : null}
        </div>
      ) : null}
      {fields.includes("period") ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
            {[
              { label: "Hoje", f: today, t: today },
              { label: "7 dias", f: addDays(today, -6), t: today },
              { label: "30 dias", f: addDays(today, -29), t: today },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => update({ from: p.f, to: p.t })}
                className={clsx("h-8 px-2.5 rounded-md text-[12.5px] font-semibold whitespace-nowrap", from === p.f && to === p.t ? "bg-brand-800 text-white" : "text-ink-2 hover:bg-subtle")}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Início e fim num bloco só: no celular quebram juntos, sem o "até" sozinho na linha. */}
          <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-100">
            <input type="date" aria-label="Data inicial" value={from} onChange={(e) => update({ from: e.target.value || null })} className={rangeDateClass} />
            <span className="text-muted text-[12px] px-0.5">até</span>
            <input type="date" aria-label="Data final" value={to} onChange={(e) => update({ to: e.target.value || null })} className={rangeDateClass} />
          </div>
        </div>
      ) : null}
      {sel("brand", "Todas as marcas", options.brands)}
      {sel("chain", "Todas as redes", options.chains)}
      {sel("store", "Todas as lojas", options.stores)}
      {sel("promoter", "Todos os promotores", options.promoters)}
      {sel("city", "Todas as cidades", options.cities?.map((c) => ({ id: c, name: c })))}
      {sel("status", statusLabel, options.statuses)}
      {sel("kind", kindLabel, options.kinds)}
      {fields.includes("q") ? (
        <label className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={qPlaceholder} aria-label={qPlaceholder} className="h-9 w-56 rounded-lg border border-line-strong bg-surface pl-8 pr-2 text-[13px] focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        </label>
      ) : null}
      {active ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            update({ brand: null, chain: null, store: null, promoter: null, city: null, status: null, kind: null, q: null });
          }}
          className="h-9 px-3 rounded-lg text-[13px] font-semibold text-brand-700 hover:bg-brand-50 inline-flex items-center gap-1.5"
        >
          <RotateCcw className="size-3.5" /> Limpar filtros
        </button>
      ) : null}
      {pending ? <Loader2 className="size-4 animate-spin text-muted" aria-label="Atualizando" /> : null}
    </div>
  );
}
