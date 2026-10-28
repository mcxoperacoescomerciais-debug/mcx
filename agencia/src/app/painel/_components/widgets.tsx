/**
 * Peças do painel (Server Components): cartões de indicador, barra de
 * progresso do dia, tabela e paginação.
 */
import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { STOP_BUCKET_HELP, STOP_BUCKET_LABEL, STOP_BUCKETS, type StopBucket } from "@/lib/domain";

export function KpiCard({ label, value, sub, href, tone = "neutral", icon }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "neutral" | "danger" | "warning" | "success" | "info"; icon?: ReactNode }) {
  const accent = { neutral: "", danger: "text-bad", warning: "text-warn", success: "text-ok", info: "text-info" }[tone];
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p data-kpi-label className="text-[12.5px] font-medium text-muted leading-tight">{label}</p>
        {icon ? <span className={clsx("shrink-0", accent || "text-muted")}>{icon}</span> : null}
      </div>
      <p data-kpi-value className={clsx("text-[26px] font-semibold tracking-tight tnum mt-1.5 leading-none", accent)}>{value}</p>
      {sub ? <p data-kpi-sub className="text-[12px] text-muted mt-1.5 leading-snug">{sub}</p> : null}
    </>
  );
  const cls = "block bg-surface border border-line rounded-[var(--radius-card)] px-4 py-3.5 shadow-[var(--shadow-card)]";
  return href ? (
    <Link data-kpi href={href} className={clsx(cls, "hover:border-brand-200 hover:bg-subtle transition-colors focus-visible:ring-2")}>
      {inner}
    </Link>
  ) : (
    <div data-kpi className={cls}>{inner}</div>
  );
}

const BUCKET_BAR: Record<StopBucket, string> = {
  completed: "bg-ok",
  exception: "bg-warn",
  in_progress: "bg-info",
  late: "bg-bad",
  pending: "bg-black/15",
  missed: "bg-bad/60",
};

export function DayProgress({ buckets, total, hrefFor }: { buckets: Record<StopBucket, number>; total: number; hrefFor: (b: StopBucket) => string }) {
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-black/[0.06]" role="img" aria-label={STOP_BUCKETS.map((b) => `${STOP_BUCKET_LABEL[b]}: ${buckets[b]}`).join(", ")}>
        {STOP_BUCKETS.map((b) => (buckets[b] ? <div key={b} className={BUCKET_BAR[b]} style={{ width: `${(buckets[b] / Math.max(1, total)) * 100}%` }} /> : null))}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 mt-4">
        {STOP_BUCKETS.map((b) => (
          <li key={b}>
            <Link href={hrefFor(b)} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-subtle" title={STOP_BUCKET_HELP[b]}>
              <span className={clsx("size-2.5 rounded-full mt-1.5 shrink-0", BUCKET_BAR[b])} />
              <span>
                <span className="block text-[18px] font-semibold tnum leading-tight">{buckets[b]}</span>
                <span className="block text-[12px] text-muted">{STOP_BUCKET_LABEL[b]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <details className="mt-3 text-[12.5px] text-muted">
        <summary className="cursor-pointer inline-flex items-center gap-1 font-medium text-ink-2">
          <Info className="size-3.5" /> Como cada loja é contada
        </summary>
        <ul className="mt-2 space-y-1 pl-5 list-disc">
          {STOP_BUCKETS.map((b) => (
            <li key={b}>
              <strong className="text-ink-2">{STOP_BUCKET_LABEL[b]}:</strong> {STOP_BUCKET_HELP[b]}
            </li>
          ))}
          <li>Cada loja programada está em exatamente um grupo; a soma é sempre o total programado ({total}).</li>
        </ul>
      </details>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("overflow-x-auto", className)}>
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  );
}

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return <th className={clsx("px-3 py-2.5 font-semibold text-[11.5px] uppercase tracking-wide text-muted bg-subtle border-b border-line whitespace-nowrap", align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left", className)}>{children}</th>;
}

export function Td({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return <td className={clsx("px-3 py-2.5 border-b border-line align-middle", align === "right" ? "text-right tnum" : align === "center" ? "text-center" : "", className)}>{children}</td>;
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="text-[12.5px] text-muted px-4 py-3">{total} registro(s)</p>;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-muted">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} de {total}
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="h-8 px-2.5 rounded-lg border border-line-strong bg-surface inline-flex items-center gap-1 text-ink-2 font-semibold">
            <ChevronLeft className="size-4" /> Anterior
          </Link>
        ) : null}
        <span className="px-2">
          Página {page} de {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className="h-8 px-2.5 rounded-lg border border-line-strong bg-surface inline-flex items-center gap-1 text-ink-2 font-semibold">
            Próxima <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className, bodyClass, id }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string }) {
  return (
    <section id={id} className={clsx("scroll-mt-20","bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)]", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="text-[12.5px] text-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** Mini barra horizontal para rankings (valor real + barra proporcional ao maior). */
export function RankBar({ value, max, tone = "danger" }: { value: number; max: number; tone?: "danger" | "brand" }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
        <div className={clsx("h-full rounded-full", tone === "danger" ? "bg-bad/80" : "bg-brand-600")} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="tnum font-semibold w-8 text-right">{value}</span>
    </div>
  );
}
