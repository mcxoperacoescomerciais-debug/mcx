import { LeadForm } from "@/components/crm/lead-form";
import { PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { crmPeople, expansionClients } from "@/server/crm";

export const metadata = { title: "Novo lead" };

export default async function NewLeadPage() {
  const user = await requireCan("crm.view");
  const [people, clients] = await Promise.all([crmPeople(), expansionClients()]);
  return (
    <>
      <PageHeader title="Novo lead" subtitle="Entra em “A prospectar”, já com a próxima ação e a data." />
      <section className="card p-4">
        <LeadForm people={people} clients={clients} userId={user.id} today={todayIso()} />
      </section>
    </>
  );
}
