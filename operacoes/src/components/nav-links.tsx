"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { NavItem } from "@/lib/nav";

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={clsx("shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors", active ? "bg-white/15 text-white" : "text-brand-200 hover:bg-white/10 hover:text-white")}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
