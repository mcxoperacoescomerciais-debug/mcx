"use client";

/**
 * Modo ações: resultado da ação informado pela promotora — pessoas abordadas, amostras
 * distribuídas, unidades vendidas durante a ação e aceitação do produto (1 a 5).
 * Grava no aparelho a cada toque (funciona sem sinal) e vai para o servidor na sincronização.
 */
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import { ACCEPTANCE_LABEL, EMPTY_OUTCOME, conversion, pct, type ActionOutcome } from "@/lib/actions";
import { updateAttendance, type LocalAttendance } from "../_lib/local-store";
import { haptic } from "../_lib/hooks";

const FIELDS: { key: "approached" | "samples" | "unitsSold"; label: string; hint: string; step: number }[] = [
  { key: "approached", label: "Pessoas abordadas", hint: "Quantas pessoas você abordou durante a ação", step: 5 },
  { key: "samples", label: "Amostras distribuídas", hint: "Copinhos, porções ou sachês entregues", step: 5 },
  { key: "unitsSold", label: "Unidades vendidas", hint: "Unidades do produto que foram para o carrinho durante a ação", step: 1 },
];

export function ActionResultStep({ visitId, attendance, editable }: { visitId: string; attendance: LocalAttendance; editable: boolean }) {
  const r: ActionOutcome = attendance.actionResult ?? EMPTY_OUTCOME;
  const save = (patch: Partial<ActionOutcome>) => {
    haptic();
    void updateAttendance(visitId, attendance.id, { actionResult: { ...r, ...patch } });
  };
  const conv = r.approached && r.unitsSold !== null ? conversion(r.unitsSold, r.approached) : null;

  return (
    <div className="space-y-3 pb-4">
      <div>
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Resultado da ação</h2>
        <p className="text-[13px] text-muted mt-1">Preencha no fim da ação. Os números vão para o relatório da marca.</p>
      </div>

      {FIELDS.map((f) => {
        const v = r[f.key];
        return (
          <div key={f.key} className="bg-surface border border-line rounded-2xl p-4">
            <label htmlFor={`res-${f.key}`} className="block text-[15px] font-semibold">
              {f.label}
            </label>
            <p className="text-[12.5px] text-muted">{f.hint}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={!editable || !v}
                aria-label={`Diminuir ${f.label.toLowerCase()}`}
                onClick={() => save({ [f.key]: Math.max(0, (v ?? 0) - f.step) })}
                className="size-12 rounded-xl border border-line-strong grid place-items-center disabled:opacity-40"
              >
                <Minus className="size-5" />
              </button>
              <input
                id={`res-${f.key}`}
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={!editable}
                value={v ?? ""}
                placeholder="0"
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                  save({ [f.key]: digits === "" ? null : Number(digits) });
                }}
                className="h-12 flex-1 min-w-0 rounded-xl border border-line-strong text-center text-[22px] font-bold tnum bg-canvas"
              />
              <button
                type="button"
                disabled={!editable}
                aria-label={`Aumentar ${f.label.toLowerCase()}`}
                onClick={() => save({ [f.key]: (v ?? 0) + f.step })}
                className="size-12 rounded-xl bg-brand-800 text-white grid place-items-center disabled:opacity-40"
              >
                <Plus className="size-5" />
              </button>
            </div>
          </div>
        );
      })}

      <div className="bg-surface border border-line rounded-2xl p-4">
        <p className="text-[15px] font-semibold">Aceitação do produto</p>
        <p className="text-[12.5px] text-muted">Como os clientes reagiram ao provar</p>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              disabled={!editable}
              aria-pressed={r.acceptance === n}
              onClick={() => save({ acceptance: n })}
              className={clsx(
                "h-16 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5",
                r.acceptance === n ? "bg-brand-800 border-brand-800 text-white" : "border-line-strong bg-canvas text-ink-2",
              )}
            >
              <span className="text-[18px] font-bold leading-none">{n}</span>
              <span className="text-[10.5px] font-semibold leading-tight">{ACCEPTANCE_LABEL[n]}</span>
            </button>
          ))}
        </div>
      </div>

      {conv !== null ? (
        <p className="text-[13px] text-center text-muted">
          Conversão desta ação: <strong className="text-ink">{pct(conv)}</strong> (vendas ÷ abordagens)
        </p>
      ) : null}
      <p className="text-[12.5px] text-muted text-center">Observações sobre a ação vão na etapa Ocorrências.</p>
    </div>
  );
}
