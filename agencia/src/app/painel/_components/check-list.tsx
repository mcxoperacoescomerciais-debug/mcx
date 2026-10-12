"use client";

/**
 * Lista de seleção múltipla com busca — para escolher dezenas/centenas de
 * lojas sem rolar uma página inteira. Envia os itens marcados como inputs
 * "name" repetidos no formulário.
 */
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { normalizeText } from "@/lib/rules";

export function CheckList({ name, items, selected, label }: { name: string; items: { id: string; name: string; hint?: string }[]; selected: string[]; label: string }) {
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(selected));
  const [q, setQ] = useState("");
  const [onlyChosen, setOnlyChosen] = useState(false);
  const shown = useMemo(() => {
    const n = normalizeText(q);
    return items.filter((i) => (!onlyChosen || chosen.has(i.id)) && (!n || normalizeText(`${i.name} ${i.hint ?? ""}`).includes(n)));
  }, [items, q, onlyChosen, chosen]);
  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <fieldset className="rounded-xl border border-line">
      <legend className="px-1 ml-2 text-[12.5px] font-semibold text-ink-2">
        {label} · {chosen.size} selecionada(s)
      </legend>
      {[...chosen].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-line">
        <label className="relative flex-1 min-w-[160px]">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar…" className="w-full h-9 rounded-lg border border-line-strong pl-8 pr-2 text-[13px]" />
        </label>
        <label className="text-[12.5px] inline-flex items-center gap-1.5">
          <input type="checkbox" checked={onlyChosen} onChange={(e) => setOnlyChosen(e.target.checked)} /> só marcadas
        </label>
        <button type="button" className="text-[12.5px] font-semibold text-brand-700" onClick={() => setChosen((p) => new Set([...p, ...shown.map((i) => i.id)]))}>
          Marcar visíveis
        </button>
        <button type="button" className="text-[12.5px] font-semibold text-muted" onClick={() => setChosen((p) => new Set([...p].filter((id) => !shown.some((i) => i.id === id))))}>
          Desmarcar visíveis
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 grid sm:grid-cols-2 gap-1">
        {shown.map((i) => (
          <label key={i.id} className="flex items-start gap-2 text-[13px] px-1.5 py-1 rounded hover:bg-subtle">
            <input type="checkbox" checked={chosen.has(i.id)} onChange={() => toggle(i.id)} className="mt-0.5" />
            <span>
              {i.name}
              {i.hint ? <span className="block text-[11.5px] text-muted">{i.hint}</span> : null}
            </span>
          </label>
        ))}
        {!shown.length ? <p className="text-[13px] text-muted p-2">Nada encontrado.</p> : null}
      </div>
    </fieldset>
  );
}
