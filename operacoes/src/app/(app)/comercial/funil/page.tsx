import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { addDays, todayIso } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { crmPeople, listLeads, listStages } from "@/server/crm";
import { FunnelBoard } from "./board";

export const metadata = { title: "Funil" };

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ responsavel?: string }> }) {
  const user = await requireCan("crm.view");
  const { responsavel } = await searchParams;
  const [all, stages, people] = await Promise.all([listLeads(user, { owner: responsavel || undefined }), listStages(), crmPeople()]);
  const today = todayIso();
  // Ganhos e perdidos: só os dos últimos 30 dias, para as colunas não crescerem sem fim.
  const since = addDays(today, -30);
  const leads = all.filter((l) => {
    const closed = l.wonAt ?? l.lostAt;
    return l.stageKind === "open" || l.stageKind === "nurture" || (closed && todayIso(closed) >= since);
  });
  return (
    <>
      <PageHeader title="Funil" subtitle="Arraste o cartão ou troque a etapa no próprio cartão. Ganhos e perdidos: últimos 30 dias.">
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="fn-resp">Responsável</label>
              <select id="fn-resp" name="responsavel" defaultValue={responsavel ?? ""} className="field">
                <option value="">Todos</option>
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
      <FunnelBoard
        today={today}
        stages={stages.filter((st) => st.active).map((st) => ({ id: st.id, name: st.name, kind: st.kind, key: st.key, probability: st.probability }))}
        leads={leads.map((l) => ({ id: l.id, number: l.number, company: l.company, stageId: l.stageId, city: l.city, contactName: l.contactName, ownerName: l.ownerName, nextAction: l.nextAction, nextActionDate: l.nextActionDate, potentialCents: l.potentialCents, proposalValueCents: l.proposalValueCents }))}
      />
    </>
  );
}
