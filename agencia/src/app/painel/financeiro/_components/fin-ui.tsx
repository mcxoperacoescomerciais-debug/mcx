import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { brl, monthLabel } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { shiftMonth } from "@/server/finance";
import { PageHeader } from "@/components/ui";
import { FinTabs } from "./fin-tabs";

/** Cabeçalho do Financeiro: título da aba, mês e as abas (DRE geral, promotoria, degustações, estratégia). */
export function FinHeader({ title, subtitle, month, path, noMonth }: { title: string; subtitle: string; month: string; path: string; noMonth?: boolean }) {
  return (
    <>
      <FinTabs month={month} />
      <PageHeader
        title={title}
        subtitle={noMonth ? subtitle : `${monthLabel(month)} · ${subtitle}`}
        actions={
          noMonth ? undefined : (
            <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
              <Link href={`${path}${withParams({ mes: shiftMonth(month, -1) })}`} aria-label="Mês anterior" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-l-lg">
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={path} className="h-9 px-3 grid place-items-center text-[13px] font-semibold border-x border-line hover:bg-subtle">
                Este mês
              </Link>
              <Link href={`${path}${withParams({ mes: shiftMonth(month, 1) })}`} aria-label="Próximo mês" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-r-lg">
                <ChevronRight className="size-4" />
              </Link>
            </div>
          )
        }
      />
    </>
  );
}

export function DreTable({ children }: { children: ReactNode }) {
  return (
    <table className="w-full text-[13.5px]">
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-muted">
          <th className="text-left font-semibold py-1.5"></th>
          <th className="text-right font-semibold py-1.5">Previsto</th>
          <th className="text-right font-semibold py-1.5">Realizado</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">{children}</tbody>
    </table>
  );
}

export function DreRow({ label, p, r, strong }: { label: string; p: number; r: number; strong?: boolean }) {
  const fmt = (v: number) => (Math.abs(v) < 0.005 ? brl(0) : v < 0 ? `− ${brl(-v)}` : brl(v));
  return (
    <tr>
      <td className={`py-2 ${strong ? "font-bold" : "text-ink-2"}`}>{label}</td>
      <td className={`py-2 text-right tnum ${strong ? "font-bold" : "font-semibold"}`}>{fmt(p)}</td>
      <td className={`py-2 text-right tnum ${strong ? "font-bold" : "font-semibold"}`}>{fmt(r)}</td>
    </tr>
  );
}

export function PctRow({ label, p, r }: { label: string; p: string; r: string }) {
  return (
    <tr>
      <td className="py-2 text-ink-2">{label}</td>
      <td className="py-2 text-right tnum font-semibold">{p}</td>
      <td className="py-2 text-right tnum font-semibold">{r}</td>
    </tr>
  );
}

export function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="font-semibold tnum">{value}</p>
    </div>
  );
}
