import type { Metadata } from "next";
import { ListSearch } from "@/app/painel/_components/list-search";
import Link from "next/link";
import { getScope } from "@/server/auth";
import { filterOptions, loadFacts, productRanking } from "@/server/analytics";
import { parseFilters, resolveRange } from "@/lib/filters";
import { formatIsoBr } from "@/lib/validity";
import { Card, PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage({ searchParams }: PageProps<"/painel/produtos">) {
  const scope = await getScope();
  const filters = parseFilters(await searchParams, "30d");
  const range = resolveRange(filters);
  const [facts, options] = await Promise.all([loadFacts(scope, filters, range.from, range.to), filterOptions(scope)]);
  const rows = productRanking(facts)
    .map((p) => ({ ...p, alerts: p.items + p.ruptures + p.damages }))
    .filter((p) => p.alerts > 0)
    .sort((a, b) => b.alerts - a.alerts || b.units - a.units);

  return (
    <>
      <PageHeader title="Produtos" subtitle={`Produtos com ocorrências · ${range.label.toLowerCase()} · ordenado por recorrência de alerta`} />
      <FilterBar filters={filters} options={options} fields={["network", "store", "city", "promoter", "category"]} />
      <Card className="overflow-hidden">
        <ListSearch placeholder="Pesquisar produto ou código..." />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
                <th className="font-semibold px-5 py-2.5">Produto</th>
                <th className="font-semibold px-2 py-2.5 text-right">Alertas</th>
                <th className="font-semibold px-2 py-2.5 text-right">Próx./venc. (itens)</th>
                <th className="font-semibold px-2 py-2.5 text-right">Unidades</th>
                <th className="font-semibold px-2 py-2.5 text-right">Vencidos</th>
                <th className="font-semibold px-2 py-2.5 text-right">Rupturas</th>
                <th className="font-semibold px-2 py-2.5 text-right">Avarias</th>
                <th className="font-semibold px-2 py-2.5 text-right">Lojas</th>
                <th className="font-semibold px-5 py-2.5">Menor validade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-b border-line last:border-0 hover:bg-navy-50/40">
                  <td className="px-5 py-2.5">
                    <Link href={`/painel/produtos/${r.productId}`} className="font-semibold hover:underline">
                      {r.productName}
                    </Link>
                    <div className="text-[12px] text-muted">{r.category}</div>
                  </td>
                  <td className="px-2 text-right tnum font-bold">{r.alerts}</td>
                  <td className="px-2 text-right tnum">{r.items}</td>
                  <td className="px-2 text-right tnum">{r.units.toLocaleString("pt-BR")}</td>
                  <td className={`px-2 text-right tnum ${r.expired ? "text-[#B42318] font-bold" : ""}`}>{r.expired}</td>
                  <td className="px-2 text-right tnum">{r.ruptures}</td>
                  <td className="px-2 text-right tnum">{r.damages}</td>
                  <td className="px-2 text-right tnum">{r.stores}</td>
                  <td className="px-5 tnum">{formatIsoBr(r.minExpiry)}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-muted">
                    Nenhum produto com ocorrência no período.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
