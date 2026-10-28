"use client";

/**
 * Lista de seleção com campo de pesquisa (cidades, lojas, promotores...).
 * Digitar filtra na hora, sem diferenciar acento nem maiúscula; Esc fecha.
 *
 * Com `multiple`, cada item tem uma caixinha de marcação: o valor é a lista dos
 * marcados separada por vírgula, aplicada ao tocar em "Aplicar" ou ao fechar a
 * lista (não recarrega a tela a cada clique). Sem `multiple`, Enter escolhe o
 * primeiro resultado.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import clsx from "clsx";
import { normalizeText as normalize } from "@/lib/rules";

const split = (v: string | undefined) => (v ? v.split(",").filter(Boolean) : []);

export function SearchSelect({
  label,
  value,
  items,
  onChange,
  className,
  multiple = false,
}: {
  label: string;
  value: string | undefined;
  items: { id: string; name: string }[];
  onChange: (id: string | undefined) => void;
  className?: string;
  multiple?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const selected = split(value);
  const names = items.filter((i) => selected.includes(i.id)).map((i) => i.name);
  const buttonText = !selected.length ? label : selected.length === 1 ? (names[0] ?? label) : `${selected.length} selecionados`;

  const filtered = useMemo(() => {
    const n = normalize(q);
    return n ? items.filter((i) => normalize(i.name).includes(n)) : items;
  }, [items, q]);

  function openList() {
    setDraft(split(value));
    setOpen(true);
  }

  function close(apply: boolean) {
    setOpen(false);
    setQ("");
    if (!apply || !multiple) return;
    const next = draft.join(",");
    if (next !== (value ?? "")) onChange(next || undefined);
  }

  // Fechar clicando fora aplica o que foi marcado (só na lista com caixinhas).
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) closeRef.current(true);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  function pick(id: string | undefined) {
    onChange(id);
    close(false);
  }

  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <div ref={box} className={clsx("relative", className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => (open ? close(true) : openList())}
        className={clsx(
          "h-9 max-w-[220px] rounded-lg border bg-surface pl-3 pr-2 text-[13px] text-ink inline-flex items-center gap-1.5 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100",
          selected.length ? "border-brand-600 bg-brand-50 font-semibold" : "border-line-strong",
        )}
      >
        <span className="truncate">{buttonText}</span>
        <ChevronDown className="size-4 text-muted shrink-0" />
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-72 max-w-[85vw] rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="relative p-2 border-b border-line">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close(false);
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (multiple) close(true);
                  else if (filtered[0]) pick(filtered[0].id);
                }
              }}
              placeholder="Pesquisar..."
              className="w-full h-9 rounded-lg border border-line-strong pl-8 pr-2 text-[13px] focus:border-brand-600 focus:outline-none"
            />
          </div>
          {multiple ? (
            <>
              <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-line text-[12px]">
                <button type="button" onClick={() => setDraft((d) => [...new Set([...d, ...filtered.map((i) => i.id)])])} className="font-semibold text-brand-700 hover:underline">
                  Marcar {q ? "os encontrados" : "todos"}
                </button>
                <button type="button" onClick={() => setDraft([])} className="font-semibold text-muted hover:underline">
                  Desmarcar todos
                </button>
              </div>
              <ul className="max-h-72 overflow-y-auto py-1 text-[13px]">
                {filtered.map((i) => {
                  const on = draft.includes(i.id);
                  return (
                    <li key={i.id}>
                      <label className="w-full px-3 py-2 hover:bg-brand-50 flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => toggle(i.id)} className="size-4 accent-brand-700 shrink-0" />
                        <span className={clsx("min-w-0", on && "font-semibold")}>{i.name}</span>
                      </label>
                    </li>
                  );
                })}
                {!filtered.length ? <li className="px-3 py-3 text-muted">Nada encontrado.</li> : null}
              </ul>
              <div className="flex items-center justify-between gap-2 p-2 border-t border-line">
                <span className="text-[12px] text-muted pl-1">{draft.length ? `${draft.length} marcado(s)` : "Nenhum marcado = todos"}</span>
                <button type="button" onClick={() => close(true)} className="h-8 px-3 rounded-lg bg-brand-800 text-white text-[12.5px] font-semibold hover:bg-brand-700">
                  Aplicar
                </button>
              </div>
            </>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1 text-[13px]">
              {!q ? (
                <li>
                  <button type="button" onClick={() => pick(undefined)} className="w-full text-left px-3 py-2 hover:bg-brand-50 text-muted">
                    {label}
                  </button>
                </li>
              ) : null}
              {filtered.map((i) => (
                <li key={i.id}>
                  <button type="button" onClick={() => pick(i.id)} className="w-full text-left px-3 py-2 hover:bg-brand-50 flex items-center justify-between gap-2">
                    <span>{i.name}</span>
                    {i.id === value ? <Check className="size-4 text-brand-800 shrink-0" /> : null}
                  </button>
                </li>
              ))}
              {!filtered.length ? <li className="px-3 py-3 text-muted">Nada encontrado.</li> : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
