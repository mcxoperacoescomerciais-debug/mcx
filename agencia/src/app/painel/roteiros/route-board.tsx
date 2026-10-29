"use client";

/**
 * Quadro da semana do promotor só para consulta (menu Roteiros): as lojas de
 * cada dia; passar o mouse ou tocar na loja mostra as marcas atendidas. Ajustes
 * ficam no cadastro do promotor.
 */
import { useState } from "react";
import { MapPin, Store } from "lucide-react";
import clsx from "clsx";
import { frequencyLabel, type TargetPeriod } from "@/lib/portfolio";

export interface BoardStore {
  storeId: string;
  storeName: string;
  chainName: string | null;
  city: string;
  brands: { brandId: string; brandName: string; perWeek: number; period: TargetPeriod; weekdays: number[] }[];
}

const COLUMNS = [
  { d: 1, label: "Seg" },
  { d: 2, label: "Ter" },
  { d: 3, label: "Qua" },
  { d: 4, label: "Qui" },
  { d: 5, label: "Sex" },
  { d: 6, label: "Sáb" },
  { d: -1, label: "Sem dia fixo" },
];

export function RouteBoard({ stores }: { stores: BoardStore[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const columns = COLUMNS.map((col) => ({
    ...col,
    items: stores
      .map((a) => ({ a, brands: a.brands.filter((b) => (col.d === -1 ? b.weekdays.length === 0 : b.weekdays.includes(col.d))) }))
      .filter((x) => x.brands.length),
  })).filter((col) => col.d !== -1 || col.items.length);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="grid gap-2 min-w-[760px]" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
        {columns.map((col) => (
          <div key={col.d} className="rounded-xl bg-canvas border border-line min-h-24">
            <div className="flex items-center justify-between gap-1 px-2.5 py-2 border-b border-line">
              <span className="text-[12.5px] font-bold">{col.label}</span>
              <span className="text-[11px] font-bold rounded-full bg-brand-50 text-brand-800 px-1.5">{col.items.length}</span>
            </div>
            <div className="p-1.5 space-y-1.5">
              {col.items.map(({ a, brands }) => {
                const key = `${col.d}:${a.storeId}`;
                const shown = open === key;
                return (
                  <div key={a.storeId} className="group relative">
                    <button
                      type="button"
                      onClick={() => setOpen(shown ? null : key)}
                      aria-expanded={shown}
                      className={clsx("w-full text-left rounded-lg bg-surface border px-2 py-1.5 hover:border-brand-600 transition-colors", shown ? "border-brand-600" : "border-line")}
                    >
                      <span className="flex items-start gap-1.5">
                        <Store className="size-3.5 mt-0.5 shrink-0 text-brand-700" />
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold leading-snug break-words">{a.storeName}</span>
                          <span className="flex items-center gap-1 text-[11px] text-muted">
                            <MapPin className="size-3 shrink-0" />
                            {a.city}
                          </span>
                        </span>
                      </span>
                      <span className="block text-[11px] text-brand-700 font-semibold mt-1">{brands.length} marca(s)</span>
                    </button>
                    {/* Marcas: ao tocar (fica aberto) ou ao passar o mouse. */}
                    <div className={clsx("mt-1 rounded-lg border border-brand-200 bg-brand-50 px-2 py-1.5", shown ? "block" : "hidden group-hover:block")}>
                      <ul className="space-y-1">
                        {brands.map((b) => (
                          <li key={b.brandId} className="text-[11.5px] leading-snug">
                            <span className="font-semibold">{b.brandName}</span>
                            <span className="block text-muted">{frequencyLabel(b.perWeek, b.period)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
              {!col.items.length ? <p className="text-[11.5px] text-muted px-1 py-2">—</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
