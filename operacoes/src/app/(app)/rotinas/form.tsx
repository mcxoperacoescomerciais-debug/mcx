"use client";
import { useState } from "react";
import clsx from "clsx";
import { saveRoutineAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/domain";
import { FREQUENCY_LABEL, WEEKDAY_LABEL, type Frequency } from "@/lib/routines";
import type { FormOptions } from "@/server/demands";

interface Routine {
  id: string;
  name: string;
  clientId: string;
  categoryId: string;
  typeId: string | null;
  assigneeId: string;
  priority: Priority;
  frequency: Frequency;
  weekdays: number[];
  monthDay: number | null;
  intervalDays: number | null;
  startDate: string;
  leadDays: number;
  dueOffsetDays: number;
  templateId: string | null;
  active: boolean;
}

export function RoutineForm({ routine, options, templates, today }: { routine?: Routine; options: FormOptions; templates: { id: string; name: string }[]; today: string }) {
  const { run, pending, message } = useRun();
  const blank = { name: "", clientId: "", categoryId: "", typeId: "", assigneeId: "", priority: "medium" as Priority, frequency: "monthly" as Frequency, weekdays: [1] as number[], monthDay: "1", intervalDays: "15", startDate: today, leadDays: "0", dueOffsetDays: "0", templateId: "", active: true };
  const [f, setF] = useState(routine ? { ...routine, typeId: routine.typeId ?? "", templateId: routine.templateId ?? "", monthDay: String(routine.monthDay ?? 1), intervalDays: String(routine.intervalDays ?? 15), leadDays: String(routine.leadDays), dueOffsetDays: String(routine.dueOffsetDays) } : blank);
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const types = options.types.filter((t) => t.categoryId === f.categoryId);
  const k = routine?.id ?? "nova";
  const digits = (v: string) => v.replace(/\D/g, "");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            saveRoutineAction(routine?.id ?? null, {
              name: f.name,
              clientId: f.clientId,
              categoryId: f.categoryId,
              typeId: types.some((t) => t.id === f.typeId) ? f.typeId : null,
              assigneeId: f.assigneeId,
              priority: f.priority,
              frequency: f.frequency,
              weekdays: f.weekdays,
              monthDay: Number(f.monthDay) || null,
              intervalDays: Number(f.intervalDays) || null,
              startDate: f.startDate,
              leadDays: Number(f.leadDays) || 0,
              dueOffsetDays: Number(f.dueOffsetDays) || 0,
              templateId: f.templateId || null,
              active: f.active,
            }),
          () => !routine && setF(blank),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="label" htmlFor={`rt-name-${k}`}>Nome (vira o título da demanda, com a data)</label>
          <input id={`rt-name-${k}`} className="field" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Fechamento mensal Barão" required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor={`rt-cli-${k}`}>Contratante</label>
          <select id={`rt-cli-${k}`} className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)} required>
            <option value="">Escolha…</option>
            {options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`rt-cat-${k}`}>Categoria</label>
          <select id={`rt-cat-${k}`} className="field" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} required>
            <option value="">Escolha…</option>
            {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`rt-type-${k}`}>Tipo</label>
          <select id={`rt-type-${k}`} className="field" value={types.some((t) => t.id === f.typeId) ? f.typeId : ""} onChange={(e) => set("typeId", e.target.value)}>
            <option value="">Sem tipo</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`rt-resp-${k}`}>Responsável padrão</label>
          <select id={`rt-resp-${k}`} className="field" value={f.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} required>
            <option value="">Escolha…</option>
            {options.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`rt-pri-${k}`}>Prioridade</label>
          <select id={`rt-pri-${k}`} className="field" value={f.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`rt-tpl-${k}`}>Modelo de checklist</label>
          <select id={`rt-tpl-${k}`} className="field" value={f.templateId} onChange={(e) => set("templateId", e.target.value)}>
            <option value="">Nenhum</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`rt-freq-${k}`}>Frequência</label>
          <select id={`rt-freq-${k}`} className="field" value={f.frequency} onChange={(e) => set("frequency", e.target.value as Frequency)}>
            {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((x) => <option key={x} value={x}>{FREQUENCY_LABEL[x]}</option>)}
          </select>
        </div>
        {f.frequency === "weekly" && (
          <fieldset className="sm:col-span-2">
            <legend className="label">Dias da semana</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABEL.map((label, d) => (
                <button key={label} type="button" aria-pressed={f.weekdays.includes(d)} className={clsx("chip", f.weekdays.includes(d) && "chip-on")} onClick={() => set("weekdays", f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d])}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {f.frequency === "monthly" && (
          <div>
            <label className="label" htmlFor={`rt-md-${k}`}>Dia do mês (1 a 31)</label>
            <input id={`rt-md-${k}`} className="field" inputMode="numeric" value={f.monthDay} onChange={(e) => set("monthDay", digits(e.target.value))} required />
          </div>
        )}
        {f.frequency === "interval" && (
          <div>
            <label className="label" htmlFor={`rt-iv-${k}`}>A cada quantos dias</label>
            <input id={`rt-iv-${k}`} className="field" inputMode="numeric" value={f.intervalDays} onChange={(e) => set("intervalDays", digits(e.target.value))} required />
          </div>
        )}
        <div>
          <label className="label" htmlFor={`rt-start-${k}`}>Vale a partir de</label>
          <input id={`rt-start-${k}`} type="date" className="field" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor={`rt-lead-${k}`}>Gerar quantos dias antes</label>
          <input id={`rt-lead-${k}`} className="field" inputMode="numeric" value={f.leadDays} onChange={(e) => set("leadDays", digits(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor={`rt-due-${k}`}>Prazo: dias depois da data</label>
          <input id={`rt-due-${k}`} className="field" inputMode="numeric" value={f.dueOffsetDays} onChange={(e) => set("dueOffsetDays", digits(e.target.value))} />
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Rotina ativa (desmarque para pausar)
      </label>
      {message}
      <button className="btn-primary" disabled={pending}>{routine ? "Salvar rotina" : "Criar rotina"}</button>
    </form>
  );
}
