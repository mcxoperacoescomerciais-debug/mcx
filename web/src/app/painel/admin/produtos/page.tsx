import type { Metadata } from "next";
import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { Plus, Upload } from "lucide-react";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { FormNotice } from "../../_components/form";

export const metadata: Metadata = { title: "Cadastro de produtos" };

export default async function ProductsAdminPage({ searchParams }: PageProps<"/painel/admin/produtos">) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const sp = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({
      id: s.products.id,
      code: s.products.code,
      name: s.products.name,
      category: s.products.category,
      referencePrice: s.products.referencePrice,
      status: s.products.status,
      mixes: sql<string | null>`(select string_agg(${s.networks.name} || ' ' || initcap(${s.productMixes.format}), ', ' order by ${s.networks.name}) from ${s.productMixes} join ${s.networks} on ${s.networks.id} = ${s.productMixes.networkId} where ${s.productMixes.productId} = ${s.products.id})`,
    })
    .from(s.products)
    .where(eq(s.products.clientId, scope.clientId))
    .orderBy(s.products.category, s.products.name);

  return (
    <>
      <PageHeader
        title="Cadastro de produtos"
        subtitle={`${rows.length} produtos. A forma mais rápida de atualizar é importar a planilha de MIX da SUINCO.`}
        actions={
          <>
            <LinkButton href="/painel/admin/importar" variant="secondary">
              <Upload className="size-4" /> Importar planilha de mix
            </LinkButton>
            <LinkButton href="/painel/admin/produtos/novo">
              <Plus className="size-4" /> Novo produto
            </LinkButton>
          </>
        }
      />
      <div className="mb-4">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
              <th className="font-semibold px-5 py-2.5">Código</th>
              <th className="font-semibold px-3 py-2.5">Produto</th>
              <th className="font-semibold px-3 py-2.5">Categoria</th>
              <th className="font-semibold px-3 py-2.5 text-right">Preço tabela</th>
              <th className="font-semibold px-3 py-2.5">Mix</th>
              <th className="font-semibold px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
                <td className="px-5 py-2.5 font-mono text-[12.5px]">{r.code ?? "—"}</td>
                <td className="px-3">
                  <Link href={`/painel/admin/produtos/${r.id}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-3">{r.category}</td>
                <td className="px-3 text-right tnum">{r.referencePrice ? `R$ ${Number(r.referencePrice).toFixed(2).replace(".", ",")}` : "—"}</td>
                <td className="px-3 text-[12px] text-ink-2">{r.mixes ?? <span className="text-muted">fora do mix</span>}</td>
                <td className="px-5">{r.status === "active" ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
