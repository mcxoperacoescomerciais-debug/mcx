import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { damageList, damageSummary } from "@/server/items";
import { parseFilters, withParams } from "@/lib/filters";
import { DAMAGE_KIND_LABEL, DAMAGE_KINDS } from "@/lib/domain";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { formatIsoBr } from "@/lib/validity";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { KpiCard, Pagination, SectionCard, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Avarias" };

export default async function DamagesPage({ searchParams }: PageProps<"/painel/avarias">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 30);
  const [sum, list, options] = await Promise.all([damageSummary(scope, f), damageList(scope, f), filterOptions(scope)]);
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city, kind: f.kind, q: f.q || null };

  return (
    <>
      <ProductTabs />
      <PageHeader
        title="Avarias"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · produtos danificados ou impróprios registrados com foto`}
        actions={
          <LinkButton variant="secondary" href={`/api/export/damages${withParams(keep)}`} prefetch={false}>
            <FileDown className="size-4" /> Exportar (Excel)
          </LinkButton>
        }
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "city", "kind", "q"]}
        options={{ ...options, kinds: DAMAGE_KINDS.map((k) => ({ id: k, name: DAMAGE_KIND_LABEL[k] })) }}
        kindLabel="Todos os tipos"
        qPlaceholder="Produto ou SKU"
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Avarias no período" value={sum.n} tone={sum.n ? "danger" : "neutral"} />
        <KpiCard label="Quantidade avariada" value={sum.units} sub="Soma das quantidades informadas" />
        <KpiCard label="Lojas com avaria" value={sum.stores} />
        <KpiCard label="Produtos diferentes" value={sum.products} />
      </div>

      <SectionCard className="mt-6" title="Avarias registradas" subtitle={`${list.total} registro(s)`}>
        {list.rows.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Registrado</Th>
                  <Th>Produto</Th>
                  <Th>Tipo</Th>
                  <Th align="right">Qtd.</Th>
                  <Th>Validade</Th>
                  <Th>Loja</Th>
                  <Th>Marca</Th>
                  <Th>Promotor</Th>
                  <Th>Foto</Th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-subtle">
                    <Td className="tnum whitespace-nowrap">{fmtDateTime(r.recordedAt)}</Td>
                    <Td>
                      <Link href={`/painel/atendimentos/${r.attendanceId}`} target="_blank" className="font-semibold hover:underline">
                        {r.productName}
                      </Link>
                      <span className="block text-[11.5px] text-muted">
                        SKU {r.sku}
                        {r.lot ? ` · lote ${r.lot}` : ""}
                        {r.note ? ` · “${r.note}”` : ""}
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge tone="danger" size="sm">
                        {DAMAGE_KIND_LABEL[r.kind]}
                      </StatusBadge>
                    </Td>
                    <Td align="right">
                      {r.quantity} {r.unit}
                    </Td>
                    <Td className="tnum">{formatIsoBr(r.expiryDate)}</Td>
                    <Td>
                      <Link href={`/painel/lojas/${r.storeId}`} target="_blank" className="hover:underline">
                        {r.storeName}
                      </Link>
                      <span className="block text-[11.5px] text-muted">{r.city}</span>
                    </Td>
                    <Td>{r.brandName}</Td>
                    <Td>{r.promoterName}</Td>
                    <Td>{r.photos ? `${r.photos} foto(s)` : <span className="text-bad">Sem foto</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={f.page} total={list.total} pageSize={f.pageSize} hrefFor={(p) => withParams(keep, { page: p })} />
          </>
        ) : (
          <EmptyState title="Nenhuma avaria neste filtro" />
        )}
      </SectionCard>
    </>
  );
}
