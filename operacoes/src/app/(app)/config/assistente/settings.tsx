"use client";
import { useState } from "react";
import { saveAssistantConfigAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import { ASSISTANT_MODELS, DEFAULT_SYSTEM_PROMPT, EFFORT_LABEL, EFFORTS, type AssistantConfig, type AssistantModel, type Effort } from "@/lib/assistant";

export function AssistantSettings({ config, people }: { config: AssistantConfig; people: { id: string; name: string }[] }) {
  const { run, pending, message } = useRun();
  const [c, setC] = useState(config);
  const set = <K extends keyof AssistantConfig>(key: K, value: AssistantConfig[K]) => setC((x) => ({ ...x, [key]: value }));
  const toggleUser = (id: string) => set("allowedUserIds", c.allowedUserIds.includes(id) ? c.allowedUserIds.filter((x) => x !== id) : [...c.allowedUserIds, id]);
  const price = (model: AssistantModel, field: "input" | "output" | "cacheRead" | "cacheWrite", v: string) =>
    set("prices", { ...c.prices, [model]: { ...c.prices[model], [field]: Number(v.replace(",", ".")) || 0 } });

  return (
    <form
      className="card space-y-5 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAssistantConfigAction(c));
      }}
    >
      <h2 className="font-semibold text-brand-900">Ajustes</h2>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" className="size-5" checked={c.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        Assistente ligado
      </label>

      <fieldset>
        <legend className="label">Quem pode usar</legend>
        <div className="flex flex-wrap gap-3">
          {people.map((p) => (
            <label key={p.id} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={c.allowedUserIds.includes(p.id)} onChange={() => toggleUser(p.id)} />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="as-model">Modelo</label>
          <select id="as-model" className="field" value={c.model} onChange={(e) => set("model", e.target.value as AssistantModel)}>
            {ASSISTANT_MODELS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="as-effort">Esforço da resposta</label>
          <select id="as-effort" className="field" value={c.effort} onChange={(e) => set("effort", e.target.value as Effort)}>
            {EFFORTS.map((x) => (
              <option key={x} value={x}>{EFFORT_LABEL[x]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="as-global">Limite mensal da empresa (US$)</label>
          <input id="as-global" className="field" type="number" min={0} step={1} value={c.monthlyGlobalUsd} onChange={(e) => set("monthlyGlobalUsd", Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="as-user">Limite mensal por pessoa (US$)</label>
          <input id="as-user" className="field" type="number" min={0} step={1} value={c.monthlyPerUserUsd} onChange={(e) => set("monthlyPerUserUsd", Number(e.target.value))} />
        </div>
        <div>
          <label className="label" htmlFor="as-retention">Guardar conversas por (meses)</label>
          <input id="as-retention" className="field" type="number" min={1} max={60} value={c.retentionMonths} onChange={(e) => set("retentionMonths", Number(e.target.value))} />
        </div>
      </div>
      <p className="text-xs text-muted">Aos 80% do limite da empresa, o Eduardo recebe uma demanda de aviso. Aos 100%, o chat bloqueia novas mensagens até o mês virar ou o limite subir.</p>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-ink-2">Preços por milhão de tokens (US$)</summary>
        <p className="mt-1 text-xs text-muted">Tabela oficial de 11/2026. Só mude se a Anthropic mudar o preço.</p>
        {ASSISTANT_MODELS.map((m) => (
          <div key={m.id} className="mt-3">
            <p className="text-sm font-semibold">{m.label}</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["input", "output", "cacheRead", "cacheWrite"] as const).map((field) => (
                <div key={field}>
                  <label className="label" htmlFor={`p-${m.id}-${field}`}>{{ input: "Entrada", output: "Saída", cacheRead: "Leitura do cache", cacheWrite: "Gravação do cache" }[field]}</label>
                  <input id={`p-${m.id}-${field}`} className="field" inputMode="decimal" defaultValue={String(c.prices[m.id][field])} onChange={(e) => price(m.id, field, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </details>

      <div>
        <label className="label" htmlFor="as-system">Instruções do sistema (contexto da MCX e regras)</label>
        <textarea id="as-system" className="field min-h-48 font-mono text-xs" value={c.systemPrompt} onChange={(e) => set("systemPrompt", e.target.value)} />
        <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => set("systemPrompt", DEFAULT_SYSTEM_PROMPT)}>Voltar ao texto padrão</button>
      </div>

      {message}
      <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Salvando…" : "Salvar ajustes"}</button>
    </form>
  );
}
