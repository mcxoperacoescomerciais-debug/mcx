"use client";
/**
 * Kanban por status. No computador, arrastar e soltar; no celular (e sempre),
 * o seletor de status no cartão. A mudança grava no banco e no histórico.
 * "Aguardando retorno" pede de quem e a data de cobrança antes de mover.
 */
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { changeStatusAction } from "@/app/actions";
import { TimePrompt } from "@/components/time-prompt";
import { PriorityBadge, type CardDemand } from "@/components/ui";
import { addDays, formatRelative } from "@/lib/dates";
import { STATUS_LABEL, type Status } from "@/lib/domain";
import { isOverdue } from "@/lib/queue";

const COLUMNS: Status[] = ["todo", "doing", "waiting", "approval", "done"];

export function Board({ demands, today, canReopen }: { demands: CardDemand[]; today: string; canReopen: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [items, move] = useOptimistic(demands, (state, change: { id: string; status: Status }) => state.map((d) => (d.id === change.id ? { ...d, status: change.status } : d)));
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);
  const [waiting, setWaiting] = useState<{ id: string; title: string } | null>(null);
  const [waitingFor, setWaitingFor] = useState("");
  const [followUp, setFollowUp] = useState(addDays(today, 1));
  const [finishing, setFinishing] = useState<{ id: string; title: string } | null>(null);
  const [pendingDone, startDone] = useTransition();
  const [doneError, setDoneError] = useState<string | null>(null);

  function finish(minutes: number) {
    if (!finishing) return;
    setDoneError(null);
    startDone(async () => {
      const result = await changeStatusAction(finishing.id, "done", { minutes });
      if (!result.ok) return setDoneError(result.error);
      setFinishing(null);
      router.refresh();
    });
  }

  function apply(id: string, status: Status, extra: { waitingFor?: string; followUpDate?: string } = {}) {
    setError(null);
    start(async () => {
      move({ id, status });
      const result = await changeStatusAction(id, status, extra);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function request(id: string, status: Status) {
    const d = items.find((x) => x.id === id);
    if (!d || d.status === status) return;
    if (d.status === "done" && !canReopen) return setError("Só o gestor reabre uma demanda concluída.");
    if (status === "waiting") {
      setWaitingFor(d.waitingFor ?? "");
      setWaiting({ id, title: d.title });
      return;
    }
    if (status === "done") {
      setDoneError(null);
      setFinishing({ id, title: d.title });
      return;
    }
    apply(id, status);
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="relative -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
        {COLUMNS.map((status) => {
          const column = items.filter((d) => d.status === status);
          return (
            <section
              key={status}
              aria-label={STATUS_LABEL[status]}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                request(e.dataTransfer.getData("text/plain"), status);
              }}
              className={clsx("w-72 shrink-0 rounded-xl border p-2 lg:w-auto", over === status ? "border-brand-500 bg-brand-50" : "border-line bg-subtle")}
            >
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-2">
                {STATUS_LABEL[status]} <span className="font-normal text-muted">({column.length})</span>
              </h2>
              <ul className="space-y-2">
                {column.map((d) => {
                  const late = isOverdue(d, today);
                  return (
                    <li key={d.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)} className={clsx("card cursor-grab p-3 active:cursor-grabbing", d.priority === "urgent" && d.status !== "done" && "border-l-4 border-l-bad")}>
                      <Link href={`/demandas/${d.id}`} className="block text-sm font-semibold text-ink hover:underline">
                        {d.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {d.clientName} · <span className={d.assigneeName ? "" : "font-semibold text-warn"}>{d.assigneeName ?? "A distribuir"}</span>
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={clsx("font-semibold", late ? "text-bad" : "text-ink-2")}>{late ? "Atrasada · " : ""}{formatRelative(d.dueDate, today)}</span>
                        <PriorityBadge priority={d.priority} />
                      </div>
                      <label className="mt-2 block">
                        <span className="sr-only">Status de {d.title}</span>
                        <select className="field min-h-9 text-xs" value={d.status} onChange={(e) => request(d.id, e.target.value as Status)}>
                          {COLUMNS.map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {finishing && <TimePrompt title={finishing.title} initial={0} pending={pendingDone} error={doneError} onConfirm={finish} onCancel={() => setFinishing(null)} />}

      {waiting && (
        <div role="dialog" aria-modal="true" aria-labelledby="w-title" className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 p-0 sm:items-center sm:p-4">
          <form
            className="card w-full max-w-md space-y-4 rounded-b-none p-5 sm:rounded-b-[var(--radius-card)]"
            onSubmit={(e) => {
              e.preventDefault();
              apply(waiting.id, "waiting", { waitingFor, followUpDate: followUp });
              setWaiting(null);
            }}
          >
            <h2 id="w-title" className="text-lg font-bold text-brand-900">Aguardando retorno</h2>
            <p className="text-sm text-muted">{waiting.title}</p>
            <div>
              <label className="label" htmlFor="w-for">De quem você espera o retorno?</label>
              <input id="w-for" className="field" value={waitingFor} onChange={(e) => setWaitingFor(e.target.value)} required autoFocus />
            </div>
            <div>
              <label className="label" htmlFor="w-date">Cobrar em</label>
              <input id="w-date" type="date" className="field" value={followUp} min={today} onChange={(e) => setFollowUp(e.target.value)} required />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setWaiting(null)}>Cancelar</button>
              <button className="btn-primary">Mover</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
