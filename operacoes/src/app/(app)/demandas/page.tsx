import Link from "next/link";
import { DemandCard, Empty, PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status } from "@/lib/domain";
import { requireUser } from "@/server/auth";
import { formOptions, listDemands, type DemandFilters } from "@/server/demands";

export const metadata = { title: "Lista da equipe" };

type Params = { q?: string; responsavel?: string; contratante?: string; categoria?: string; status?: string; prioridade?: string; atrasadas?: string; aguardando?: string };

export default async function ListPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const p = await searchParams;
  const options = await formOptions();
  const status = p.status === "todas" ? undefined : STATUSES.includes(p.status as Status) ? (p.status as Status) : "open";
  const filters: DemandFilters = {
    q: p.q,
    assignee: p.responsavel || undefined,
    client: p.contratante || undefined,
    category: p.categoria || undefined,
    status,
    priority: PRIORITIES.includes(p.prioridade as Priority) ? (p.prioridade as Priority) : undefined,
    overdue: p.atrasadas === "1",
    waiting: p.aguardando === "1",
  };
  const rows = await listDemands(user, filters);
  const today = todayIso();
  const filtered = Object.entries(p).some(([, v]) => v);

  return (
    <>
      <PageHeader title="Lista da equipe" subtitle={`${rows.length} ${rows.length === 1 ? "demanda" : "demandas"}`} />
      <form className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="f-q">Buscar</label>
          <input id="f-q" name="q" defaultValue={p.q ?? ""} className="field" placeholder="Título ou contratante" />
        </div>
        <div>
          <label className="label" htmlFor="f-resp">Responsável</label>
          <select id="f-resp" name="responsavel" defaultValue={p.responsavel ?? ""} className="field">
            <option value="">Todos</option>
            {options.people.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
            <option value="none">A distribuir</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-cli">Contratante</label>
          <select id="f-cli" name="contratante" defaultValue={p.contratante ?? ""} className="field">
            <option value="">Todos</option>
            {options.clients.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-cat">Categoria</label>
          <select id="f-cat" name="categoria" defaultValue={p.categoria ?? ""} className="field">
            <option value="">Todas</option>
            {options.categories.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-status">Status</label>
          <select id="f-status" name="status" defaultValue={p.status ?? ""} className="field">
            <option value="">Abertas</option>
            {STATUSES.map((x) => (
              <option key={x} value={x}>{STATUS_LABEL[x]}</option>
            ))}
            <option value="todas">Todas</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="f-pri">Prioridade</label>
          <select id="f-pri" name="prioridade" defaultValue={p.prioridade ?? ""} className="field">
            <option value="">Todas</option>
            {PRIORITIES.map((x) => (
              <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="atrasadas" value="1" defaultChecked={p.atrasadas === "1"} className="size-4" /> Atrasadas
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" name="aguardando" value="1" defaultChecked={p.aguardando === "1"} className="size-4" /> Aguardando
          </label>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn-primary">Filtrar</button>
          {filtered && <Link href="/demandas" className="btn-ghost">Limpar</Link>}
        </div>
      </form>
      {rows.length === 0 ? (
        <Empty>Nenhuma demanda com esses filtros.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <DemandCard key={d.id} d={d} today={today} />
          ))}
        </div>
      )}
    </>
  );
}
