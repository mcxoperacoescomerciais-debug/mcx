"use client";
import { useState } from "react";
import { saveMessageTemplateAction, saveStageAction, setDailyGoalAction } from "@/app/actions";
import { useRun } from "@/components/use-run";

type TemplateStatus = "draft" | "approved" | "archived";

export function TemplateForm({ template, stages, canApprove }: { template?: { id: string; name: string; stageId: string | null; body: string; status: TemplateStatus }; stages: { id: string; name: string }[]; canApprove: boolean }) {
  const { run, pending, message } = useRun();
  const blank = { name: "", stageId: "", body: "" };
  const [f, setF] = useState(template ? { name: template.name, stageId: template.stageId ?? "", body: template.body } : blank);
  const k = template?.id ?? "novo";
  const save = (status: TemplateStatus) => run(() => saveMessageTemplateAction(template?.id ?? null, { name: f.name, stageId: f.stageId || null, body: f.body, status }), () => !template && setF(blank));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save("draft");
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`mt-name-${k}`}>Nome do modelo</label>
          <input id={`mt-name-${k}`} className="field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor={`mt-stage-${k}`}>Etapa do funil</label>
          <select id={`mt-stage-${k}`} className="field" value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
            <option value="">Qualquer etapa</option>
            {stages.map((st) => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor={`mt-body-${k}`}>Texto — variáveis: {"{nome}"}, {"{empresa}"}, {"{cidade}"}, {"{produto}"}</label>
        <textarea id={`mt-body-${k}`} className="field min-h-28 py-2" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} required minLength={10} maxLength={2000} />
      </div>
      {message}
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={pending}>{template ? "Salvar como rascunho" : "Criar rascunho"}</button>
        {canApprove && (
          <button type="button" className="btn-primary" disabled={pending} onClick={() => save("approved")}>
            {template?.status === "approved" ? "Salvar (aprovado)" : "Aprovar e publicar"}
          </button>
        )}
        {canApprove && template && (
          <button
            type="button"
            className="btn-danger"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Arquivar o modelo “${template.name}”? Ele some da lista de mensagens.`)) save("archived");
            }}
          >
            Arquivar
          </button>
        )}
      </div>
      {!canApprove && <p className="text-xs text-muted">Aprovar o texto é do dono; o rascunho já pode ser usado, com aviso.</p>}
    </form>
  );
}

export function StageForm({ stage }: { stage?: { id: string; name: string; probability: number; kind: string; fixed: boolean; active: boolean } }) {
  const { run, pending, message } = useRun();
  const [name, setName] = useState(stage?.name ?? "");
  const [probability, setProbability] = useState(String(stage?.probability ?? 30));
  const closed = stage?.kind === "won" || stage?.kind === "lost";
  const k = stage?.id ?? "nova";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveStageAction(stage?.id ?? null, { name, probability: Number(probability) || 0 }),
          () => !stage && setName(""),
        );
      }}
    >
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor={`st-name-${k}`}>{stage ? "Nome da etapa" : "Nova etapa (entra antes de “Ganho”)"}</label>
        <input id={`st-name-${k}`} className="field" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
      </div>
      <div className="w-28">
        <label className="label" htmlFor={`st-prob-${k}`}>Chance (%)</label>
        <input id={`st-prob-${k}`} className="field" inputMode="numeric" value={probability} disabled={closed} onChange={(e) => setProbability(e.target.value.replace(/\D/g, "").slice(0, 3))} />
      </div>
      <button className="btn-ghost" disabled={pending}>{stage ? "Salvar" : "Criar etapa"}</button>
      {stage && !stage.fixed && (
        <button type="button" className="btn-danger" disabled={pending} onClick={() => run(() => saveStageAction(stage.id, { name, probability: Number(probability) || 0, active: !stage.active }))}>
          {stage.active ? "Desativar" : "Reativar"}
        </button>
      )}
      <div className="w-full">{message}</div>
    </form>
  );
}

export function GoalForm({ goal }: { goal: number }) {
  const { run, pending, message } = useRun();
  const [value, setValue] = useState(String(goal));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setDailyGoalAction(Number(value) || 0));
      }}
    >
      <div className="w-40">
        <label className="label" htmlFor="goal">Novos contatos por dia</label>
        <input id="goal" className="field" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 3))} required />
      </div>
      <button className="btn-ghost" disabled={pending}>Salvar meta</button>
      <div className="w-full">{message}</div>
    </form>
  );
}
