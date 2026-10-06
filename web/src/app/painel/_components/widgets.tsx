/**
 * Blocos do painel renderizados no servidor: cartões de KPI, insights,
 * rankings e tabelas.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import clsx from "clsx";
import { Badge, Card, Delta } from "@/components/ui";
import { STORE_STATUS_LABEL, type StoreHealth } from "@/lib/domain";
import { formatIsoBr } from "@/lib/validity";
import type { Insight } from "@/server/insights";
import type { ProductRank, StoreRank } from "@/server/analytics";

export function KpiCard({
  label,
  value,
  previous,
  hint,
  tone = "neutral",
  href,
  invert = true,
}: {
  label: string;
  /** Número (formatado pt-BR) ou texto pronto, ex.: uma data. */
  value: number | string;
  previous?: number;
  hint?: ReactNode;
  tone?: "neutral" | "critical" | "warning";
  href?: string;
  invert?: boolean;
}) {
  const body = (
    <Card className={clsx("p-4 h-full transition-colors", href && "hover:border-line-strong", tone === "critical" && typeof value === "number" && value > 0 && "border-[#F3B8B8]")}>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={clsx("text-[30px] font-semibold tracking-tight tnum mt-1 leading-none", tone === "critical" && typeof value === "number" && value > 0 ? "text-[#B42318]" : "text-ink")}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </p>
      <div className="mt-2 min-h-[18px]">{previous !== undefined && typeof value === "number" ? <Delta current={value} previous={previous} invert={invert} /> : hint}</div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

const TONE_ICON = {
  critical: { icon: AlertOctagon, cls: "text-[#B42318] bg-[#FDECEC]" },
  warning: { icon: AlertTriangle, cls: "text-[#9A4A00] bg-[#FFF1E5]" },
  info: { icon: Info, cls: "text-[#1D4E9E] bg-[#E8F1FE]" },
  positive: { icon: CheckCircle2, cls: "text-[#1D6B3A] bg-[#E7F6EC]" },
};

export function InsightList({ insights, limit = 5 }: { insights: Insight[]; limit?: number }) {
  if (!insights.length) {
    return <p className="text-[13px] text-muted px-5 pb-5">Sem destaques: os dados do período não indicam mudanças relevantes (ou ainda não há amostra suficiente).</p>;
  }
  return (
    <ul className="px-3 pb-3 space-y-1">
      {insights.slice(0, limit).map((i) => {
        const t = TONE_ICON[i.tone];
        const Icon = t.icon;
        return (
          <li key={i.id} className="flex items-start gap-3 rounded-lg px-2 py-2">
            <span className={clsx("size-7 shrink-0 rounded-lg grid place-items-center", t.cls)}>
              <Icon className="size-4" />
            </span>
            <p className="text-[13.5px] text-ink leading-snug pt-1">{i.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function HealthBadge({ health }: { health: StoreHealth }) {
  return <Badge tone={health === "critical" ? "red" : health === "attention" ? "orange" : "green"}>{STORE_STATUS_LABEL[health]}</Badge>;
}

export function ProductRankList({ rows, limit = 8 }: { rows: ProductRank[]; limit?: number }) {
  const top = rows.filter((r) => r.units > 0).slice(0, limit);
  const max = Math.max(1, ...top.map((r) => r.units));
  if (!top.length) return <p className="text-[13px] text-muted px-5 pb-5">Nenhum item próximo ao vencimento no período.</p>;
  return (
    <ol className="px-5 pb-4 space-y-3">
      {top.map((r, i) => (
        <li key={r.productId}>
          <Link href={`/painel/produtos/${r.productId}`} className="group block">
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="font-semibold text-ink group-hover:underline truncate">
                <span className="text-muted tnum mr-1.5">{i + 1}.</span>
                {r.productName}
              </span>
              <span className="tnum text-ink-2 shrink-0">
                <b className="text-ink">{r.units.toLocaleString("pt-BR")}</b> un · {r.stores} {r.stores === 1 ? "loja" : "lojas"}
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-navy-50 overflow-hidden">
              <div className="h-full rounded-full bg-navy-700" style={{ width: `${(r.units / max) * 100}%` }} />
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function StoreRankTable({ rows, limit = 8 }: { rows: StoreRank[]; limit?: number }) {
  const top = rows.filter((r) => r.index > 0).slice(0, limit);
  if (!top.length) return <p className="text-[13px] text-muted px-5 pb-5">Nenhuma loja com ocorrências no período.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
            <th className="font-semibold px-5 py-2">Loja</th>
            <th className="font-semibold px-2 py-2 text-right" title="Vencidos">Venc.</th>
            <th className="font-semibold px-2 py-2 text-right" title="Críticos (0–3 dias)">Crít.</th>
            <th className="font-semibold px-2 py-2 text-right">Rupt.</th>
            <th className="font-semibold px-2 py-2 text-right">Avar.</th>
            <th className="font-semibold px-2 py-2 text-right">Índice</th>
            <th className="font-semibold px-5 py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {top.map((r) => (
            <tr key={r.storeId} className="border-b border-line last:border-0 hover:bg-navy-50/40">
              <td className="px-5 py-2.5">
                <Link href={`/painel/lojas/${r.storeId}`} className="font-semibold text-ink hover:underline">
                  {r.storeName}
                  {r.storeCode ? <span className="text-muted font-medium"> · {r.storeCode}</span> : null}
                </Link>
                <div className="text-[12px] text-muted">{r.city}</div>
              </td>
              <td className={clsx("px-2 text-right tnum", r.expired && "text-[#B42318] font-bold")}>{r.expired}</td>
              <td className="px-2 text-right tnum">{r.critical}</td>
              <td className="px-2 text-right tnum">{r.ruptures}</td>
              <td className="px-2 text-right tnum">{r.damages}</td>
              <td className="px-2 text-right tnum font-bold">{r.index}</td>
              <td className="px-5">
                <HealthBadge health={r.health} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DateCell({ iso }: { iso: string | null }) {
  return <span className="tnum">{formatIsoBr(iso)}</span>;
}

export function SectionCard({ title, subtitle, action, children, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={clsx("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {subtitle ? <p className="text-[12.5px] text-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="flex-1">{children}</div>
    </Card>
  );
}
