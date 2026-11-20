import { PageHeader } from "@/components/ui";
import { addDays, todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { formOptions, listDemands } from "@/server/demands";
import { Board } from "./board";

export const metadata = { title: "Kanban" };

export default async function KanbanPage({ searchParams }: { searchParams: Promise<{ responsavel?: string }> }) {
  const user = await requireUser();
  const { responsavel } = await searchParams;
  const { people } = await formOptions();
  const today = todayIso();
  const [open, done] = await Promise.all([
    listDemands(user, { status: "open", assignee: responsavel || undefined }),
    listDemands(user, { status: "done", assignee: responsavel || undefined }),
  ]);
  // Concluídas: só as dos últimos 7 dias, para a coluna não crescer sem fim.
  const weekAgo = addDays(today, -7);
  const recent = done.filter((d) => d.completedAt && todayIso(d.completedAt) >= weekAgo);

  return (
    <>
      <PageHeader title="Kanban" subtitle="Arraste o cartão ou troque o status no próprio cartão. Concluídas: últimos 7 dias.">
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="k-resp">Responsável</label>
            <select id="k-resp" name="responsavel" defaultValue={responsavel ?? ""} className="field">
              <option value="">Todos</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-ghost">Filtrar</button>
        </form>
      </PageHeader>
      <Board demands={[...open, ...recent]} today={today} canReopen={can(user.role, "demand.reopen")} />
    </>
  );
}
