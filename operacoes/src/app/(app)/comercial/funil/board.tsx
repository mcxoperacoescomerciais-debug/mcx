"use client";
/**
 * Funil em kanban. No computador, arrastar e soltar; no celular (e sempre), o
 * seletor de etapa no cartão. Toda mudança passa pelo mesmo diálogo, que pede
 * o que a etapa de destino exige.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { MoveDialog, type MoveLead, type MoveTarget } from "@/components/crm/move-dialog";
import { formatMoney } from "@/lib/crm";
import { formatRelative } from "@/lib/dates";

export interface BoardLead extends MoveLead {
  number: number;
  stageId: string;
  city: string | null;
  contactName: string | null;
  ownerName: string;
}
export interface BoardStage extends MoveTarget {
  probability: number;
}

export function FunnelBoard({ leads, stages, today }: { leads: BoardLead[]; stages: BoardStage[]; today: string }) {
  const router = useRouter();
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ lead: BoardLead; target: BoardStage } | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function request(leadId: string, stageId: string) {
    const lead = leads.find((l) => l.id === leadId);
    const target = stages.find((st) => st.id === stageId);
    if (!lead || !target || lead.stageId === stageId) return;
    const from = stages.find((st) => st.id === lead.stageId);
    if (from?.kind === "won") return setNote({ ok: false, text: "Lead ganho não volta no funil." });
    setNote(null);
    setMoving({ lead, target });
  }

  return (
    <>
      {note && <p role={note.ok ? "status" : "alert"} className={clsx("mb-3 rounded-lg px-3 py-2 text-sm", note.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad")}>{note.text}</p>}
      <div className="relative -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 lg:mx-0 lg:px-0">
        {stages.map((stage) => {
          const column = leads.filter((l) => l.stageId === stage.id);
          const total = column.reduce((sum, l) => sum + (l.proposalValueCents ?? l.potentialCents ?? 0), 0);
          return (
            <section
              key={stage.id}
              aria-label={stage.name}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(stage.id);
              }}
              onDragLeave={() => setOver((o) => (o === stage.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                request(e.dataTransfer.getData("text/plain"), stage.id);
              }}
              className={clsx("w-64 shrink-0 rounded-xl border p-2", over === stage.id ? "border-brand-500 bg-brand-50" : "border-line bg-subtle")}
            >
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-ink-2">
                {stage.name} <span className="font-normal text-muted">({column.length})</span>
              </h2>
              <p className="mb-2 px-1 text-xs text-muted">{total ? `${formatMoney(total)}/mês` : " "}</p>
              <ul className="space-y-2">
                {column.map((lead) => {
                  const late = stage.kind !== "won" && stage.kind !== "lost" && !!lead.nextActionDate && lead.nextActionDate < today;
                  return (
                    <li key={lead.id} draggable={stage.kind !== "won"} onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)} className={clsx("card p-3", stage.kind !== "won" && "cursor-grab active:cursor-grabbing", late && "border-l-4 border-l-bad")}>
                      <Link href={`/comercial/leads/${lead.id}`} className="block text-sm font-semibold text-ink hover:underline">
                        {lead.company}
                      </Link>
                      <p className="mt-1 text-xs text-muted">
                        {[lead.contactName, lead.city, lead.ownerName].filter(Boolean).join(" · ")}
                      </p>
                      {lead.nextAction && (
                        <p className={clsx("mt-1.5 text-xs", late ? "font-semibold text-bad" : "text-ink-2")}>
                          {lead.nextAction} · {formatRelative(lead.nextActionDate, today)}
                        </p>
                      )}
                      {stage.kind !== "won" && (
                        <label className="mt-2 block">
                          <span className="sr-only">Etapa de {lead.company}</span>
                          <select className="field min-h-9 text-xs" value={lead.stageId} onChange={(e) => request(lead.id, e.target.value)}>
                            {stages.map((st) => (
                              <option key={st.id} value={st.id}>{st.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {moving && (
        <MoveDialog
          lead={moving.lead}
          target={moving.target}
          today={today}
          onClose={() => setMoving(null)}
          onDone={(text) => {
            setMoving(null);
            setNote({ ok: true, text });
            router.refresh();
          }}
        />
      )}
    </>
  );
}
