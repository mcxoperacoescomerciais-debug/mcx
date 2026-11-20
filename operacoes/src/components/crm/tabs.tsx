"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/comercial", label: "Hoje" },
  { href: "/comercial/funil", label: "Funil" },
  { href: "/comercial/leads", label: "Leads" },
  { href: "/comercial/painel", label: "Painel" },
  { href: "/comercial/importar", label: "Importar" },
  { href: "/comercial/config", label: "Modelos e funil" },
];

export function CrmTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Comercial" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 lg:mx-0 lg:px-0">
      {TABS.map((tab) => {
        const active = tab.href === "/comercial" ? pathname === "/comercial" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={clsx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold", active ? "border-brand-700 text-brand-900" : "border-transparent text-muted hover:text-ink")}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
