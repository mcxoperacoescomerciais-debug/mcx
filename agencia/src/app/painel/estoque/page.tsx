import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { stockRecords, stockSummary } from "@/server/analytics";
import { PAGE_SIZE, parseFilters, withParams } from "@/lib/filters";
import { STOCK_STATE_LABEL, STOCK_STATE_TONE, STOCK_STATES } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { KpiCard, Pagination, RankBar, SectionCard, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Estoque" };

export default async function StockPage({ searchParams }: PageProps<"/painel/estoque">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const [sum, list, options] = await Promise.all([stockSummary(scope, f), stockRecords(scope, f), filterOptions(scope)]);
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city, status: f.status, q: f.q || null };
  const qs = (patch: Record<string, string | null>) => withParams(keep, { ...patch, page: null });
  const maxZero = sum.topZero[0]?.zeros ?? 0;

  return (
    <>
      <ProductTabs />
      <PageHeader
        title="Estoque"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · quantidades levantadas pelos promotores — não é o saldo oficial do supermercado`}
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

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Registros de estoque" value={sum.entries} sub={`em ${sum.attendances} atendimento(s) concluído(s)`} href={qs({ status: null })} />
        <KpiCard label="Com quantidade" value={sum.quantity} tone="success" href={qs({ status: "quantity" })} />
        <KpiCard label="Estoque zero" value={sum.zero} tone={sum.zero ? "danger" : "neutral"} sub={`${sum.zeroProducts} produto(s) distinto(s)`} href={qs({ status: "zero" })} />
        <KpiCard label="Não encontrado" value={sum.notFound} tone={sum.notFound ? "warning" : "neutral"} href={qs({ status: "not_found" })} />
        <KpiCard label="Sem informação" value={sum.missingInfo} tone={sum.missingInfo ? "warning" : "neutral"} sub="Produto acompanhado sem registro no atendimento (pendente ≠ zero)" />
        <KpiCard label="Divergências a conferir" value={sum.divergences} tone={sum.divergences ? "warning" : "neutral"} sub={`Variação ≥ ${scope.settings.stockDivergencePct}% vs. levantamento anterior`} href={qs({ status: "divergent" })} />
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mt-6">
        <SectionCard title="Produtos com estoque zero mais frequente" subtitle="Nº de levantamentos com zero no período" className="xl:col-span-1">
          {sum.topZero.length ? (
            <ul className="px-5 pb-4 space-y-2.5">
              {sum.topZero.map((p) => (
                <li key={p.productId} className="grid grid-cols-[1fr_auto] gap-3 items-center text-[13px]">
                  <span className="truncate" title={p.name}>
                    {p.name}
                    <span className="text-muted text-[11.5px]">
                      {" "}
                      · {p.brand} · {p.stores} loja(s) · {p.records} levant.
                    </span>
                  </span>
                  <RankBar value={p.zeros} max={maxZero} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[13.5px] text-muted">Nenhum estoque zero no período.</p>
          )}
        </SectionCard>

        <SectionCard className="xl:col-span-2" title="Registros" subtitle={`${list.total} registro(s) · comparados ao levantamento anterior do mesmo produto na mesma loja`}>
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
                        <Link href={`/painel/atendimentos/${r.attendance_id}`} className="hover:underline">
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
              <Pagination page={f.page} total={list.total} pageSize={PAGE_SIZE} hrefFor={(p) => withParams(keep, { page: p })} />
            </>
          ) : (
            <EmptyState title="Nenhum registro neste filtro" />
          )}
        </SectionCard>
      </div>
    </>
  );
}
