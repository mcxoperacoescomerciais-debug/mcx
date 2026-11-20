import Link from "next/link";
import clsx from "clsx";
import { formatMoney } from "@/lib/crm";
import { formatRelative } from "@/lib/dates";

export interface LineLead {
  id: string;
  number: number;
  company: string;
  city: string | null;
  contactName: string | null;
  stageName: string;
  stageKind: string;
  nextAction: string | null;
  nextActionDate: string | null;
  potentialCents: number | null;
  proposalValueCents: number | null;
  proposalValidUntil: string | null;
  ownerName: string;
}

/** Linha de lead usada em "Comercial hoje" e na lista. */
export function LeadLine({ lead, today, showProposal = false }: { lead: LineLead; today: string; showProposal?: boolean }) {
  const late = !!lead.nextActionDate && lead.nextActionDate < today && (lead.stageKind === "open" || lead.stageKind === "nurture");
  const value = lead.proposalValueCents ?? lead.potentialCents;
  return (
    <Link href={`/comercial/leads/${lead.id}`} className="card block px-4 py-3 transition-colors hover:border-brand-500">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 font-semibold text-ink">
          <span className="mr-1.5 font-normal text-muted">#{lead.number}</span>
          {lead.company}
        </p>
        {lead.nextActionDate && <span className={clsx("shrink-0 text-sm font-semibold", late ? "text-bad" : "text-ink-2")}>{late ? `Vencido · ${formatRelative(lead.nextActionDate, today)}` : formatRelative(lead.nextActionDate, today)}</span>}
      </div>
      {lead.nextAction && <p className="mt-1 text-sm text-ink-2">{lead.nextAction}</p>}
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="rounded-full border border-line-strong bg-subtle px-2 py-0.5 font-semibold text-ink-2">{lead.stageName}</span>
        {lead.contactName && <span>{lead.contactName}</span>}
        {lead.city && <span>· {lead.city}</span>}
        {!!value && <span>· {formatMoney(value)}/mês</span>}
        <span>· {lead.ownerName}</span>
        {showProposal && lead.proposalValidUntil && <span className="font-semibold text-warn">· proposta vence {formatRelative(lead.proposalValidUntil, today).toLowerCase()}</span>}
      </p>
    </Link>
  );
}
