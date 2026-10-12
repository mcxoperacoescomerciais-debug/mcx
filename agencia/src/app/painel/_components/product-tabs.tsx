"use client";

/**
 * Abas do relatório "Estoque e ruptura": cada análise continua com a própria
 * página, os próprios filtros e exportação — as abas só levam de uma à outra
 * mantendo o período e os filtros em comum.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/painel/estoque", label: "Estoque" },
  { href: "/painel/rupturas", label: "Ruptura" },
  { href: "/painel/validades", label: "Validade" },
  { href: "/painel/avarias", label: "Avaria" },
];
const SHARED = ["from", "to", "brand", "chain", "store", "promoter", "city"];

export function ProductTabs() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = new URLSearchParams();
  for (const k of SHARED) {
    const v = params.get(k);
    if (v) qs.set(k, v);
  }
  const suffix = qs.size ? `?${qs}` : "";
  return (
    <nav aria-label="Estoque e ruptura" className="flex gap-1 border-b border-line mb-5 overflow-x-auto no-print">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={`${t.href}${suffix}`}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "px-4 h-10 inline-flex items-center text-[14px] font-semibold border-b-2 -mb-px whitespace-nowrap",
              active ? "border-brand-700 text-brand-800" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
