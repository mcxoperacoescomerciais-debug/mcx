import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { lowStock, stockRecords } from "@/server/analytics";
import { parseFilters, withParams } from "@/lib/filters";
import { STOCK_STATE_LABEL, STOCK_STATE_TONE, STOCK_STATES } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { StoreGroups } from "../_components/store-groups";
import { Pagination, SectionCard, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Estoque" };

/** "Acabando" = até N unidades na última contagem. */
const LOW_OPTIONS = [3, 5, 10, 20];
const DEFAULT_LOW = 5;

export default async function StockPage({ searchParams }: PageProps<"/painel/estoque">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const raw = await searchParams;
  const maxUnits = LOW_OPTIONS.includes(Number(raw.ate)) ? Number(raw.ate) : DEFAULT_LOW;
  const [low, list, options] = await Promise.all([lowStock(scope, f, maxUnits), stockRecords(scope, f), filterOptions(scope)]);
  const keep = { ate: maxUnits === DEFAULT_LOW ? null : String(maxUnits), from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city, status: f.status, q: f.q || null };
  const qs = (patch: Record<string, string | null>) => withParams(keep, { ...patch, page: null });

  return (
    <>
      <ProductTabs />
      <PageHeader
        title="Estoque"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · o que está acabando em cada loja, pela contagem dos promotores`}
        actions={
          <LinkButton variant="secondary" href={`/api/export/stock${withParams(keep)}`} prefetch={false}>
            <FileDown className="size-4" /> Exportar (Excel)
          </LinkButton>
        }
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "status", "q"]}
        options={{ ...options, statuses: [...STOCK_STATES.map((st) => ({ id: st, name: STOCK_STATE_LABEL[st] })), { id: "divergent", name: "Divergência relevante" }] }}
        statusLabel="Todas as situações"
        qPlaceholder="Produto, SKU ou loja"
      />

      <SectionCard
        title={`Produtos acabando · ${low.length} em ${new Set(low.map((r) => r.store_id)).size} loja(s)`}
        subtitle={`Última contagem de cada produto em cada loja no período, com até ${maxUnits} unidades (ou até 1 caixa). Do mais crítico para o menos.`}
        action={
          <div className="flex items-center gap-1.5 text-[12.5px]">
            <span className="text-muted">Até</span>
            {LOW_OPTIONS.map((n) => (
              <Link key={n} href={qs({ ate: n === DEFAULT_LOW ? null : String(n) })} className={`h-7 px-2.5 rounded-md font-semibold inline-flex items-center ${n === maxUnits ? "bg-brand-800 text-white" : "border border-line-strong text-ink-2 hover:bg-subtle"}`}>
                {n}
              </Link>
            ))}
            <span className="text-muted">un.</span>
          </div>
        }
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
            exportTitle="Produtos acabando"
            exportHead={["Produto", "SKU", "Marca", "Restam", "Unidade", "Contado em", "Promotor"]}
            exportRow={(r) => [r.product_name, r.sku, r.brand_name, r.quantity, r.unit, fmtDate(r.visit_date), r.promoter_name]}
            page={1}
            pageSize={100_000}
            hrefFor={() => "#"}
          />
        ) : (
          <EmptyState title="Nenhum produto acabando neste filtro" />
        )}
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Todas as contagens" subtitle={`${list.total} registro(s) · comparados ao levantamento anterior do mesmo produto na mesma loja`}>
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
