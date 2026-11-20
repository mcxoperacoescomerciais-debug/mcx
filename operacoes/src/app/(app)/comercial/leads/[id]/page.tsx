import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadForm } from "@/components/crm/lead-form";
import { PageHeader } from "@/components/ui";
import { INTERACTION_KIND_LABEL, OUTCOME_LABEL, cadence, formatMoney, type InteractionKind, type Outcome } from "@/lib/crm";
import { formatBr, formatDateTime, formatRelative, todayIso } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { crmPeople, expansionClients, getLead, listMessageTemplates, renderForLead } from "@/server/crm";
import { ContactsPanel, DeleteLead, InteractionForm, NextActionForm, StageMover, WhatsappPanel } from "./panels";

export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("crm.view");
  const { id } = await params;
  const lead = await getLead(user, id);
  if (!lead) notFound();
  const [people, clients, templates] = await Promise.all([crmPeople(), expansionClients(), listMessageTemplates(user)]);
  const today = todayIso();
  const open = lead.stage.kind === "open" || lead.stage.kind === "nurture";
  const suggest = lead.respondedAt ? { nextAction: lead.nextAction ?? "", nextActionDate: lead.nextActionDate && lead.nextActionDate > today ? lead.nextActionDate : cadence(1, today).nextActionDate, suggestClose: false } : cadence(lead.unanswered + 1, today);
  const late = open && !!lead.nextActionDate && lead.nextActionDate < today;
  const value = lead.proposalValueCents ?? lead.potentialCents;
  const stageName = (stageId: string | null) => lead.stages.find((st) => st.id === stageId)?.name ?? "—";
  const moveLead = { id: lead.id, company: lead.company, nextAction: lead.nextAction, nextActionDate: lead.nextActionDate, potentialCents: lead.potentialCents, proposalValueCents: lead.proposalValueCents };

  return (
    <>
      <PageHeader title={lead.company} subtitle={`Lead #${lead.number} · ${lead.type}${lead.city ? ` · ${lead.city}` : ""} · ${lead.ownerName}`}>
        <Link href="/comercial/funil" className="btn-ghost">Ver no funil</Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card space-y-4 p-4" aria-label="Etapa e próxima ação">
            <div className="grid gap-3 sm:grid-cols-2">
              <StageMover lead={moveLead} stages={lead.stages.filter((st) => st.active).map((st) => ({ id: st.id, name: st.name, kind: st.kind, key: st.key }))} stageId={lead.stageId} today={today} locked={lead.stage.kind === "won"} />
              <dl className="text-sm">
                <dt className="label">Valor mensal</dt>
                <dd className="font-semibold text-ink">
                  {formatMoney(value)}
                  {lead.proposalValueCents ? " (proposta)" : lead.potentialManual ? " (informado)" : " (potencial pela tabela)"}
                </dd>
                {lead.proposalValidUntil && lead.stage.key === "proposal" && (
                  <dd className="mt-1 text-xs text-muted">
                    Proposta de {formatBr(lead.proposalDate)} · vence {formatRelative(lead.proposalValidUntil, today).toLowerCase()}
                  </dd>
                )}
              </dl>
            </div>
            {lead.stage.kind === "lost" && (
              <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">
                Perdido: {lead.lossReason}
                {lead.lossNote ? ` — ${lead.lossNote}` : ""}
              </p>
            )}
            {lead.stage.kind === "won" && (
              <p className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
                Ganho.{" "}
                {lead.wonClientId && <Link href={`/contratantes/${lead.wonClientId}`} className="font-semibold underline underline-offset-2">Abrir o contratante</Link>}
                {lead.wonDemandId && (
                  <>
                    {" · "}
                    <Link href={`/demandas/${lead.wonDemandId}`} className="font-semibold underline underline-offset-2">Abrir a demanda de implantação</Link>
                  </>
                )}
              </p>
            )}
            {open && (
              <>
                {late && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">Follow-up vencido: {formatRelative(lead.nextActionDate, today)}.</p>}
                <NextActionForm key={`${lead.nextAction}-${lead.nextActionDate}`} leadId={lead.id} nextAction={lead.nextAction} nextActionDate={lead.nextActionDate} />
              </>
            )}
          </section>

          {lead.stage.kind !== "won" && lead.stage.kind !== "lost" && (
            <section className="card p-4" aria-labelledby="ld-wa">
              <h2 id="ld-wa" className="mb-3 text-sm font-bold text-ink-2">Mensagem pronta no WhatsApp</h2>
              <WhatsappPanel
                key={`wa-${lead.interactions.length}-${lead.stageId}`}
                leadId={lead.id}
                open={open}
                suggest={suggest}
                contacts={lead.contacts.map((c) => ({ id: c.id, name: c.name, hasWhatsapp: !!c.whatsappDigits, optOut: c.optOut }))}
                templates={templates.map(({ t, stageName: name }) => ({
                  id: t.id,
                  name: t.name,
                  stageName: name,
                  draft: t.status !== "approved",
                  forStage: t.stageId === lead.stageId,
                  texts: Object.fromEntries(lead.contacts.map((c) => [c.id, renderForLead(t.body, lead, c.name)])),
                }))}
              />
            </section>
          )}

          <section className="card p-4" aria-labelledby="ld-int">
            <h2 id="ld-int" className="mb-3 text-sm font-bold text-ink-2">Registrar interação</h2>
            <InteractionForm key={`in-${lead.interactions.length}-${lead.stageId}`} leadId={lead.id} open={open} suggest={suggest} />
          </section>

          <section className="card p-4" aria-labelledby="ld-hist">
            <h2 id="ld-hist" className="mb-3 text-sm font-bold text-ink-2">Histórico</h2>
            {lead.interactions.length === 0 && lead.history.length <= 1 && <p className="text-sm text-muted">Nenhuma interação registrada ainda.</p>}
            <ul className="space-y-2 text-sm">
              {lead.interactions.map(({ i, userName }) => (
                <li key={i.id} className="rounded-lg border border-line px-3 py-2">
                  <p className="text-ink">{i.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {INTERACTION_KIND_LABEL[i.kind as InteractionKind] ?? i.kind} · {OUTCOME_LABEL[i.outcome as Outcome] ?? i.outcome} · {userName} · {formatDateTime(i.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            <h3 className="mb-1 mt-4 text-xs font-bold uppercase tracking-wide text-muted">Etapas</h3>
            <ul className="space-y-1 text-xs text-muted">
              {lead.history.map(({ h, userName }) => (
                <li key={h.id}>
                  {formatDateTime(h.createdAt)} · {h.fromStageId ? `${stageName(h.fromStageId)} → ` : "Entrou em "}
                  <span className="font-semibold text-ink-2">{stageName(h.toStageId)}</span>
                  {userName ? ` · ${userName}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-4" aria-labelledby="ld-contacts">
            <h2 id="ld-contacts" className="mb-3 text-sm font-bold text-ink-2">Contatos</h2>
            <ContactsPanel leadId={lead.id} contacts={lead.contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, whatsapp: c.whatsapp, email: c.email, isPrimary: c.isPrimary, optOut: c.optOut }))} />
          </section>
          <section className="card p-4">
            <DeleteLead leadId={lead.id} />
          </section>
        </div>
      </div>

      <details className="card mt-4 p-4">
        <summary className="cursor-pointer text-sm font-bold text-ink-2">Dados do lead (empresa, origem, produtos e porte)</summary>
        <div className="mt-4">
          <LeadForm
            lead={{ id: lead.id, company: lead.company, type: lead.type, city: lead.city, region: lead.region, source: lead.source, referredBy: lead.referredBy, dataSource: lead.dataSource, products: lead.products, promoters: lead.promoters, actionsPerMonth: lead.actionsPerMonth, potentialCents: lead.potentialCents, potentialManual: lead.potentialManual, clientId: lead.clientId, ownerId: lead.ownerId, tags: lead.tags, notes: lead.notes, nextAction: lead.nextAction, nextActionDate: lead.nextActionDate }}
            people={people}
            clients={clients}
            userId={user.id}
            today={today}
            needsNext={open}
          />
        </div>
      </details>
    </>
  );
}
