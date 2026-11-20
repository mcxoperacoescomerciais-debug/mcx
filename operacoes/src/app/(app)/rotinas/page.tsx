import { PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { describeRule } from "@/lib/routines";
import { requireCan } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { listRoutines } from "@/server/routines";
import { listTemplates } from "@/server/templates";
import { RoutineForm } from "./form";

export const metadata = { title: "Rotinas" };

export default async function RoutinesPage() {
  const user = await requireCan("routine.manage");
  const [rows, options, templates] = await Promise.all([listRoutines(user), formOptions(), listTemplates(user)]);
  const published = templates.filter((t) => t.status === "published").map((t) => ({ id: t.id, name: t.name }));
  const today = todayIso();
  return (
    <>
      <PageHeader title="Rotinas" subtitle="Demandas que nascem sozinhas na data certa, já com responsável, prazo, tipo e checklist." />
      <div className="mb-6 space-y-3">
        {rows.length === 0 && <p className="card px-4 py-8 text-center text-sm text-muted">Nenhuma rotina cadastrada ainda. Crie a primeira abaixo (ex.: fechamento mensal de um contratante).</p>}
        {rows.map(({ r, clientName, categoryName, assigneeName, generated }) => (
          <details key={r.id} className="card p-4">
            <summary className="cursor-pointer">
              <span className="font-semibold text-ink">{r.name}</span>
              {!r.active && <span className="ml-2 rounded-full bg-subtle px-2 py-0.5 text-xs font-semibold text-muted">Pausada</span>}
              <span className="mt-0.5 block text-xs text-muted">
                {clientName} · {categoryName} · {assigneeName} · {describeRule(r)} · {generated} {generated === 1 ? "demanda gerada" : "demandas geradas"}
              </span>
            </summary>
            <div className="mt-4">
              <RoutineForm options={options} templates={published} today={today} routine={{ id: r.id, name: r.name, clientId: r.clientId, categoryId: r.categoryId, typeId: r.typeId, assigneeId: r.assigneeId, priority: r.priority, frequency: r.frequency, weekdays: r.weekdays, monthDay: r.monthDay, intervalDays: r.intervalDays, startDate: r.startDate, leadDays: r.leadDays, dueOffsetDays: r.dueOffsetDays, templateId: r.templateId, active: r.active }} />
            </div>
          </details>
        ))}
      </div>
      <section className="card p-4" aria-labelledby="nova-rot">
        <h2 id="nova-rot" className="mb-3 text-sm font-bold text-ink-2">Nova rotina</h2>
        <RoutineForm options={options} templates={published} today={today} />
      </section>
    </>
  );
}
