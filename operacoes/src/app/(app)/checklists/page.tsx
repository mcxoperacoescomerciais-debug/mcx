import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { listTemplates } from "@/server/templates";

export const metadata = { title: "Checklists" };

const STATUS = { draft: "Rascunho", published: "Publicado", archived: "Arquivado" } as const;
const STYLE = { draft: "bg-warn-bg text-warn", published: "bg-ok-bg text-ok", archived: "bg-subtle text-muted" } as const;

export default async function TemplatesPage() {
  const user = await requireUser();
  const templates = await listTemplates(user);
  const manage = can(user.role, "template.manage");
  return (
    <>
      <PageHeader title="Checklists" subtitle="Listas prontas para tarefas que se repetem. Aplique um modelo dentro da demanda.">
        {manage && <Link href="/checklists/novo" className="btn-primary">Novo modelo</Link>}
      </PageHeader>
      {templates.length === 0 ? (
        <p className="card px-4 py-8 text-center text-sm text-muted">Nenhum modelo publicado ainda.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/checklists/${t.id}`} className="card block h-full p-4 hover:border-brand-500">
                <p className="font-semibold text-ink">{t.name}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${STYLE[t.status]}`}>{STATUS[t.status]}</span>
                  <span>{t.clientName ?? "Geral MCX"}</span>
                  <span>· {t.items} itens · versão {t.version}</span>
                  {t.doubleCheck && <span>· conferência dupla</span>}
                </p>
                <p className="mt-1 text-xs text-ink-2">Usado {t.uses}× {t.misses > 0 && <span className="font-semibold text-warn">· faltou algo {t.misses}×</span>}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {manage && <p className="mt-5 text-sm text-muted">Modelos em rascunho trazem itens sugeridos marcados “a validar”. Revise, confirme cada item e publique para a equipe poder usar.</p>}
    </>
  );
}
