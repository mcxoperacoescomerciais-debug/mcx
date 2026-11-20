import Link from "next/link";
import { notFound } from "next/navigation";
import { DemandCard, PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { CLIENT_KIND_LABEL } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { listDemands } from "@/server/demands";
import { getClient } from "@/server/registry";
import { Brands, ClientForm, Contacts } from "../forms";

export const metadata = { title: "Contratante" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("client.view");
  const { id } = await params;
  const client = await getClient(user, id);
  if (!client) notFound();
  const editable = can(user.role, "client.edit") && client.kind !== "internal";
  const open = await listDemands(user, { client: id, status: "open" });
  const today = todayIso();
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/contratantes" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Contratantes</Link>
      </p>
      <PageHeader title={client.name} subtitle={`${CLIENT_KIND_LABEL[client.kind]}${client.status === "inactive" ? " · inativo" : ""}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          {editable ? (
            <section className="card p-4" aria-labelledby="c-dados">
              <h2 id="c-dados" className="mb-3 text-sm font-bold text-ink-2">Cadastro</h2>
              <ClientForm client={{ id: client.id, name: client.name, kind: client.kind, document: client.document, status: client.status, notes: client.notes }} />
            </section>
          ) : (
            client.notes && <p className="card p-4 text-sm text-ink-2">{client.notes}</p>
          )}
          <section className="card p-4" aria-labelledby="c-marcas">
            <h2 id="c-marcas" className="mb-3 text-sm font-bold text-ink-2">Marcas atendidas</h2>
            <Brands clientId={client.id} brands={client.brands.map((b) => ({ id: b.id, name: b.name }))} editable={editable} />
          </section>
          <section className="card p-4" aria-labelledby="c-contatos">
            <h2 id="c-contatos" className="mb-3 text-sm font-bold text-ink-2">Contatos</h2>
            <Contacts clientId={client.id} contacts={client.contacts} editable={editable} />
          </section>
        </div>
        <section aria-labelledby="c-dem">
          <h2 id="c-dem" className="mb-2 text-sm font-bold text-ink-2">Demandas abertas ({open.length})</h2>
          <div className="space-y-2">
            {open.length === 0 && <p className="card px-4 py-6 text-center text-sm text-muted">Nenhuma demanda aberta.</p>}
            {open.map((d) => (
              <DemandCard key={d.id} d={d} today={today} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
