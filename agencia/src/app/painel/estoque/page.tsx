import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { lowStock, stockRecords, type StockOrder } from "@/server/analytics";
import { parseFilters, withParams } from "@/lib/filters";
import { STOCK_STATE_LABEL, STOCK_STATE_TONE, STOCK_STATES } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { StoreGroups } from "../_components/store-groups";
import { Pagination, SectionCard, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Estoque" };

const ORDERS: { id: StockOrder; label: string }[] = [
  { id: "recentes", label: "Mais recentes" },
  { id: "antigos", label: "Mais antigas" },
  { id: "maior", label: "Maior qtd." },
  { id: "menor", label: "Menor qtd." },
];

export default async function StockPage({ searchParams }: PageProps<"/painel/estoque">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const raw = await searchParams;
  const order = ORDERS.find((o) => o.id === raw.ordem)?.id ?? "recentes";
  const [low, list, options] = await Promise.all([lowStock(scope, f), stockRecords(scope, f, { order }), filterOptions(scope)]);
  const keep = { ordem: order === "recentes" ? null : order, from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city, status: f.status, q: f.q || null };
  const qs = (patch: Record<string, string | null>) => withParams(keep, { ...patch, page: null });

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
        options={{ ...options, statuses: [...STOCK_STATES.map((st) => ({ id: st, name: STOCK_STATE_LABEL[st] })), { id: "divergent", name: "Divergência relevante" }] }}
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

      <div className="mt-6">
        <SectionCard
          title="Todas as contagens"
          subtitle={`${list.total} registro(s) · comparados ao levantamento anterior do mesmo produto na mesma loja`}
          action={
            <div className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5 text-[12.5px]" role="group" aria-label="Ordem">
              {ORDERS.map((o) => (
                <Link key={o.id} href={qs({ ordem: o.id === "recentes" ? null : o.id })} scroll={false} className={`h-7 px-2.5 rounded-md font-semibold inline-flex items-center whitespace-nowrap ${o.id === order ? "bg-brand-800 text-white" : "text-ink-2 hover:bg-subtle"}`}>
                  {o.label}
                </Link>
              ))}
            </div>
          }
        >
          {list.rows.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Produto</Th>
                    <Th>Loja</Th>
                    <Th>Situação</Th>
                    <Th align="right">Qtd.</Th>
                    <Th align="right">Anterior</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-subtle">
                      <Td className="tnum whitespace-nowrap">
                        <Link href={`/painel/atendimentos/${r.attendance_id}`} target="_blank" className="hover:underline">
                          {fmtDate(r.visit_date)}
                        </Link>
                      </Td>
                      <Td>
                        {r.product_name}
                        <span className="block text-[11.5px] text-muted">
                          {r.brand_name} · SKU {r.sku}
                        </span>
                      </Td>
                      <Td>
                        {r.store_name}
                        <span className="block text-[11.5px] text-muted">{r.promoter_name}</span>
                      </Td>
                      <Td>
                        <StatusBadge tone={STOCK_STATE_TONE[r.state]} size="sm">
                          {STOCK_STATE_LABEL[r.state]}
                        </StatusBadge>
                      </Td>
                      <Td align="right" className="font-semibold">
                        {r.quantity !== null ? `${r.quantity} ${r.unit}` : "—"}
                      </Td>
                      <Td align="right" className={r.divergent ? "text-warn font-semibold" : "text-muted"}>
                        {r.prev_date ? `${r.prev_quantity ?? (r.prev_state ? STOCK_STATE_LABEL[r.prev_state] : "—")} (${fmtDate(r.prev_date).slice(0, 5)})` : "—"}
                        {r.divergent ? <span className="block text-[11px]">divergência</span> : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={f.page} total={list.total} pageSize={f.pageSize} hrefFor={(p) => withParams(keep, { page: p })} />
            </>
          ) : (
            <EmptyState title="Nenhum registro neste filtro" />
          )}
        </SectionCard>
      </div>
    </>
  );
}
