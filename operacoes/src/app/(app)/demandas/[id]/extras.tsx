"use client";
/** Tempo (cronômetro e lançamentos), checklist com modelos e "Faltou algo". */
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Play, Square, Trash2 } from "lucide-react";
import {
  addChecklistItemAction,
  addMissToTemplateAction,
  addTimeEntryAction,
  applyTemplateAction,
  deleteTimeEntryAction,
  removeChecklistItemAction,
  reportMissAction,
  saveAsTemplateAction,
  setItemNotApplicableAction,
  startTimerAction,
  stopTimerAction,
  toggleChecklistItemAction,
  verifyItemAction,
} from "@/app/actions";
import { useRun } from "@/components/use-run";
import { formatBr, formatMinutes } from "@/lib/dates";

const SOURCE_LABEL = { completion: "Conclusão", timer: "Cronômetro", manual: "Lançamento" } as const;

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="font-mono text-lg font-bold tabular-nums">{pad(Math.floor(seconds / 3600))}:{pad(Math.floor((seconds % 3600) / 60))}:{pad(seconds % 60)}</span>;
}

export function TimeSection({ id, today, userId, timerStartedAt, entries, total, showNames }: { id: string; today: string; userId: string; timerStartedAt: string | null; entries: { id: string; userId: string; userName: string; day: string; minutes: number; source: keyof typeof SOURCE_LABEL; note: string | null }[]; total: number; showNames: boolean }) {
  const { run, pending, message } = useRun();
  const [day, setDay] = useState(today);
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {timerStartedAt ? (
          <>
            <Elapsed since={timerStartedAt} />
            <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => stopTimerAction())}>
              <Square aria-hidden className="size-4" /> Parar cronômetro
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => startTimerAction(id))}>
            <Play aria-hidden className="size-4" /> Iniciar cronômetro
          </button>
        )}
        <span className="text-sm text-muted">Total apontado: <strong className="text-ink-2">{formatMinutes(total)}</strong></span>
      </div>
      {entries.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-ink-2">
                <strong>{formatMinutes(e.minutes)}</strong> · {formatBr(e.day)} · {SOURCE_LABEL[e.source]}
                {showNames && ` · ${e.userName}`}
                {e.note && <span className="text-muted"> — {e.note}</span>}
              </span>
              {(e.userId === userId || showNames) && (
                <button type="button" aria-label="Remover lançamento" className="rounded-lg p-1.5 text-muted hover:bg-bad-bg hover:text-bad" disabled={pending} onClick={() => run(() => deleteTimeEntryAction(e.id))}>
                  <Trash2 aria-hidden className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[auto_7rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addTimeEntryAction(id, { day, minutes: Number(minutes), note }), () => {
            setMinutes("");
            setNote("");
          });
        }}
      >
        <div>
          <label className="label" htmlFor="te-day">Lançar tempo em</label>
          <input id="te-day" type="date" className="field" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="te-min">Minutos</label>
          <input id="te-min" className="field" inputMode="numeric" pattern="[0-9]*" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} required />
        </div>
        <div>
          <label className="label" htmlFor="te-note">Observação (opcional)</label>
          <input id="te-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </div>
        <button className="btn-ghost" disabled={pending}>Lançar</button>
      </form>
      {message}
    </div>
  );
}

export interface ChecklistItem {
  id: string;
  text: string;
  section: string | null;
  quantity: number | null;
  unit: string | null;
  required: boolean;
  note: string | null;
  checked: boolean;
  by: string | null;
  notApplicable: boolean;
  naReason: string | null;
  verified: boolean;
  verifiedBy: string | null;
}

export function Checklist({ id, items, doubleCheck, templates, canManage, templateName }: { id: string; items: ChecklistItem[]; doubleCheck: boolean; templates: { id: string; name: string }[]; canManage: boolean; templateName: string | null }) {
  const { run, pending, message } = useRun();
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [actions, setActions] = useState("1");
  const [naFor, setNaFor] = useState<string | null>(null);
  const [naReason, setNaReason] = useState("");
  const [saveName, setSaveName] = useState("");
  const resolved = items.filter((i) => i.checked || i.notApplicable).length;
  const sections = [...new Set(items.map((i) => i.section ?? ""))];

  return (
    <div className="space-y-4">
      {templateName && <p className="text-xs text-muted">Modelo aplicado: <strong className="text-ink-2">{templateName}</strong></p>}
      {items.length > 0 && <p className="text-xs text-muted">{resolved} de {items.length} resolvidos{doubleCheck ? ` · ${items.filter((i) => i.verified).length} conferidos` : ""}</p>}
      {sections.map((section) => (
        <div key={section || "sem-secao"}>
          {section && <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-2">{section}</h3>}
          <ul className="space-y-1">
            {items.filter((i) => (i.section ?? "") === section).map((item) => (
              <li key={item.id} className="rounded-lg px-2 py-1 hover:bg-subtle">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label className="flex min-h-10 min-w-0 flex-1 items-center gap-3">
                    <input type="checkbox" className="size-5 shrink-0" checked={item.checked} disabled={pending || item.notApplicable} onChange={(e) => run(() => toggleChecklistItemAction(item.id, e.target.checked))} />
                    <span className={clsx("text-sm", (item.checked || item.notApplicable) && "text-muted line-through")}>
                      {item.quantity !== null && <strong>{item.quantity}{item.unit ? ` ${item.unit}` : ""} · </strong>}
                      {item.text}
                    </span>
                    {item.required && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">Obrigatório</span>}
                  </label>
                  {doubleCheck && (
                    <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-ink-2">
                      <input type="checkbox" className="size-5" checked={item.verified} disabled={pending || !item.checked} onChange={(e) => run(() => verifyItemAction(item.id, e.target.checked))} />
                      Conferido
                    </label>
                  )}
                  <button type="button" className="text-xs font-semibold text-brand-600 underline-offset-2 hover:underline" disabled={pending} onClick={() => (item.notApplicable ? run(() => setItemNotApplicableAction(item.id, null)) : (setNaFor(item.id), setNaReason("")))}>
                    {item.notApplicable ? "Voltar a aplicar" : "Não se aplica"}
                  </button>
                  <button type="button" aria-label={`Remover ${item.text}`} className="rounded-lg p-2 text-muted hover:bg-bad-bg hover:text-bad" disabled={pending} onClick={() => run(() => removeChecklistItemAction(item.id))}>
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
                <p className="pl-8 text-xs text-muted">
                  {[item.note, item.checked && item.by ? `Separado por ${item.by}` : null, item.verified && item.verifiedBy ? `conferido por ${item.verifiedBy}` : null, item.notApplicable ? `Não se aplica: ${item.naReason}` : null].filter(Boolean).join(" · ")}
                </p>
                {naFor === item.id && (
                  <form
                    className="mt-1 flex gap-2 pl-8"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => setItemNotApplicableAction(item.id, naReason), () => setNaFor(null));
                    }}
                  >
                    <label className="sr-only" htmlFor={`na-${item.id}`}>Motivo</label>
                    <input id={`na-${item.id}`} className="field" placeholder="Por que não se aplica?" value={naReason} onChange={(e) => setNaReason(e.target.value)} required minLength={3} autoFocus />
                    <button className="btn-ghost shrink-0" disabled={pending}>Salvar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addChecklistItemAction(id, text), () => setText(""));
        }}
      >
        <label className="sr-only" htmlFor="ck-new">Novo item</label>
        <input id="ck-new" className="field" placeholder="Novo item do checklist" value={text} onChange={(e) => setText(e.target.value)} required maxLength={300} />
        <button className="btn-ghost shrink-0" disabled={pending}>Adicionar</button>
      </form>
      {templates.length > 0 && (
        <form
          className="grid gap-2 rounded-lg bg-subtle p-3 sm:grid-cols-[1fr_7rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => applyTemplateAction(id, templateId, Number(actions) || 1));
          }}
        >
          <div>
            <label className="label" htmlFor="ck-tpl">Aplicar modelo</label>
            <select id="ck-tpl" className="field" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
              <option value="">Escolha…</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ck-actions">Nº de ações</label>
            <input id="ck-actions" className="field" inputMode="numeric" pattern="[0-9]*" value={actions} onChange={(e) => setActions(e.target.value.replace(/\D/g, ""))} required />
          </div>
          <button className="btn-ghost" disabled={pending}>Aplicar</button>
        </form>
      )}
      {canManage && items.length > 0 && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveAsTemplateAction(id, saveName), () => setSaveName(""));
          }}
        >
          <label className="sr-only" htmlFor="ck-save">Nome do modelo novo</label>
          <input id="ck-save" className="field" placeholder="Salvar este checklist como modelo (nome)" value={saveName} onChange={(e) => setSaveName(e.target.value)} required minLength={3} />
          <button className="btn-ghost shrink-0" disabled={pending}>Salvar como modelo</button>
        </form>
      )}
      {message}
    </div>
  );
}

export function Misses({ id, misses, canManage, hasTemplate }: { id: string; misses: { id: string; item: string; quantity: string | null; impact: string | null; addedToTemplate: boolean }[]; canManage: boolean; hasTemplate: boolean }) {
  const { run, pending, message } = useRun();
  const empty = { item: "", quantity: "", impact: "" };
  const [f, setF] = useState(empty);
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {misses.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
            <span>
              <strong>{m.item}</strong>
              {m.quantity && ` · ${m.quantity}`}
              {m.impact && ` — ${m.impact}`}
            </span>
            {hasTemplate && canManage && (m.addedToTemplate ? <span className="text-xs font-semibold">Já está no modelo</span> : (
              <button type="button" className="btn-ghost min-h-9" disabled={pending} onClick={() => run(() => addMissToTemplateAction(m.id))}>Adicionar este item ao modelo</button>
            ))}
          </li>
        ))}
      </ul>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_8rem]"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => reportMissAction(id, f), () => setF(empty));
        }}
      >
        <input aria-label="Item que faltou" className="field" placeholder="O que faltou? (ex.: colheres)" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} required minLength={2} />
        <input aria-label="Quantidade" className="field" placeholder="Quantidade" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        <input aria-label="Impacto" className="field sm:col-span-2" placeholder="Qual foi o impacto? (opcional)" value={f.impact} onChange={(e) => setF({ ...f, impact: e.target.value })} />
        <button className="btn-ghost sm:justify-self-start" disabled={pending}>Registrar “Faltou algo”</button>
      </form>
      {message}
    </div>
  );
}
