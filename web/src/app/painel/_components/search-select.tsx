"use client";

/**
 * Lista de seleção com campo de pesquisa (cidades, lojas, promotores...).
 * Digitar filtra na hora, sem diferenciar acento nem maiúscula; Enter escolhe
 * o primeiro resultado e Esc fecha.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import clsx from "clsx";
import { normalize } from "@/lib/product-search";

export function SearchSelect({
  label,
  value,
  items,
  onChange,
  className,
}: {
  label: string;
  value: string | undefined;
  items: { id: string; name: string }[];
  onChange: (id: string | undefined) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = items.find((i) => i.id === value);

  const filtered = useMemo(() => {
    const n = normalize(q);
    return n ? items.filter((i) => normalize(i.name).includes(n)) : items;
  }, [items, q]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function pick(id: string | undefined) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={box} className={clsx("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "h-9 max-w-[220px] rounded-lg border bg-surface pl-3 pr-2 text-[13px] text-ink inline-flex items-center gap-1.5 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100",
          value ? "border-navy-700 bg-navy-50 font-semibold" : "border-line-strong",
        )}
      >
        <span className="truncate">{current?.name ?? label}</span>
        <ChevronDown className="size-4 text-muted shrink-0" />
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-72 max-w-[85vw] rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
          <div className="relative p-2 border-b border-line">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered[0]) {
                  e.preventDefault();
                  pick(filtered[0].id);
                }
              }}
              placeholder="Pesquisar..."
              className="w-full h-9 rounded-lg border border-line-strong pl-8 pr-2 text-[13px] focus:border-navy-700 focus:outline-none"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1 text-[13px]">
            {!q ? (
              <li>
                <button type="button" onClick={() => pick(undefined)} className="w-full text-left px-3 py-2 hover:bg-navy-50 text-muted">
                  {label}
                </button>
              </li>
            ) : null}
            {filtered.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => pick(i.id)} className="w-full text-left px-3 py-2 hover:bg-navy-50 flex items-center justify-between gap-2">
                  <span>{i.name}</span>
                  {i.id === value ? <Check className="size-4 text-navy-900 shrink-0" /> : null}
                </button>
              </li>
            ))}
            {!filtered.length ? <li className="px-3 py-3 text-muted">Nada encontrado.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
