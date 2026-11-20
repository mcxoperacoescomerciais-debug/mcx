import { PageHeader } from "@/components/ui";
import { requireCan } from "@/server/auth";
import { crmPeople } from "@/server/crm";
import { Importer } from "./importer";

export const metadata = { title: "Importar leads" };

export default async function ImportLeadsPage() {
  const user = await requireCan("crm.view");
  const people = await crmPeople();
  return (
    <>
      <PageHeader title="Importar leads" subtitle="CSV com as colunas empresa, contato, whatsapp, cidade, tipo e origem (só “empresa” é obrigatória). Separador ; ou vírgula." />
      <section className="card p-4">
        <Importer people={people} userId={user.id} />
      </section>
      <p className="mt-3 text-xs text-muted">Os leads entram em “A prospectar”, com a próxima ação “Fazer o primeiro contato” para hoje. Linhas com o mesmo WhatsApp ou a mesma empresa de um lead já cadastrado são puladas. Importe só dados de contato profissional.</p>
    </>
  );
}
