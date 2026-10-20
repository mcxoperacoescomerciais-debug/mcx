"use client";

/** Abas do Financeiro (o mês escolhido acompanha a troca de aba). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/painel/financeiro", label: "DRE geral", exact: true },
  { href: "/painel/financeiro/promotoria", label: "DRE promotoria" },
  { href: "/painel/financeiro/degustacoes", label: "DRE degustações" },
  { href: "/painel/financeiro/estrategico", label: "Visão estratégica" },
];

export function FinTabs({ month }: { month: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Financeiro" className="flex gap-1 border-b border-line mb-5 overflow-x-auto no-print">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={`${t.href}?mes=${month}`}
            aria-current={active ? "page" : undefined}
            className={clsx("px-4 h-10 inline-flex items-center text-[14px] font-semibold border-b-2 -mb-px whitespace-nowrap", active ? "border-brand-700 text-brand-800" : "border-transparent text-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
