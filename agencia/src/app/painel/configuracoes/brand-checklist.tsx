"use client";

/** Caixinhas das marcas da agência (Relatório da visita no WhatsApp), com marcar/desmarcar todas. */
import { useState } from "react";

export function BrandChecklist({ brands, selected }: { brands: { id: string; name: string }[]; selected: string[] }) {
  const [on, setOn] = useState<string[]>(selected);
  const all = brands.length > 0 && brands.every((b) => on.includes(b.id));
  if (!brands.length) return <p className="text-[12.5px] text-muted">Nenhuma marca ativa cadastrada.</p>;
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-line text-[12px]">
        <span className="text-muted">
          {on.filter((id) => brands.some((b) => b.id === id)).length} de {brands.length} marcada(s)
        </span>
        <button type="button" onClick={() => setOn(all ? [] : brands.map((b) => b.id))} className="font-semibold text-brand-700 hover:underline">
          {all ? "Desmarcar todas" : "Marcar todas"}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 grid sm:grid-cols-2 gap-x-3 gap-y-1">
        {brands.map((b) => (
          <label key={b.id} className="flex items-center gap-2 text-[13px] py-1 cursor-pointer">
            <input
              type="checkbox"
              name="visitReport_brand"
              value={b.id}
              checked={on.includes(b.id)}
              onChange={(e) => setOn((x) => (e.target.checked ? [...x, b.id] : x.filter((y) => y !== b.id)))}
              className="size-4 accent-brand-700 shrink-0"
            />
            <span className="min-w-0">{b.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
