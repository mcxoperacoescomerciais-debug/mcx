import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { lowStock } from "@/server/analytics";
import { parseFilters } from "@/lib/filters";
import { STOCK_STATE_LABEL } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { StoreGroups } from "../_components/store-groups";
import { SectionCard, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Estoque" };


export default async function StockPage({ searchParams }: PageProps<"/painel/estoque">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const [low, options] = await Promise.all([lowStock(scope, f), filterOptions(scope)]);

  return (
    <>
      <ProductTabs />
      <PageHeader
        title="Estoque"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · contagem de estoque de cada loja, feita pelos promotores`}
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "status", "q"]}
        options={{ ...options, statuses: (["quantity", "zero"] as const).map((st) => ({ id: st, name: STOCK_STATE_LABEL[st] })) }}
        statusLabel="Todas as situações"
        qPlaceholder="Produto, SKU ou loja"
      />

      <SectionCard
        title={`Contagem por loja · ${low.length} produto(s) em ${new Set(low.map((r) => r.store_id)).size} loja(s)`}
        subtitle="Última contagem de cada produto em cada loja no período, seguindo os filtros. Do menor estoque para o maior."
      >
        {low.length ? (
          <StoreGroups
            rows={low}
            storeOf={(r) => ({ id: r.store_id, name: r.store_name, city: r.city })}
            extra={(items) => {
              const out = items.filter((r) => r.quantity === 0).length;
              return out ? <span className="text-bad font-semibold">{out} acabaram</span> : null;
            }}
            head={
              <tr>
                <Th>Produto</Th>
                <Th align="right">Restam</Th>
                <Th>Contado em</Th>
              </tr>
            }
            renderRow={(r) => (
              <tr key={`${r.store_id}:${r.product_id}`} className="hover:bg-surface">
                <Td>
                  {r.product_name}
                  <span className="block text-[11.5px] text-muted">
                    {r.brand_name} · SKU {r.sku}
                  </span>
                </Td>
                <Td align="right" className="whitespace-nowrap">
                  <span className={`text-[17px] font-bold tnum ${r.quantity === 0 ? "text-bad" : r.quantity <= 2 ? "text-bad" : "text-warn"}`}>
                    {r.quantity === 0 ? "Acabou" : `${r.quantity} ${r.unit === "cx" ? (r.quantity === 1 ? "caixa" : "caixas") : r.quantity === 1 ? "unidade" : "unidades"}`}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  <Link href={`/painel/atendimentos/${r.attendance_id}`} target="_blank" className="tnum hover:underline">
                    {fmtDate(r.visit_date)}
                  </Link>
                  <span className="block text-[11.5px] text-muted">{r.promoter_name}</span>
                </Td>
              </tr>
            )}
            exportTitle="Contagem por loja"
            exportHead={["Produto", "SKU", "Marca", "Restam", "Unidade", "Contado em", "Promotor"]}
            exportRow={(r) => [r.product_name, r.sku, r.brand_name, r.quantity, r.unit, fmtDate(r.visit_date), r.promoter_name]}
            page={1}
            pageSize={100_000}
            hrefFor={() => "#"}
          />
        ) : (
          <EmptyState title="Nenhuma contagem neste filtro" />
        )}
      </SectionCard>

    </>
  );
}
