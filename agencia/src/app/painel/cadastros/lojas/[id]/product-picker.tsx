"use client";

/**
 * Lista de produtos de uma marca na loja, com busca (sem acento, cada palavra digitada).
 * Os produtos fora da busca ficam só escondidos: continuam no formulário e a seleção
 * deles é salva do mesmo jeito.
 */
import { useState } from "react";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui";
import { matchesQuery } from "@/lib/rules";

export function ProductPicker({ products }: { products: { id: string; name: string; checked: boolean }[] }) {
  const [q, setQ] = useState("");
  const shown = products.filter((p) => matchesQuery(p.name, q)).length;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="Buscar produto"
          aria-label="Buscar produto"
          className={`${inputClass} pl-9`}
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5 text-[12.5px] max-h-60 overflow-y-auto">
        {products.map((p) => (
          <label key={p.id} className={matchesQuery(p.name, q) ? "inline-flex items-start gap-1.5" : "hidden"}>
            <input type="checkbox" name="productIds" value={p.id} defaultChecked={p.checked} className="mt-0.5" /> {p.name}
          </label>
        ))}
      </div>
      {q.trim() && !shown ? <p className="text-[12.5px] text-muted">Nenhum produto encontrado.</p> : null}
    </div>
  );
}
