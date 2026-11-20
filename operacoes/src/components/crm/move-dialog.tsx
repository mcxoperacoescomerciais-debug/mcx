"use client";
/**
 * Mover o lead de etapa. Cada destino pede o que a regra exige: etapa aberta →
 * próxima ação e data; Proposta → valor e validade; Perdido → motivo;
 * Nutrição → data de retomada; Ganho → confirma o valor mensal fechado.
 */
import { useState, useTransition } from "react";
import { moveLeadAction } from "@/app/actions";
import { LOSS_REASONS, NURTURE_DAYS, PROPOSAL_VALID_DAYS, formatMoney, parseMoney } from "@/lib/crm";
import { addDays } from "@/lib/dates";

export interface MoveLead {
  id: string;
  company: string;
  nextAction: string | null;
  nextActionDate: string | null;
  potentialCents: number | null;
  proposalValueCents: number | null;
}
export interface MoveTarget {
  id: string;
  name: string;
  kind: "open" | "won" | "lost" | "nurture";
  key: string | null;
}

const toInput = (cents: number | null) => (cents ? String(cents / 100).replace(".", ",") : "");

export function MoveDialog({ lead, target, today, onClose, onDone }: { lead: MoveLead; target: MoveTarget; today: string; onClose: () => void; onDone: (message: string) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const keepDate = lead.nextActionDate && lead.nextActionDate >= today ? lead.nextActionDate : addDays(today, 3);
  const [nextAction, setNextAction] = useState(lead.nextAction ?? "");
  const [nextDate, setNextDate] = useState(keepDate);
  const [value, setValue] = useState(toInput(lead.proposalValueCents ?? lead.potentialCents));
  const [validUntil, setValidUntil] = useState(addDays(today, PROPOSAL_VALID_DAYS));
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [resume, setResume] = useState(addDays(today, NURTURE_DAYS));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = parseMoney(value);
    start(async () => {
      const result = await moveLeadAction(lead.id, target.id, {
        nextAction: target.kind === "open" ? nextAction : target.kind === "nurture" ? "Retomar contato" : null,
        nextActionDate: target.kind === "open" ? nextDate : null,
        lossReason: reason || null,
        lossNote: note || null,
        resumeDate: resume,
        proposalValueCents: target.key === "proposal" || target.kind === "won" ? cents : null,
        proposalDate: target.key === "proposal" ? today : null,
        proposalValidUntil: target.key === "proposal" ? validUntil : null,
      });
      if (!result.ok) return setError(result.error);
      onDone(result.message ?? `Movido para ${target.name}.`);
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="mv-title" className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 p-0 sm:items-center sm:p-4">
      <form className="card max-h-dvh w-full max-w-md space-y-4 overflow-y-auto rounded-b-none p-5 sm:rounded-b-[var(--radius-card)]" onSubmit={submit}>
        <div>
          <h2 id="mv-title" className="text-lg font-bold text-brand-900">Mover para {target.name}</h2>
          <p className="text-sm text-muted">{lead.company}</p>
        </div>

        {target.kind === "open" && (
          <>
            {target.key === "proposal" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="mv-value">Valor mensal da proposta (R$)</label>
                  <input id="mv-value" className="field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
                </div>
                <div>
                  <label className="label" htmlFor="mv-valid">Validade da proposta</label>
                  <input id="mv-valid" type="date" className="field" value={validUntil} min={today} onChange={(e) => setValidUntil(e.target.value)} required />
                </div>
              </div>
            )}
            <div>
              <label className="label" htmlFor="mv-next">Próxima ação</label>
              <input id="mv-next" className="field" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Ex.: Cobrar retorno da proposta" required />
            </div>
            <div>
              <label className="label" htmlFor="mv-date">Data da próxima ação</label>
              <input id="mv-date" type="date" className="field" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
            </div>
          </>
        )}

        {target.kind === "lost" && (
          <>
            <div>
              <label className="label" htmlFor="mv-reason">Motivo da perda</label>
              <select id="mv-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus>
                <option value="">Escolha…</option>
                {LOSS_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="mv-note">Observação{reason === "Outro" ? " (obrigatória)" : " (opcional)"}</label>
              <input id="mv-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} required={reason === "Outro"} />
            </div>
          </>
        )}

        {target.kind === "nurture" && (
          <div>
            <label className="label" htmlFor="mv-resume">Retomar o contato em</label>
            <input id="mv-resume" type="date" className="field" value={resume} min={addDays(today, 1)} onChange={(e) => setResume(e.target.value)} required autoFocus />
            <p className="mt-1 text-xs text-muted">O lead volta para “Comercial hoje” nessa data.</p>
          </div>
        )}

        {target.kind === "won" && (
          <>
            <div>
              <label className="label" htmlFor="mv-won">Valor mensal fechado (R$)</label>
              <input id="mv-won" className="field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
              <p className="mt-1 text-xs text-muted">Potencial calculado: {formatMoney(lead.potentialCents)}.</p>
            </div>
            <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">Ao confirmar, o sistema cria o contratante (se ainda não existir), um contrato em rascunho e a demanda de implantação. Não dá para desfazer pelo funil.</p>
          </>
        )}

        {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>Cancelar</button>
          <button className="btn-primary" disabled={pending}>{target.kind === "won" ? "Confirmar ganho" : "Mover"}</button>
        </div>
      </form>
    </div>
  );
}
