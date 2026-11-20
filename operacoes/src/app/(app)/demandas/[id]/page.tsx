import Link from "next/link";
import { notFound } from "next/navigation";
import { PriorityBadge, StatusBadge } from "@/components/ui";
import { formatBr, formatDateTime, todayIso } from "@/lib/dates";
import { HISTORY_FIELD_LABEL, ORIGIN_LABEL } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { isOverdue } from "@/lib/queue";
import { requireUser } from "@/server/auth";
import { formOptions, getDemand } from "@/server/demands";
import { Checklist, Comments, DeleteDemand, EditDemand, Shares, StatusControl } from "./controls";

export const metadata = { title: "Demanda" };

export default async function DemandPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const d = await getDemand(user, id);
  if (!d) notFound();
  const options = await formOptions();
  const today = todayIso();
  const manager = can(user.role, "demand.viewAll");
  const late = isOverdue(d, today);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/demandas" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Lista da equipe</Link>
      </p>
      <header className="mb-5">
        <p className="text-sm text-muted">#{d.number} · {d.clientName} · {d.categoryName}</p>
        <h1 className="text-2xl font-bold text-brand-900">{d.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={d.status} />
          <PriorityBadge priority={d.priority} />
          <span className={late ? "font-semibold text-bad" : "text-ink-2"}>{late ? "Atrasada · prazo " : "Prazo: "}{formatBr(d.dueDate)}</span>
          <span className="text-muted">· Responsável: <strong className={d.assigneeName ? "text-ink-2" : "text-warn"}>{d.assigneeName ?? "A distribuir"}</strong></span>
        </div>
        {d.status === "waiting" && (
          <p className="mt-2 rounded-lg bg-wait-bg px-3 py-2 text-sm text-wait">Aguardando retorno de <strong>{d.waitingFor}</strong> · cobrar em {formatBr(d.followUpDate)}</p>
        )}
        {d.status === "done" && d.completedAt && (
          <p className="mt-2 rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">Concluída por {d.completedByName} em {formatDateTime(d.completedAt)}</p>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="card p-4" aria-labelledby="s-status">
            <h2 id="s-status" className="mb-3 text-sm font-bold text-ink-2">Status</h2>
            <StatusControl id={d.id} status={d.status} waitingFor={d.waitingFor} followUpDate={d.followUpDate} today={today} canReopen={can(user.role, "demand.reopen")} />
          </section>

          <section className="card p-4" aria-labelledby="s-dados">
            <h2 id="s-dados" className="mb-3 text-sm font-bold text-ink-2">Dados da demanda</h2>
            <EditDemand
              today={today}
              options={options}
              canAssign={can(user.role, "demand.assign")}
              demand={{ id: d.id, title: d.title, clientId: d.clientId, categoryId: d.categoryId, assigneeId: d.assigneeId, priority: d.priority, dueDate: d.dueDate, description: d.description, brand: d.brand, store: d.store, promoter: d.promoter, origin: d.origin, estimateMinutes: d.estimateMinutes }}
            />
          </section>

          <section className="card p-4" aria-labelledby="s-check">
            <h2 id="s-check" className="mb-3 text-sm font-bold text-ink-2">Checklist</h2>
            <Checklist id={d.id} items={d.checklist.map((c) => ({ id: c.id, text: c.text, checked: c.checked, by: c.checkedByName }))} />
          </section>

          <section className="card p-4" aria-labelledby="s-coment">
            <h2 id="s-coment" className="mb-3 text-sm font-bold text-ink-2">Comentários</h2>
            <ul className="mb-3 space-y-3">
              {d.comments.length === 0 && <li className="text-sm text-muted">Nenhum comentário ainda.</li>}
              {d.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-subtle px-3 py-2">
                  <p className="text-xs text-muted"><strong className="text-ink-2">{c.userName}</strong> · {formatDateTime(c.createdAt)}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{c.body}</p>
                </li>
              ))}
            </ul>
            <Comments id={d.id} />
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-4 text-sm" aria-labelledby="s-info">
            <h2 id="s-info" className="mb-2 text-sm font-bold text-ink-2">Registro</h2>
            <dl className="space-y-1 text-ink-2">
              <div><dt className="inline text-muted">Criada por: </dt><dd className="inline">{d.createdByName} em {formatDateTime(d.createdAt)}</dd></div>
              <div><dt className="inline text-muted">Origem: </dt><dd className="inline">{ORIGIN_LABEL[d.origin]}</dd></div>
            </dl>
          </section>

          {manager && (
            <section className="card p-4" aria-labelledby="s-share">
              <h2 id="s-share" className="mb-2 text-sm font-bold text-ink-2">Compartilhada com</h2>
              <Shares id={d.id} people={options.people.filter((p) => p.id !== d.assigneeId)} shared={d.sharedWith} />
            </section>
          )}

          <section className="card p-4" aria-labelledby="s-hist">
            <h2 id="s-hist" className="mb-2 text-sm font-bold text-ink-2">Histórico</h2>
            <ol className="space-y-2 text-sm">
              {d.history.map((h) => (
                <li key={h.id}>
                  <p className="text-ink-2">
                    {h.field === "created" ? "Demanda criada" : <><strong>{HISTORY_FIELD_LABEL[h.field] ?? h.field}:</strong> {h.fromValue ?? "—"} → {h.toValue ?? "—"}</>}
                  </p>
                  <p className="text-xs text-muted">{h.userName} · {formatDateTime(h.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>

          {can(user.role, "demand.delete") && <DeleteDemand id={d.id} />}
        </aside>
      </div>
    </>
  );
}
