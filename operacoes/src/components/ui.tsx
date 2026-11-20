import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, Clock } from "lucide-react";
import { formatRelative } from "@/lib/dates";
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from "@/lib/domain";
import { isOverdue } from "@/lib/queue";

const STATUS_STYLE: Record<Status, string> = {
  todo: "bg-subtle text-ink-2 border-line-strong",
  doing: "bg-info-bg text-info border-info/20",
  waiting: "bg-wait-bg text-wait border-wait/20",
  approval: "bg-warn-bg text-warn border-warn/20",
  done: "bg-ok-bg text-ok border-ok/20",
  cancelled: "bg-subtle text-muted border-line",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={clsx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "medium") return null;
  const style = priority === "urgent" ? "bg-bad text-white border-bad" : priority === "high" ? "bg-bad-bg text-bad border-bad/20" : "bg-subtle text-muted border-line";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", style)}>
      {priority === "urgent" && <AlertTriangle aria-hidden className="size-3" />}
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

export interface CardDemand {
  id: string;
  number: number;
  title: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  followUpDate: string | null;
  waitingFor: string | null;
  assigneeName: string | null;
  clientName: string;
  categoryName: string;
}

/** Linha de demanda usada na fila e na lista. */
export function DemandCard({ d, today, showAssignee = true }: { d: CardDemand; today: string; showAssignee?: boolean }) {
  const late = isOverdue(d, today);
  return (
    <Link href={`/demandas/${d.id}`} className={clsx("card block px-4 py-3 transition-colors hover:border-brand-500", d.priority === "urgent" && d.status !== "done" && "border-l-4 border-l-bad")}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 font-semibold text-ink">
          <span className="mr-1.5 font-normal text-muted">#{d.number}</span>
          {d.title}
        </p>
        <span className={clsx("inline-flex shrink-0 items-center gap-1 text-sm font-semibold", late ? "text-bad" : "text-ink-2")}>
          <Clock aria-hidden className="size-3.5" />
          {late ? `Atrasada · ${formatRelative(d.dueDate, today)}` : formatRelative(d.dueDate, today)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <StatusBadge status={d.status} />
        <PriorityBadge priority={d.priority} />
        <span>{d.clientName}</span>
        <span aria-hidden>·</span>
        <span>{d.categoryName}</span>
        {showAssignee && (
          <>
            <span aria-hidden>·</span>
            <span className={d.assigneeName ? "" : "font-semibold text-warn"}>{d.assigneeName ?? "A distribuir"}</span>
          </>
        )}
      </div>
      {d.status === "waiting" && d.waitingFor && (
        <p className="mt-1.5 text-xs text-wait">
          Aguardando {d.waitingFor} · cobrar {formatRelative(d.followUpDate, today).toLowerCase()}
        </p>
      )}
    </Link>
  );
}
