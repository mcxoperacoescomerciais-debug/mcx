"use client";

/**
 * Seleção de produto: a lista COMPLETA do mix da loja aparece de imediato e a
 * busca no topo filtra enquanto o promotor digita (nome, código SUINCO ou
 * código da rede). Produtos fora do mix só aparecem quando buscados.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight, Search, X } from "lucide-react";
import clsx from "clsx";
import { normalize, searchProducts } from "@/lib/product-search";
import type { BootstrapProduct, BootstrapStore } from "@/lib/sync-types";
import { useCatalog } from "../_lib/hooks";

export interface ProductMark {
  /** Texto curto à direita, ex.: "36 un · 22/11". */
  label: string;
  tone?: "done" | "alert";
}

function Row({ p, codes, mark, hint, onPick }: { p: BootstrapProduct; codes: string; mark?: ProductMark; hint?: ReactNode; onPick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onPick} className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-navy-50">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-ink leading-snug">{p.name}</span>
          <span className="block text-[12px] text-muted tnum">
            {codes}
            {hint}
          </span>
        </span>
        {mark ? (
          <span
            className={clsx(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold tnum",
              mark.tone === "alert" ? "bg-[#FDECEC] text-[#B42318]" : "bg-[#E7F6EC] text-[#1D6B3A]",
            )}
          >
            <Check className="size-3.5" />
            {mark.label}
          </span>
        ) : (
          <ChevronRight className="size-5 text-muted shrink-0" />
        )}
      </button>
    </li>
  );
}

export function ProductList({
  store,
  onPick,
  marks = {},
  priorityIds = [],
  placeholder = "Buscar por nome ou código…",
}: {
  store: BootstrapStore | undefined;
  onPick: (p: BootstrapProduct) => void;
  /** Produtos já registrados nesta seção. */
  marks?: Record<string, ProductMark>;
  /** Mostrados primeiro (ex.: produtos da última visita). */
  priorityIds?: string[];
  placeholder?: string;
}) {
  const { products, productById } = useCatalog();
  const [q, setQ] = useState("");
  const chainCodes = useMemo(() => store?.chainCodes ?? {}, [store]);
  const mixIds = useMemo(() => store?.mix ?? [], [store]);
  const mixSet = useMemo(() => new Set(mixIds), [mixIds]);

  const codesOf = (p: BootstrapProduct) =>
    [p.code ? `SUINCO ${p.code}` : null, chainCodes[p.id] ? `${store?.network.replace(/^Super\s+/i, "")} ${chainCodes[p.id]}` : null].filter(Boolean).join(" · ");

  const { mixList, others } = useMemo(() => {
    if (normalize(q)) {
      const found = searchProducts(products, q, mixSet, chainCodes);
      return { mixList: found.filter((p) => mixSet.has(p.id)), others: found.filter((p) => !mixSet.has(p.id)).slice(0, 10) };
    }
    const source = mixIds.length ? mixIds.map((id) => productById.get(id)).filter((p): p is BootstrapProduct => Boolean(p)) : products;
    const prio = new Set(priorityIds);
    const sorted = [...source].sort((a, b) => {
      const pa = prio.has(a.id) && !marks[a.id] ? 0 : 1;
      const pb = prio.has(b.id) && !marks[b.id] ? 0 : 1;
      return pa - pb || a.name.localeCompare(b.name, "pt-BR");
    });
    return { mixList: sorted, others: [] };
  }, [q, products, mixSet, chainCodes, mixIds, productById, priorityIds, marks]);

  const prio = new Set(priorityIds);

  return (
    <div>
      <div className="sticky top-14 z-10 bg-canvas pt-1 pb-3 -mx-4 px-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-5 text-muted pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            enterKeyHint="search"
            className="w-full h-12 rounded-xl border border-line-strong pl-11 pr-11 text-[16px] bg-surface focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100"
          />
          {q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-1 top-1 size-10 grid place-items-center text-muted" aria-label="Limpar busca">
              <X className="size-5" />
            </button>
          ) : null}
        </div>
        <p className="text-[12px] text-muted mt-1.5 px-1">
          {q
            ? `${mixList.length} no mix da loja${others.length ? ` · ${others.length} fora do mix` : ""}`
            : `${mixList.length} produtos no mix ${store ? `${store.network} ${store.format.charAt(0).toUpperCase()}${store.format.slice(1)}` : ""}`}
        </p>
      </div>

      {mixList.length ? (
        <ul className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
          {mixList.map((p) => (
            <Row
              key={p.id}
              p={p}
              codes={codesOf(p)}
              mark={marks[p.id]}
              hint={!q && prio.has(p.id) && !marks[p.id] ? <span className="ml-1.5 font-semibold text-gold-600">· última visita</span> : null}
              onPick={() => {
                onPick(p);
                setQ("");
              }}
            />
          ))}
        </ul>
      ) : q ? null : (
        <p className="text-center text-muted py-8 text-[14px]">Mix da loja não cadastrado. Use a busca.</p>
      )}

      {others.length ? (
        <>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted mt-5 mb-2 px-1">Fora do mix desta loja</h3>
          <ul className="rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
            {others.map((p) => (
              <Row
                key={p.id}
                p={p}
                codes={codesOf(p)}
                mark={marks[p.id]}
                onPick={() => {
                  onPick(p);
                  setQ("");
                }}
              />
            ))}
          </ul>
        </>
      ) : null}

      {q && !mixList.length && !others.length ? (
        <p className="text-center text-muted py-8 text-[14px] px-6">
          Nenhum produto encontrado para &quot;{q}&quot;. Se não estiver cadastrado, registre na <b>Observação</b> da visita.
        </p>
      ) : null}
    </div>
  );
}
