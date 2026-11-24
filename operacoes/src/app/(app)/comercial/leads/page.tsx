import Link from "next/link";
import { LeadLine } from "@/components/crm/lead-line";
import { Empty, PageHeader } from "@/components/ui";
import { LEAD_FOCUS, LEAD_TYPES } from "@/lib/crm";
import { todayIso } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { crmPeople, listLeads, listStages } from "@/server/crm";

export const metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string; etapa?: string; responsavel?: string; tipo?: string; foco?: string }> }) {
  const user = await requireCan("crm.view");
  const { q, etapa, responsavel, tipo, foco } = await searchParams;
  const [leads, stages, people] = await Promise.all([listLeads(user, { q, stage: etapa || undefined, owner: responsavel || undefined, type: tipo || undefined, focus: foco || undefined }), listStages(), crmPeople()]);
  const today = todayIso();
  return (
    <>
      <PageHeader title="Leads" subtitle={`${leads.length} ${leads.length === 1 ? "lead" : "leads"} neste filtro.`}>
        <Link href="/comercial/leads/novo" className="btn-primary">+ Lead</Link>
      </PageHeader>
      <form className="card mb-4 grid gap-3 p-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="ld-tipo">Tipo</label>
          <select id="ld-tipo" name="tipo" defaultValue={tipo ?? ""} className="field">
            <option value="">Todos</option>
            {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ld-foco">Foco</label>
          <select id="ld-foco" name="foco" defaultValue={foco ?? ""} className="field">
            <option value="">Todos</option>
            {LEAD_FOCUS.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="none">Sem foco definido</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="ld-q">Buscar por empresa ou cidade</label>
          <input id="ld-q" name="q" defaultValue={q ?? ""} className="field" type="search" />
        </div>
        <div>
          <label className="label" htmlFor="ld-stage">Etapa</label>
          <select id="ld-stage" name="etapa" defaultValue={etapa ?? ""} className="field">
            <option value="">Todas</option>
            {stages.filter((st) => st.active).map((st) => (
              <option key={st.id} value={st.id}>{st.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="label" htmlFor="ld-resp">Responsável</label>
            <select id="ld-resp" name="responsavel" defaultValue={responsavel ?? ""} className="field">
              <option value="">Todos</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-ghost">Filtrar</button>
        </div>
      </form>
      {leads.length === 0 ? (
        <Empty>Nenhum lead neste filtro. Cadastre o primeiro ou importe uma lista.</Empty>
      ) : (
        <ul className="space-y-2">
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadLine lead={lead} today={today} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
