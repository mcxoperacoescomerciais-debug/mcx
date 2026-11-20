import { DocumentList } from "@/components/docs/document-list";
import { UploadForm } from "@/components/docs/forms";
import { PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { DOCUMENT_CATEGORIES, ALWAYS_RESTRICTED } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { listDocuments } from "@/server/documents";
import { storage } from "@/server/storage";

export const metadata = { title: "Documentos" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; contratante?: string }> }) {
  const user = await requireCan("document.view");
  const { q, categoria, contratante } = await searchParams;
  const [rows, options] = await Promise.all([listDocuments(user, { q, category: categoria || undefined, clientId: contratante || undefined }), formOptions()]);
  const restricted = can(user.role, "document.restricted");
  const clients = options.clients.filter((c) => c.kind !== "internal").map((c) => ({ id: c.id, name: c.name }));
  const categories = DOCUMENT_CATEGORIES.filter((c) => restricted || !ALWAYS_RESTRICTED.includes(c));
  const ready = storage() !== null;
  return (
    <>
      <PageHeader title="Documentos" subtitle={restricted ? "Arquivos da operação, com versões. Contrato e documento de promotor são restritos a gestor e dono." : "Arquivos da operação, com versões."} />
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="dc-q">Buscar pelo título</label>
          <input id="dc-q" name="q" type="search" defaultValue={q ?? ""} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="dc-cat">Categoria</label>
          <select id="dc-cat" name="categoria" defaultValue={categoria ?? ""} className="field">
            <option value="">Todas</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="dc-cli">Contratante</label>
            <select id="dc-cli" name="contratante" defaultValue={contratante ?? ""} className="field">
              <option value="">Todos</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn-ghost">Filtrar</button>
        </div>
      </form>

      <div className="mb-6">
        <DocumentList today={todayIso()} empty="Nenhum documento neste filtro." documents={rows.map(({ d, clientName, fileName, size }) => ({ id: d.id, title: d.title, category: d.category, restricted: d.restricted, expiresOn: d.expiresOn, currentVersion: d.currentVersion, clientName, fileName, size, updatedAt: d.updatedAt }))} />
      </div>

      {can(user.role, "document.upload") && (
        <section className="card p-4" aria-labelledby="dc-new">
          <h2 id="dc-new" className="mb-3 text-sm font-bold text-ink-2">Enviar documento</h2>
          {ready ? <UploadForm clients={clients} canRestrict={restricted} /> : <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">O envio de arquivos ainda não está ligado: falta configurar o armazenamento (bucket R2 do Operações). Os cadastros de contrato funcionam normalmente.</p>}
        </section>
      )}
    </>
  );
}
