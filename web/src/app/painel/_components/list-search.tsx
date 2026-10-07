"use client";

/**
 * Campo "Pesquisar" para as listas do painel. Fica dentro do mesmo bloco da
 * tabela/lista e esconde as linhas (tbody > tr ou [data-search-item]) que não
 * contêm o texto digitado — sem diferenciar acento nem maiúscula.
 * scope="main" pesquisa a página inteira (ex.: alertas, com várias tabelas).
 */
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import { normalize } from "@/lib/product-search";

export function ListSearch({ placeholder = "Pesquisar...", scope = "parent", className }: { placeholder?: string; scope?: "parent" | "main"; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const root = scope === "main" ? ref.current?.closest("main") : ref.current?.parentElement;
    if (!root) return;
    const n = normalize(q);
    const rows = root.querySelectorAll<HTMLElement>("tbody > tr, [data-search-item]");
    let count = 0;
    rows.forEach((r) => {
      const hit = !n || normalize(r.textContent ?? "").includes(n);
      r.style.display = hit ? "" : "none";
      if (hit) count++;
    });
    setShown(n ? count : null);
  }, [q, scope]);

  return (
    <div ref={ref} className={clsx("flex items-center gap-3 no-print", className ?? "p-3 border-b border-line")}>
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder={placeholder}
          className="w-full h-9 rounded-lg border border-line-strong bg-surface pl-9 pr-8 text-[13px] focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100"
        />
        {q ? (
          <button type="button" aria-label="Limpar pesquisa" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {shown !== null ? <span className="text-[12px] text-muted">{shown} encontrado(s)</span> : null}
    </div>
  );
}
