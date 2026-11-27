"use client";

/** Abas do menu Degustações: painel, agenda, degustadoras e importação. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/painel/degustacoes", label: "Painel", exact: true },
  { href: "/painel/degustacoes/agenda", label: "Agenda" },
  { href: "/painel/degustacoes/degustadoras", label: "Degustadoras" },
  { href: "/painel/degustacoes/calculadora", label: "Calculadora" },
  { href: "/painel/degustacoes/importar", label: "Importar cronograma" },
];

export function DegTabs({ actions = false }: { /** Modo ações: Promotoras no lugar de Degustadoras. */ actions?: boolean }) {
  const pathname = usePathname();
  const tabs = actions ? TABS.map((t) => (t.href === "/painel/degustacoes/degustadoras" ? { ...t, label: "Promotoras" } : t.href === "/painel/degustacoes" ? { ...t, label: "Painel da agenda" } : t)) : TABS;
  return (
    <nav aria-label="Degustações" className="flex gap-1 border-b border-line mb-5 overflow-x-auto no-print">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
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
