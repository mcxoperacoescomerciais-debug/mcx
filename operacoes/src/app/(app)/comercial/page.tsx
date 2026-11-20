import Link from "next/link";
import { LeadLine, type LineLead } from "@/components/crm/lead-line";
import { PageHeader } from "@/components/ui";
import { requireCan } from "@/server/auth";
import { commercialToday, crmPeople } from "@/server/crm";

export const metadata = { title: "Comercial hoje" };

function Group({ title, hint, leads, today, showProposal }: { title: string; hint: string; leads: LineLead[]; today: string; showProposal?: boolean }) {
  return (
    <section className="mb-6" aria-label={title}>
      <h2 className="mb-2 text-sm font-bold text-ink-2">
        {title} <span className="font-normal text-muted">({leads.length})</span>
      </h2>
      {leads.length === 0 ? (
        <p className="card px-4 py-4 text-sm text-muted">{hint}</p>
      ) : (
        <ul className="space-y-2">
          {leads.map((lead) => (
            <li key={lead.id}>
              <LeadLine lead={lead} today={today} showProposal={showProposal} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function CommercialTodayPage({ searchParams }: { searchParams: Promise<{ responsavel?: string }> }) {
  const user = await requireCan("crm.view");
  const { responsavel } = await searchParams;
  const owner = responsavel === "todos" ? undefined : responsavel || user.id;
  const [data, people] = await Promise.all([commercialToday(user, owner), crmPeople()]);
  const done = Math.min(data.contactsToday, data.goal);
  const percent = Math.round((done / data.goal) * 100);
  return (
    <>
      <PageHeader title="Comercial hoje" subtitle="Quem precisa de contato hoje. Abra o lead para pegar a mensagem pronta.">
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="ch-resp">Responsável</label>
              <select id="ch-resp" name="responsavel" defaultValue={responsavel ?? user.id} className="field">
                <option value="todos">Todos</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <button className="btn-ghost">Filtrar</button>
          </form>
          <Link href="/comercial/leads/novo" className="btn-primary">+ Lead</Link>
        </div>
      </PageHeader>

      <section className="card mb-6 p-4" aria-label="Meta de novos contatos">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink-2">Novos contatos hoje</h2>
          <p className="text-lg font-bold text-brand-900">
            {data.contactsToday} de {data.goal}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={data.goal} aria-label="Meta de novos contatos do dia">
          <div className={data.contactsToday >= data.goal ? "h-full bg-ok" : "h-full bg-brand-600"} style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">{data.contactsToday >= data.goal ? "Meta do dia batida." : `Faltam ${data.goal - data.contactsToday}. Conta o lead que recebeu o primeiro contato hoje.`}</p>
      </section>

      <Group title="Follow-ups vencidos" hint="Nenhum follow-up vencido." leads={data.overdue} today={data.today} />
      <Group title="Follow-ups de hoje" hint="Nenhum follow-up marcado para hoje." leads={data.dueToday} today={data.today} />
      <Group title="Propostas perto de vencer" hint="Nenhuma proposta vencendo nos próximos 3 dias." leads={data.proposal} today={data.today} showProposal />
      {data.contactsToday < data.goal && <Group title="Para bater a meta: próximos da lista" hint="Não há outros leads em “A prospectar”. Cadastre ou importe uma lista." leads={data.toProspect} today={data.today} />}
    </>
  );
}
