import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { getTemplate } from "@/server/templates";
import { TemplateEditor } from "./editor";

export const metadata = { title: "Modelo de checklist" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const manage = can(user.role, "template.manage");
  const options = await formOptions();
  if (id === "novo") {
    if (!manage) redirect("/checklists");
    return (
      <>
        <PageHeader title="Novo modelo de checklist" />
        <TemplateEditor options={options} />
      </>
    );
  }
  const tpl = await getTemplate(user, id);
  if (!tpl) notFound();
  const sections = [...new Set(tpl.items.map((i) => i.section ?? ""))];
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/checklists" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Checklists</Link>
      </p>
      <PageHeader title={tpl.name} subtitle={`Versão ${tpl.version} · ${tpl.items.length} itens${tpl.doubleCheck ? " · conferência dupla" : ""}`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        {manage ? (
          <TemplateEditor
            options={options}
            template={{ id: tpl.id, name: tpl.name, clientId: tpl.clientId, categoryId: tpl.categoryId, typeId: tpl.typeId, doubleCheck: tpl.doubleCheck, status: tpl.status, items: tpl.items.map((i) => ({ section: i.section ?? "", text: i.text, quantity: i.quantity === null ? "" : String(i.quantity), unit: i.unit ?? "", perAction: i.perAction, required: i.required, note: i.note ?? "", toValidate: i.toValidate })) }}
          />
        ) : (
          <section className="card p-4">
            {sections.map((section) => (
              <div key={section || "x"} className="mb-3">
                {section && <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-2">{section}</h2>}
                <ul className="space-y-1 text-sm text-ink-2">
                  {tpl.items.filter((i) => (i.section ?? "") === section).map((i) => (
                    <li key={i.id}>
                      {i.quantity !== null && <strong>{i.quantity}{i.unit ? ` ${i.unit}` : ""}{i.perAction ? " por ação" : ""} · </strong>}
                      {i.text}
                      {i.required && <span className="ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">Obrigatório</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}
        <aside className="space-y-5">
          <section className="card p-4" aria-labelledby="t-usos">
            <h2 id="t-usos" className="mb-2 text-sm font-bold text-ink-2">Histórico de uso ({tpl.uses.length})</h2>
            {tpl.uses.length === 0 ? <p className="text-sm text-muted">Ainda não foi usado.</p> : (
              <ul className="space-y-2 text-sm">
                {tpl.uses.map((u) => (
                  <li key={u.id}>
                    <Link href={`/demandas/${u.id}`} className="text-ink-2 underline-offset-2 hover:underline">#{u.number} {u.title}</Link>
                    <p className="text-xs text-muted">{formatDateTime(u.createdAt)} · {u.assigneeName ?? "A distribuir"} · versão {u.version}{u.actions && u.actions > 1 ? ` · ${u.actions} ações` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-4" aria-labelledby="t-faltou">
            <h2 id="t-faltou" className="mb-2 text-sm font-bold text-ink-2">Faltou algo ({tpl.misses.length})</h2>
            {tpl.misses.length === 0 ? <p className="text-sm text-muted">Nenhuma ocorrência.</p> : (
              <ul className="space-y-2 text-sm">
                {tpl.misses.map((m) => (
                  <li key={m.id} className="text-ink-2">
                    <strong>{m.item}</strong>{m.quantity && ` · ${m.quantity}`}
                    <p className="text-xs text-muted">{formatDateTime(m.createdAt)}{m.impact && ` — ${m.impact}`}{m.addedToTemplate && " · já entrou no modelo"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
