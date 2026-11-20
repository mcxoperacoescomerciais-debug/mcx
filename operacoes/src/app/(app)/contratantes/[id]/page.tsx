import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentList } from "@/components/docs/document-list";
import { ProfileForm } from "@/components/docs/forms";
import { DemandCard, PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/crm";
import { CONTRACT_STATUS_LABEL, PROFILE_SECTIONS } from "@/lib/documents";
import { formatBr } from "@/lib/dates";
import { listContracts } from "@/server/contracts";
import { listDocuments } from "@/server/documents";
import { todayIso } from "@/lib/dates";
import { CLIENT_KIND_LABEL } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { listDemands } from "@/server/demands";
import { getClient } from "@/server/registry";
import { Brands, ClientForm, Contacts } from "../forms";

export const metadata = { title: "Contratante" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("client.view");
  const { id } = await params;
  const client = await getClient(user, id);
  if (!client) notFound();
  const editable = can(user.role, "client.edit") && client.kind !== "internal";
  const [open, contracts, documents] = await Promise.all([listDemands(user, { client: id, status: "open" }), listContracts(user, id), can(user.role, "document.view") ? listDocuments(user, { clientId: id }) : []]);
  const profile = client.operationalProfile ?? {};
  const filled = PROFILE_SECTIONS.filter((sec) => profile[sec.key]);
  const today = todayIso();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/contratantes" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Contratantes</Link>
      </p>
      <PageHeader title={client.name} subtitle={`${CLIENT_KIND_LABEL[client.kind]}${client.status === "inactive" ? " · inativo" : ""}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {editable ? (
            <section className="card p-4" aria-labelledby="c-dados">
              <h2 id="c-dados" className="mb-3 text-sm font-bold text-ink-2">Cadastro</h2>
              <ClientForm showValue={can(user.role, "cost.view")} client={{ id: client.id, name: client.name, kind: client.kind, document: client.document, status: client.status, notes: client.notes, monthlyValueCents: client.monthlyValueCents }} />
            </section>
          ) : (
            client.notes && <p className="card p-4 text-sm text-ink-2">{client.notes}</p>
          )}
          <section className="card p-4" aria-labelledby="c-marcas">
            <h2 id="c-marcas" className="mb-3 text-sm font-bold text-ink-2">Marcas atendidas</h2>
            <Brands clientId={client.id} brands={client.brands.map((b) => ({ id: b.id, name: b.name }))} editable={editable} />
          </section>
          <section className="card p-4" aria-labelledby="c-contatos">
            <h2 id="c-contatos" className="mb-3 text-sm font-bold text-ink-2">Contatos</h2>
            <Contacts clientId={client.id} contacts={client.contacts} editable={editable} />
          </section>
          {client.kind !== "internal" && (
            <section className="card p-4" aria-labelledby="c-ficha">
              <h2 id="c-ficha" className="mb-3 text-sm font-bold text-ink-2">Ficha operacional</h2>
              {editable ? (
                <ProfileForm clientId={client.id} profile={profile} />
              ) : filled.length === 0 ? (
                <p className="text-sm text-muted">Ficha ainda não preenchida.</p>
              ) : (
                <dl className="space-y-3 text-sm">
                  {filled.map((sec) => (
                    <div key={sec.key}>
                      <dt className="label">{sec.label}</dt>
                      <dd className="whitespace-pre-wrap text-ink-2">{profile[sec.key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>
          )}
        </div>
        <section aria-labelledby="c-dem">
          <h2 id="c-dem" className="mb-2 text-sm font-bold text-ink-2">Demandas abertas ({open.length})</h2>
          <div className="space-y-2">
            {open.length === 0 && <p className="card px-4 py-6 text-center text-sm text-muted">Nenhuma demanda aberta.</p>}
            {open.map((d) => (
              <DemandCard key={d.id} d={d} today={today} />
            ))}
          </div>
          {can(user.role, "contract.view") && client.kind !== "internal" && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-bold text-ink-2">Contratos ({contracts.length})</h2>
              <div className="space-y-2">
                {contracts.length === 0 && <p className="card px-4 py-4 text-sm text-muted">Nenhum contrato cadastrado. <Link href="/contratos" className="font-semibold text-brand-600 underline underline-offset-2">Cadastrar</Link></p>}
                {contracts.map(({ c }) => (
                  <Link key={c.id} href={`/contratos/${c.id}`} className="card block px-4 py-3 text-sm hover:border-brand-500">
                    <span className="font-semibold text-ink">{c.services}</span>
                    <span className="mt-0.5 block text-xs text-muted">{CONTRACT_STATUS_LABEL[c.status]} · {formatMoney(c.monthlyValueCents)}/mês{c.endDate ? ` · até ${formatBr(c.endDate)}` : ""}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
          {can(user.role, "document.view") && client.kind !== "internal" && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-bold text-ink-2">Documentos ({documents.length})</h2>
              <DocumentList today={today} empty="Nenhum documento deste contratante." documents={documents.map(({ d, clientName, fileName, size }) => ({ id: d.id, title: d.title, category: d.category, restricted: d.restricted, expiresOn: d.expiresOn, currentVersion: d.currentVersion, clientName, fileName, size, updatedAt: d.updatedAt }))} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
