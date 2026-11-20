import Link from "next/link";
import { DemandCard, Empty, PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { buildQueue, QUEUE_LABEL } from "@/lib/queue";
import { requireUser } from "@/server/auth";
import { formOptions, listDemands } from "@/server/demands";

export const metadata = { title: "Minha fila" };

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ pessoa?: string }> }) {
  const user = await requireUser();
  const { pessoa } = await searchParams;
  const manager = can(user.role, "demand.viewAll");
  const { people } = await formOptions();
  // Só o gestor olha a fila de outra pessoa.
  const target = manager && pessoa && people.some((p) => p.id === pessoa) ? pessoa : user.id;
  const today = todayIso();
  const [mine, unassigned] = await Promise.all([
    listDemands(user, { assignee: target, status: "open" }),
    manager ? listDemands(user, { assignee: "none", status: "open" }) : Promise.resolve([]),
  ]);
  const groups = buildQueue(mine, today);
  const targetName = people.find((p) => p.id === target)?.name ?? "";

  return (
    <>
      <PageHeader title={target === user.id ? "Minha fila" : `Fila de ${targetName}`} subtitle={`${mine.length} ${mine.length === 1 ? "demanda aberta" : "demandas abertas"}`}>
        {manager && (
          <nav aria-label="Fila de" className="flex flex-wrap gap-2">
            {people.map((p) => (
              <Link key={p.id} href={p.id === user.id ? "/" : `/?pessoa=${p.id}`} aria-current={p.id === target ? "page" : undefined} className={`chip ${p.id === target ? "chip-on" : ""}`}>
                {p.id === user.id ? "Eu" : p.name}
              </Link>
            ))}
          </nav>
        )}
      </PageHeader>

      {unassigned.length > 0 && (
        <section className="mb-6" aria-labelledby="g-distribuir">
          <h2 id="g-distribuir" className="mb-2 text-sm font-bold uppercase tracking-wide text-warn">A distribuir ({unassigned.length})</h2>
          <div className="space-y-2">
            {unassigned.map((d) => (
              <DemandCard key={d.id} d={d} today={today} />
            ))}
          </div>
        </section>
      )}

      {groups.length === 0 ? (
        <Empty>Nada na fila. Use o botão “+ Demanda” para registrar o que chegar.</Empty>
      ) : (
        groups.map((g) => (
          <section key={g.group} className="mb-6" aria-labelledby={`g-${g.group}`}>
            <h2 id={`g-${g.group}`} className={`mb-2 text-sm font-bold uppercase tracking-wide ${g.group === "overdue" ? "text-bad" : g.group === "followup" ? "text-wait" : "text-ink-2"}`}>
              {QUEUE_LABEL[g.group]} ({g.items.length})
            </h2>
            <div className="space-y-2">
              {g.items.map((d) => (
                <DemandCard key={d.id} d={d} today={today} showAssignee={false} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
