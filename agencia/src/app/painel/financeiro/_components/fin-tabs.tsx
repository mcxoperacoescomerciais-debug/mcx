"use client";

/** Abas do Financeiro (o mês escolhido acompanha a troca de aba). */
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/painel/financeiro", label: "DRE geral", exact: true },
  { href: "/painel/financeiro/promotoria", label: "DRE promotoria" },
  { href: "/painel/financeiro/degustacoes", label: "DRE degustações" },
  { href: "/painel/financeiro/despesas", label: "Despesas fixas" },
  { href: "/painel/financeiro/estrategico", label: "Visão estratégica" },
];

export function FinTabs({ month, actions = false }: { month: string; /** Modo ações: aba Por ação e nomes do negócio. */ actions?: boolean }) {
  const pathname = usePathname();
  const tabs = actions
    ? [...TABS.filter((t) => t.href !== "/painel/financeiro/promotoria").map((t) => (t.href === "/painel/financeiro/degustacoes" ? { ...t, label: "DRE das ações" } : t)), { href: "/painel/financeiro/acoes", label: "Por ação" }]
    : TABS;
  return (
    <nav aria-label="Financeiro" className="flex gap-1 border-b border-line mb-5 overflow-x-auto no-print">
      {tabs.map((t: { href: string; label: string; exact?: boolean }) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href === "/painel/financeiro/acoes" ? t.href : `${t.href}?mes=${month}`}
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
