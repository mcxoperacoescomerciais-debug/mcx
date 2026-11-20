"use client";
/** "Quanto tempo levou?" — obrigatório ao concluir. Botões rápidos + Outro. */
import { useState } from "react";
import clsx from "clsx";
import { formatMinutes } from "@/lib/dates";

const QUICK = [5, 15, 30, 45, 60, 120];

export function TimePrompt({ title, initial, pending, error, onConfirm, onCancel }: { title: string; initial: number; pending: boolean; error: string | null; onConfirm: (minutes: number) => void; onCancel: () => void }) {
  const [minutes, setMinutes] = useState<number>(initial > 0 ? initial : 0);
  const [other, setOther] = useState(initial > 0 && !QUICK.includes(initial) ? String(initial) : "");
  const custom = other.trim() !== "";
  const value = custom ? Number(other) : minutes;
  const valid = Number.isInteger(value) && value > 0 && value <= 960;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="tp-title" className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 sm:items-center sm:p-4">
      <form
        className="card w-full max-w-md space-y-4 rounded-b-none p-5 sm:rounded-b-[var(--radius-card)]"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onConfirm(value);
        }}
      >
        <div>
          <h2 id="tp-title" className="text-lg font-bold text-brand-900">Quanto tempo levou?</h2>
          <p className="mt-0.5 text-sm text-muted">{title}</p>
        </div>
        {initial > 0 && <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">Já apontado nesta demanda: {formatMinutes(initial)}. Ajuste o total se trabalhou mais.</p>}
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={!custom && minutes === q}
              className={clsx("chip", !custom && minutes === q && "chip-on")}
              onClick={() => {
                setMinutes(q);
                setOther("");
              }}
            >
              {formatMinutes(q)}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="tp-other">Outro (em minutos)</label>
          <input id="tp-other" className="field" inputMode="numeric" pattern="[0-9]*" value={other} onChange={(e) => setOther(e.target.value.replace(/\D/g, ""))} placeholder="Ex.: 90" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" disabled={!valid || pending}>{pending ? "Salvando…" : "Concluir demanda"}</button>
        </div>
      </form>
    </div>
  );
}
