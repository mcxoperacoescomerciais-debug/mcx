import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentList } from "@/components/docs/document-list";
import { AmendmentForm, ContractForm, DeleteWithReason, UploadForm } from "@/components/docs/forms";
import { PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/crm";
import { formatBr, todayIso } from "@/lib/dates";
import { CONTRACT_STATUS_LABEL } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { getContract } from "@/server/contracts";
import { listDocuments } from "@/server/documents";
import { storage } from "@/server/storage";

export const metadata = { title: "Contrato" };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("contract.view");
  const { id } = await params;
  const contract = await getContract(user, id);
  if (!contract) notFound();
  const documents = await listDocuments(user, { contractId: id });
  const manage = can(user.role, "contract.manage");
  const today = todayIso();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/contratos" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Contratos</Link>
      </p>
      <PageHeader title={`Contrato — ${contract.clientName}`} subtitle={`${CONTRACT_STATUS_LABEL[contract.status]} · ${formatMoney(contract.monthlyValueCents)} por mês${contract.startDate ? ` · de ${formatBr(contract.startDate)} a ${formatBr(contract.endDate)}` : ""}`}>
        <Link href={`/contratantes/${contract.clientId}`} className="btn-ghost">Ver o contratante</Link>
      </PageHeader>
      {contract.status === "draft" && <p className="mb-5 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">Rascunho: confira serviços, valor, início e vigência, e mude o status para “Vigente”. Só contrato vigente entra nos avisos de vencimento e no relatório Horas × Receita.</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <section className="card p-4" aria-labelledby="c-dados">
            <h2 id="c-dados" className="mb-3 text-sm font-bold text-ink-2">Dados do contrato</h2>
            {manage ? <ContractForm key={`${contract.status}-${contract.monthlyValueCents}-${contract.endDate}`} clients={[]} contract={{ id: contract.id, clientId: contract.clientId, services: contract.services, monthlyValueCents: contract.monthlyValueCents, dueDay: contract.dueDay, startDate: contract.startDate, termMonths: contract.termMonths, autoRenew: contract.autoRenew, status: contract.status, notes: contract.notes }} /> : <p className="text-sm text-ink-2">{contract.services}</p>}
          </section>
          {manage && (
            <section className="card p-4">
              <DeleteWithReason kind="contract" id={contract.id} label="Excluir contrato" backTo="/contratos" />
            </section>
          )}
        </div>

        <div className="space-y-5">
          <section className="card p-4" aria-labelledby="c-adit">
            <h2 id="c-adit" className="mb-3 text-sm font-bold text-ink-2">Aditivos</h2>
            {contract.amendments.length === 0 ? (
              <p className="mb-3 text-sm text-muted">Nenhum aditivo registrado.</p>
            ) : (
              <ul className="mb-4 space-y-2 text-sm">
                {contract.amendments.map(({ a, userName }) => (
                  <li key={a.id} className="rounded-lg border border-line px-3 py-2">
                    <p className="font-semibold text-ink">{formatBr(a.day)} — {a.description}</p>
                    <p className="text-xs text-muted">
                      Valor: {formatMoney(a.previousValueCents)} → {formatMoney(a.newValueCents)}
                      {a.newEndDate !== a.previousEndDate && ` · fim da vigência: ${formatBr(a.previousEndDate)} → ${formatBr(a.newEndDate)}`} · {userName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {manage && contract.status === "active" && <AmendmentForm key={`${contract.monthlyValueCents}-${contract.endDate}`} contractId={contract.id} today={today} valueCents={contract.monthlyValueCents} endDate={contract.endDate} />}
            {manage && contract.status !== "active" && <p className="text-xs text-muted">Aditivo só em contrato vigente.</p>}
          </section>

          <section aria-labelledby="c-docs">
            <h2 id="c-docs" className="mb-2 text-sm font-bold text-ink-2">Arquivos do contrato</h2>
            <DocumentList today={today} empty="Nenhum arquivo anexado a este contrato." documents={documents.map(({ d, clientName, fileName, size }) => ({ id: d.id, title: d.title, category: d.category, restricted: d.restricted, expiresOn: d.expiresOn, currentVersion: d.currentVersion, clientName, fileName, size, updatedAt: d.updatedAt }))} />
            {manage && (
              <div className="card mt-3 p-4">
                <h3 className="mb-3 text-sm font-bold text-ink-2">Anexar arquivo</h3>
                {storage() ? <UploadForm fixed={{ contractId: contract.id }} canRestrict defaultCategory="Contrato" /> : <p className="text-sm text-warn">O envio de arquivos ainda não está ligado: falta configurar o armazenamento (bucket R2 do Operações).</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
