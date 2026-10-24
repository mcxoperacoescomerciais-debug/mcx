/**
 * Os dois alertas que a gestão precisa ver primeiro na visão geral:
 * loja programada em que o promotor não foi, e loja feita sem todas as marcas.
 */
import Link from "next/link";
import { ArrowRight, CircleSlash, Store } from "lucide-react";
import clsx from "clsx";
import type { IncompleteStoreAlert, MissedStoreAlert } from "@/server/operations";
import { fmtDate, todayIso, addDays } from "@/lib/dates";
import { withParams } from "@/lib/filters";

const SHOW = 6;

function dayLabel(date: string) {
  const today = todayIso();
  if (date === today) return "Hoje";
  if (date === addDays(today, -1)) return "Ontem";
  return fmtDate(date).slice(0, 5);
}

function AlertCard({
  title,
  empty,
  count,
  icon,
  href,
  children,
}: {
  title: string;
  empty: string;
  count: number;
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className={clsx("rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] overflow-hidden", count ? "border-bad/40 bg-surface" : "border-line bg-surface")}>
      <header className={clsx("flex items-center gap-3 px-5 py-3.5", count ? "bg-bad-bg" : "bg-subtle")}>
        <span className={clsx("size-9 rounded-lg grid place-items-center shrink-0", count ? "bg-bad text-white" : "bg-ok-bg text-ok")}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className={clsx("text-[15px] font-bold", count ? "text-bad" : "text-ink")}>{title}</h2>
          <p className="text-[12.5px] text-muted">Últimos 7 dias</p>
        </div>
        <span className={clsx("text-[28px] font-bold tnum leading-none", count ? "text-bad" : "text-ok")}>{count}</span>
      </header>
      {count ? (
        <>
          <ul className="divide-y divide-line">{children}</ul>
          {count > SHOW ? (
            <Link href={href} className="flex items-center justify-center gap-1 px-5 py-2.5 text-[13px] font-semibold text-brand-700 border-t border-line hover:bg-subtle">
              Ver as {count} <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </>
      ) : (
        <p className="px-5 py-4 text-[13px] text-muted">{empty}</p>
      )}
    </section>
  );
}

export function OperationAlerts({ from, to, missed, incomplete }: { from: string; to: string; missed: MissedStoreAlert[]; incomplete: IncompleteStoreAlert[] }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4 mb-6">
      <AlertCard
        title="Promotor não foi na loja"
        empty="Todas as lojas programadas foram visitadas."
        count={missed.length}
        icon={<Store className="size-4" />}
        href={`/painel/visitas${withParams({ from, to, status: "missed" })}`}
      >
        {missed.slice(0, SHOW).map((m) => (
          <li key={m.key}>
            <Link href={`/painel/promotores/${m.promoterId}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-subtle">
              <span className="w-12 shrink-0 text-[12.5px] font-bold text-bad pt-px">{dayLabel(m.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold truncate">{m.promoterName}</span>
                <span className="block text-[12.5px] text-muted truncate">
                  {m.storeName} · {m.city}
                  {m.brands.length ? ` · ${m.brands.join(", ")}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </AlertCard>
      <AlertCard
        title="Loja feita sem todas as marcas"
        empty="Nenhuma loja encerrada com marca sem atender."
        count={incomplete.length}
        icon={<CircleSlash className="size-4" />}
        href={`/painel/visitas${withParams({ from, to, status: "exception" })}`}
      >
        {incomplete.slice(0, SHOW).map((m) => (
          <li key={m.key}>
            <Link href={`/painel/visitas/${m.visitId}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-subtle">
              <span className="w-12 shrink-0 text-[12.5px] font-bold text-bad pt-px">{dayLabel(m.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold truncate">
                  {m.promoterName} <span className="font-normal text-muted">· {m.storeName} · {m.city}</span>
                </span>
                {m.brands.map((b) => (
                  <span key={b.name} className="block text-[12.5px] text-ink-2">
                    <strong className="text-bad">{b.name}</strong> não atendida{b.reason ? `: “${b.reason}”` : " (sem justificativa)"}
                  </span>
                ))}
              </span>
              <span className="text-[12px] text-muted tnum shrink-0">
                {m.doneBrands}/{m.totalBrands}
              </span>
            </Link>
          </li>
        ))}
      </AlertCard>
    </div>
  );
}
