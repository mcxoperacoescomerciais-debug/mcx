"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { addCommentAction, changeStatusAction, deleteDemandAction, setSharesAction, updateDemandAction } from "@/app/actions";
import { DuePicker } from "@/components/due-picker";
import { TimePrompt } from "@/components/time-prompt";
import { useRun } from "@/components/use-run";
import { addDays } from "@/lib/dates";
import { ORIGINS, ORIGIN_LABEL, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Origin, type Priority, type Status } from "@/lib/domain";
import type { FormOptions } from "@/server/demands";

export function StatusControl({ id, title, status, waitingFor, followUpDate, today, canReopen, loggedMinutes }: { id: string; title: string; status: Status; waitingFor: string | null; followUpDate: string | null; today: string; canReopen: boolean; loggedMinutes: number }) {
  const { run, pending, message } = useRun();
  const router = useRouter();
  const [finishing, setFinishing] = useState(false);
  const [donePending, startDone] = useTransition();
  const [doneError, setDoneError] = useState<string | null>(null);
  const [askWaiting, setAskWaiting] = useState(false);
  const [who, setWho] = useState(waitingFor ?? "");
  const [when, setWhen] = useState(followUpDate ?? addDays(today, 1));
  const closed = status === "done" || status === "cancelled";
  const locked = closed && !canReopen;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            disabled={pending || locked || (status === s && s !== "waiting")}
            className={clsx("chip disabled:opacity-60", status === s && "chip-on")}
            onClick={() => {
              if (s === "waiting") return setAskWaiting(true);
              if (s === "done") {
                setDoneError(null);
                return setFinishing(true);
              }
              run(() => changeStatusAction(id, s), () => setAskWaiting(false));
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {locked && <p className="text-sm text-muted">Só o gestor reabre uma demanda concluída ou cancelada.</p>}
      {finishing && (
        <TimePrompt
          title={title}
          initial={loggedMinutes}
          pending={donePending}
          error={doneError}
          onCancel={() => setFinishing(false)}
          onConfirm={(minutes) =>
            startDone(async () => {
              const r = await changeStatusAction(id, "done", { minutes });
              if (!r.ok) return setDoneError(r.error);
              setFinishing(false);
              router.refresh();
            })
          }
        />
      )}
      {askWaiting && (
        <form
          className="grid gap-3 rounded-lg bg-wait-bg p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changeStatusAction(id, "waiting", { waitingFor: who, followUpDate: when }), () => setAskWaiting(false));
          }}
        >
          <div>
            <label className="label" htmlFor="st-who">De quem você espera o retorno?</label>
            <input id="st-who" className="field" value={who} onChange={(e) => setWho(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="st-when">Cobrar em</label>
            <input id="st-when" type="date" className="field" value={when} onChange={(e) => setWhen(e.target.value)} required />
          </div>
          <button className="btn-primary" disabled={pending}>Salvar</button>
        </form>
      )}
      {message}
    </div>
  );
}

interface Editable {
  id: string;
  title: string;
  clientId: string;
  categoryId: string;
  typeId: string | null;
  assigneeId: string | null;
  priority: Priority;
  dueDate: string | null;
  description: string | null;
  brand: string | null;
  store: string | null;
  promoter: string | null;
  origin: Origin;
  estimateMinutes: number | null;
}

export function EditDemand({ demand, options, today, canAssign }: { demand: Editable; options: FormOptions; today: string; canAssign: boolean }) {
  const { run, pending, message } = useRun();
  const [f, setF] = useState({ ...demand, description: demand.description ?? "", brand: demand.brand ?? "", store: demand.store ?? "", promoter: demand.promoter ?? "", estimate: demand.estimateMinutes === null ? "" : String(demand.estimateMinutes) });
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const brands = options.brands.filter((b) => b.clientId === f.clientId);
  const types = options.types.filter((ty) => ty.categoryId === f.categoryId);

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(() =>
      updateDemandAction(demand.id, {
        title: f.title,
        clientId: f.clientId,
        categoryId: f.categoryId,
        typeId: types.some((ty) => ty.id === f.typeId) ? f.typeId : null,
        ...(canAssign && f.assigneeId ? { assigneeId: f.assigneeId } : {}),
        priority: f.priority,
        dueDate: f.dueDate,
        description: f.description,
        brand: f.brand,
        store: f.store,
        promoter: f.promoter,
        origin: f.origin,
        estimateMinutes: f.estimate.trim() === "" ? null : Number(f.estimate),
      }),
    );
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <label className="label" htmlFor="e-title">Título</label>
        <input id="e-title" className="field" value={f.title} onChange={(e) => set("title", e.target.value)} required minLength={3} maxLength={200} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="e-client">Contratante</label>
          <select id="e-client" className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
            {options.clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-cat">Categoria</label>
          <select id="e-cat" className="field" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-type">Tipo</label>
          <select id="e-type" className="field" value={types.some((ty) => ty.id === f.typeId) ? (f.typeId ?? "") : ""} onChange={(e) => set("typeId", e.target.value || null)}>
            <option value="">Sem tipo</option>
            {types.map((ty) => (
              <option key={ty.id} value={ty.id}>{ty.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-resp">Responsável{canAssign ? "" : " (só o gestor troca)"}</label>
          <select id="e-resp" className="field" value={f.assigneeId ?? ""} onChange={(e) => set("assigneeId", e.target.value || null)} disabled={!canAssign}>
            {!f.assigneeId && <option value="">A distribuir</option>}
            {options.people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-pri">Prioridade</label>
          <select id="e-pri" className="field" value={f.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p} disabled={f.dueDate === null && p !== "low"}>{PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <span className="label">Prazo</span>
        <DuePicker
          value={f.dueDate}
          today={today}
          onChange={(v) => setF((prev) => ({ ...prev, dueDate: v, priority: v === null ? "low" : prev.priority }))}
        />
      </div>
      <div>
        <label className="label" htmlFor="e-desc">Descrição</label>
        <textarea id="e-desc" className="field min-h-24 py-2" value={f.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="e-brand">Marca</label>
          <input id="e-brand" className="field" list="e-brands" value={f.brand} onChange={(e) => set("brand", e.target.value)} />
          <datalist id="e-brands">
            {brands.map((b) => (
              <option key={b.name} value={b.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="e-store">Loja</label>
          <input id="e-store" className="field" value={f.store} onChange={(e) => set("store", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="e-prom">Promotor</label>
          <input id="e-prom" className="field" value={f.promoter} onChange={(e) => set("promoter", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="e-origin">Origem</label>
          <select id="e-origin" className="field" value={f.origin} onChange={(e) => set("origin", e.target.value as Origin)}>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-est">Tempo estimado (min)</label>
          <input id="e-est" className="field" inputMode="numeric" pattern="[0-9]*" value={f.estimate} onChange={(e) => set("estimate", e.target.value)} />
        </div>
      </div>
      {message}
      <button className="btn-primary" disabled={pending}>{pending ? "Salvando…" : "Salvar alterações"}</button>
    </form>
  );
}

export function Comments({ id }: { id: string }) {
  const { run, pending, message } = useRun();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addCommentAction(id, body), () => setBody(""));
      }}
    >
      <label className="sr-only" htmlFor="cm-new">Novo comentário</label>
      <textarea id="cm-new" className="field min-h-20 py-2" placeholder="Escreva um comentário" value={body} onChange={(e) => setBody(e.target.value)} required maxLength={4000} />
      {message}
      <button className="btn-ghost" disabled={pending}>Comentar</button>
    </form>
  );
}

export function Shares({ id, people, shared }: { id: string; people: { id: string; name: string }[]; shared: string[] }) {
  const { run, pending, message } = useRun();
  const [selected, setSelected] = useState(shared);
  return (
    <div className="space-y-2">
      {people.map((p) => (
        <label key={p.id} className="flex min-h-9 items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="size-4" checked={selected.includes(p.id)} onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))} />
          {p.name}
        </label>
      ))}
      {message}
      <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setSharesAction(id, selected))}>Salvar</button>
    </div>
  );
}

export function DeleteDemand({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <button type="button" className="btn-danger w-full" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden className="size-4" /> Excluir demanda
      </button>
    );
  }
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await deleteDemandAction(id, reason);
          if (!r.ok) return setError(r.error);
          router.push("/demandas");
        });
      }}
    >
      <label className="label" htmlFor="del-reason">Motivo da exclusão</label>
      <input id="del-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={5} />
      <p className="text-xs text-muted">A demanda sai das telas; o registro e o histórico ficam guardados.</p>
      {error && <p role="alert" className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Voltar</button>
        <button className="btn-danger" disabled={pending}>Excluir</button>
      </div>
    </form>
  );
}
