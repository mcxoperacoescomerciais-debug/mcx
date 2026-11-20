import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteWithReason, DocumentMetaForm, UploadForm } from "@/components/docs/forms";
import { PageHeader } from "@/components/ui";
import { formatBr, formatDateTime, todayIso } from "@/lib/dates";
import { canPreview, formatBytes } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { getDocument } from "@/server/documents";
import { storage } from "@/server/storage";

export const metadata = { title: "Documento" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("document.view");
  const { id } = await params;
  const doc = await getDocument(user, id);
  if (!doc) notFound();
  const options = await formOptions();
  const manage = can(user.role, "document.manage");
  const today = todayIso();
  const expired = !!doc.expiresOn && doc.expiresOn < today;
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/documentos" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Documentos</Link>
      </p>
      <PageHeader title={doc.title} subtitle={[doc.category, doc.clientName, doc.brand, doc.promoter].filter(Boolean).join(" · ")}>
        <a href={`/api/documentos/${doc.id}`} className="btn-primary">Baixar versão atual</a>
      </PageHeader>
      <p className="mb-5 flex flex-wrap gap-2 text-xs font-semibold">
        {doc.restricted && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-warn">Restrito — só gestor e dono; cada download fica registrado</span>}
        {doc.expiresOn && <span className={expired ? "rounded-full bg-bad-bg px-2 py-0.5 text-bad" : "rounded-full bg-subtle px-2 py-0.5 text-ink-2"}>{expired ? "Venceu em" : "Vale até"} {formatBr(doc.expiresOn)}</span>}
        {doc.contractId && can(user.role, "contract.view") && <Link href={`/contratos/${doc.contractId}`} className="rounded-full bg-info-bg px-2 py-0.5 text-info underline-offset-2 hover:underline">Ver o contrato</Link>}
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="d-vers">
          <h2 id="d-vers" className="mb-3 text-sm font-bold text-ink-2">Versões</h2>
          <ul className="space-y-2 text-sm">
            {doc.versions.map(({ v, userName }) => (
              <li key={v.id} className="rounded-lg border border-line px-3 py-2">
                <p className="font-semibold text-ink">
                  Versão {v.version}
                  {v.version === doc.currentVersion && <span className="ml-2 rounded-full bg-ok-bg px-2 py-0.5 text-xs text-ok">atual</span>}
                </p>
                <p className="text-xs text-muted">{v.fileName} · {formatBytes(v.size)} · {userName} · {formatDateTime(v.createdAt)}</p>
                <p className="mt-1 flex gap-3 text-xs font-semibold">
                  <a href={`/api/documentos/${doc.id}?v=${v.version}`} className="text-brand-700 underline underline-offset-2">Baixar</a>
                  {canPreview(v.contentType) && <a href={`/api/documentos/${doc.id}?v=${v.version}&ver=1`} target="_blank" rel="noreferrer" className="text-brand-700 underline underline-offset-2">Abrir no navegador</a>}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-5">
          {can(user.role, "document.upload") && (
            <section className="card p-4" aria-labelledby="d-new">
              <h2 id="d-new" className="mb-1 text-sm font-bold text-ink-2">Enviar nova versão</h2>
              <p className="mb-3 text-xs text-muted">A versão anterior continua guardada.</p>
              {storage() ? <UploadForm documentId={doc.id} canRestrict={can(user.role, "document.restricted")} /> : <p className="text-sm text-warn">Armazenamento ainda não configurado.</p>}
            </section>
          )}
          {manage && (
            <section className="card p-4" aria-labelledby="d-meta">
              <h2 id="d-meta" className="mb-3 text-sm font-bold text-ink-2">Dados do documento</h2>
              <DocumentMetaForm clients={options.clients.filter((c) => c.kind !== "internal").map((c) => ({ id: c.id, name: c.name }))} doc={{ id: doc.id, title: doc.title, category: doc.category, clientId: doc.clientId, contractId: doc.contractId, brand: doc.brand, promoter: doc.promoter, restricted: doc.restricted, expiresOn: doc.expiresOn }} />
            </section>
          )}
          {manage && (
            <section className="card p-4">
              <DeleteWithReason kind="document" id={doc.id} label="Excluir documento" backTo="/documentos" />
            </section>
          )}
        </div>
      </div>
    </>
  );
}
