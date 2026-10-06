import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Button, Card, PageHeader } from "@/components/ui";
import { FormNotice, Input, Select } from "../../_components/form";
import { saveNetworkAction } from "../actions";

export const metadata: Metadata = { title: "Redes" };

export default async function NetworksPage({ searchParams }: PageProps<"/painel/admin/redes">) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({
      id: s.networks.id,
      name: s.networks.name,
      status: s.networks.status,
      stores: sql<number>`(select count(*) from ${s.stores} where ${s.stores.networkId} = ${s.networks.id})`.mapWith(Number),
      mixItems: sql<number>`(select count(*) from ${s.productMixes} where ${s.productMixes.networkId} = ${s.networks.id})`.mapWith(Number),
    })
    .from(s.networks)
    .where(eq(s.networks.clientId, scope.clientId))
    .orderBy(s.networks.name);

  return (
    <>
      <PageHeader title="Redes" subtitle="Redes de supermercado atendidas. O mix de produtos de cada rede é importado em Importar planilha." />
      <div className="mb-4 max-w-3xl">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <div className="max-w-3xl space-y-4">
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
                <th className="font-semibold px-5 py-2.5">Rede</th>
                <th className="font-semibold px-3 py-2.5 text-right">Lojas</th>
                <th className="font-semibold px-3 py-2.5 text-right">Itens no mix</th>
                <th className="font-semibold px-5 py-2.5">Editar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-semibold">{r.name}</td>
                  <td className="px-3 text-right tnum">{r.stores}</td>
                  <td className="px-3 text-right tnum">{r.mixItems}</td>
                  <td className="px-5 py-2">
                    <form action={saveNetworkAction} className="flex gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <Input name="name" defaultValue={r.name} className="!h-8 max-w-[200px]" aria-label="Nome" />
                      <Select name="status" defaultValue={r.status} className="!h-8 max-w-[110px]" aria-label="Status">
                        <option value="active">Ativa</option>
                        <option value="inactive">Inativa</option>
                      </Select>
                      <Button size="sm" variant="secondary">
                        Salvar
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <form action={saveNetworkAction} className="flex items-end gap-2">
            <label className="flex-1">
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Nova rede</span>
              <Input name="name" placeholder="Ex.: Super ABC" required />
            </label>
            <Button type="submit">Adicionar</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
