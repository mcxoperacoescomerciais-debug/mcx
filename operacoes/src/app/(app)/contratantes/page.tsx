import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CLIENT_KIND_LABEL } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { listClients } from "@/server/registry";
import { ClientForm } from "./forms";

export const metadata = { title: "Contratantes" };

export default async function ClientsPage() {
  const user = await requireCan("client.view");
  const clients = await listClients(user);
  return (
    <>
      <PageHeader title="Contratantes" subtitle="Quem a MCX atende: agências e representantes." />
      <ul className="mb-6 grid gap-3 sm:grid-cols-2">
        {clients.map((c) => (
          <li key={c.id}>
            <Link href={`/contratantes/${c.id}`} className="card block h-full px-4 py-3 hover:border-brand-500">
              <p className="font-semibold text-ink">
                {c.name}
                {c.status === "inactive" && <span className="ml-2 text-xs font-normal text-muted">(inativo)</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {CLIENT_KIND_LABEL[c.kind]} · {c.open} {c.open === 1 ? "demanda aberta" : "demandas abertas"}
              </p>
              {c.brands && <p className="mt-1 text-xs text-ink-2">{c.brands}</p>}
            </Link>
          </li>
        ))}
      </ul>
      {can(user.role, "client.edit") && (
        <section className="card max-w-xl p-4" aria-labelledby="novo-cli">
          <h2 id="novo-cli" className="mb-3 text-sm font-bold text-ink-2">Novo contratante</h2>
          <ClientForm />
        </section>
      )}
    </>
  );
}
