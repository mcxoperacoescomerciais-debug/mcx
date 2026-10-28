import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { damageList, damageSummary } from "@/server/items";
import { EXPORT_PAGE_SIZE, parseFilters, withParams } from "@/lib/filters";
import { DAMAGE_KIND_LABEL, DAMAGE_KINDS } from "@/lib/domain";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { formatIsoBr } from "@/lib/validity";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { StoreGroups } from "../_components/store-groups";
import { KpiCard, SectionCard, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Avarias" };

export default async function DamagesPage({ searchParams }: PageProps<"/painel/avarias">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 30);
  const [sum, list, options] = await Promise.all([damageSummary(scope, f), damageList(scope, { ...f, page: 1, pageSize: EXPORT_PAGE_SIZE }), filterOptions(scope)]);
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

      <SectionCard className="mt-6" title="Avarias por loja" subtitle={`${list.total} registro(s) · clique na loja para ver os produtos`} bodyClass="pb-1">
        {list.rows.length ? (
          <StoreGroups
            rows={list.rows}
            storeOf={(r) => ({ id: r.storeId, name: r.storeName, city: r.city })}
            extra={(items) => <span className="text-bad font-semibold">{items.reduce((n, r) => n + (r.quantity ?? 0), 0)} un. avariadas</span>}
            head={
              <tr>
                <Th>Registrado</Th>
                <Th>Produto</Th>
                <Th>Tipo</Th>
                <Th align="right">Qtd.</Th>
                <Th>Validade</Th>
                <Th>Marca</Th>
                <Th>Promotor</Th>
                <Th>Foto</Th>
              </tr>
            }
            renderRow={(r) => (
              <tr key={r.id} className="hover:bg-surface">
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
                <Td>{r.brandName}</Td>
                <Td>{r.promoterName}</Td>
                <Td>{r.photos ? `${r.photos} foto(s)` : <span className="text-bad">Sem foto</span>}</Td>
              </tr>
            )}
            exportTitle="Avarias registradas"
            exportHead={["Registrado", "Produto", "SKU", "Tipo", "Qtd.", "Unidade", "Validade", "Marca", "Promotor", "Fotos"]}
            exportRow={(r) => [fmtDateTime(r.recordedAt), r.productName, r.sku, DAMAGE_KIND_LABEL[r.kind], r.quantity, r.unit, formatIsoBr(r.expiryDate), r.brandName, r.promoterName, r.photos]}
            page={f.page}
            hrefFor={(p) => withParams(keep, { page: p })}
          />
        ) : (
          <EmptyState title="Nenhuma avaria neste filtro" />
        )}
      </SectionCard>
    </>
  );
}
