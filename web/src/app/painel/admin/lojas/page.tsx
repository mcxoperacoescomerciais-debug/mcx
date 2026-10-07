import type { Metadata } from "next";
import { ListSearch } from "@/app/painel/_components/list-search";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { STORE_FORMAT_LABEL, type StoreFormat } from "@/lib/domain";
import { FormNotice } from "../../_components/form";

export const metadata: Metadata = { title: "Cadastro de lojas" };

export default async function StoresAdminPage({ searchParams }: PageProps<"/painel/admin/lojas">) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({
      id: s.stores.id,
      name: s.stores.name,
      code: s.stores.code,
      city: s.stores.city,
      state: s.stores.state,
      format: s.stores.format,
      status: s.stores.status,
      network: s.networks.name,
      promoters: sql<string | null>`(select string_agg(${s.users.name}, ', ') from ${s.storeAssignments} join ${s.users} on ${s.users.id} = ${s.storeAssignments.userId} where ${s.storeAssignments.storeId} = ${s.stores.id} and ${s.users.role} = 'promoter')`,
    })
    .from(s.stores)
    .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
    .where(and(eq(s.stores.clientId, scope.clientId)))
    .orderBy(s.networks.name, s.stores.city, s.stores.name);

  return (
    <>
      <PageHeader
        title="Cadastro de lojas"
        subtitle="O formato (Varejo, Plus, Cash) define o mix de produtos que o promotor vê na loja."
        actions={
          <LinkButton href="/painel/admin/lojas/nova">
            <Plus className="size-4" /> Nova loja
          </LinkButton>
        }
      />
      <div className="mb-4">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <Card className="overflow-hidden">
        <ListSearch placeholder="Pesquisar loja, número, cidade ou rede..." />
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
              <th className="font-semibold px-5 py-2.5">Loja</th>
              <th className="font-semibold px-3 py-2.5">Rede / formato</th>
              <th className="font-semibold px-3 py-2.5">Cidade</th>
              <th className="font-semibold px-3 py-2.5">Promotor</th>
              <th className="font-semibold px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
                <td className="px-5 py-2.5">
                  <Link href={`/painel/admin/lojas/${r.id}`} className="font-semibold hover:underline">
                    {r.name}
                    {r.code ? <span className="text-muted font-medium"> · {r.code}</span> : null}
                  </Link>
                </td>
                <td className="px-3">
                  {r.network} <Badge>{STORE_FORMAT_LABEL[r.format as StoreFormat] ?? (r.format || "A definir")}</Badge>
                </td>
                <td className="px-3">
                  {r.city} – {r.state}
                </td>
                <td className="px-3">{r.promoters ?? <span className="text-[#B42318] font-semibold">sem promotor</span>}</td>
                <td className="px-5">{r.status === "active" ? <Badge tone="green">Ativa</Badge> : <Badge>Inativa</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
