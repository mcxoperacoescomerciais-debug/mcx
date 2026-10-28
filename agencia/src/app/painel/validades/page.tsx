import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { validityList, validitySummary } from "@/server/items";
import { parseFilters, withParams } from "@/lib/filters";
import { VALIDITY_LOCATION_LABEL, VALIDITY_LOCATIONS } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { describeDays, formatIsoBr, SEVERITIES, SEVERITY_COLOR, SEVERITY_LABEL } from "@/lib/validity";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { SeverityBadge } from "@/components/severity";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { Pagination, SectionCard, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Validades" };

export default async function ValiditiesPage({ searchParams }: PageProps<"/painel/validades">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 30);
  const [sum, list, options] = await Promise.all([validitySummary(scope, f), validityList(scope, f), filterOptions(scope)]);
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city, status: f.status, kind: f.kind, q: f.q || null };
  const b = scope.settings.validityBands;
  const hint: Record<string, string> = {
    expired: "Já venceu",
    critical: `Até ${b.critical} dias`,
    high: `Até ${b.high} dias`,
    attention: `Até ${b.attention} dias`,
    monitor: `Até ${b.monitor} dias`,
    normal: `Mais de ${b.monitor} dias`,
  };

  return (
    <>
      <ProductTabs />
      <PageHeader
        title="Validades"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · produtos com validade registrados pelos promotores (classificação na data da visita)`}
        actions={
          <LinkButton variant="secondary" href={`/api/export/validities${withParams(keep)}`} prefetch={false}>
            <FileDown className="size-4" /> Exportar (Excel)
          </LinkButton>
        }
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "city", "status", "kind", "q"]}
        options={{
          ...options,
          statuses: [{ id: "urgent", name: "Vencidos + críticos" }, ...SEVERITIES.map((sv) => ({ id: sv, name: SEVERITY_LABEL[sv] }))],
          kinds: VALIDITY_LOCATIONS.map((l) => ({ id: l, name: VALIDITY_LOCATION_LABEL[l] })),
        }}
        statusLabel="Todas as situações"
        kindLabel="Área de vendas e estoque"
        qPlaceholder="Produto ou SKU"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {SEVERITIES.map((sv) => {
          const c = SEVERITY_COLOR[sv];
          const on = f.status === sv;
          return (
            <Link
              key={sv}
              href={withParams({ ...keep, status: on ? null : sv })}
              className="rounded-2xl border bg-surface p-4 hover:border-line-strong"
              style={{ borderColor: on ? c.solid : undefined, boxShadow: `inset 3px 0 0 ${c.solid}` }}
            >
              <p className="text-[12px] font-semibold" style={{ color: c.fg }}>
                {SEVERITY_LABEL[sv]}
              </p>
              <p className="text-[26px] font-bold tnum leading-tight mt-1">{sum.by[sv].n}</p>
              <p className="text-[11.5px] text-muted">
                {hint[sv]} · {sum.by[sv].units} un · {sum.by[sv].stores} loja(s)
              </p>
            </Link>
          );
        })}
      </div>

      <SectionCard className="mt-6" title="Produtos registrados" subtitle={`${list.total} registro(s) · ordenados pela validade mais próxima`}>
        {list.rows.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Validade</Th>
                  <Th>Situação</Th>
                  <Th>Produto</Th>
                  <Th>Loja</Th>
                  <Th>Marca</Th>
                  <Th>Local</Th>
                  <Th align="right">Qtd.</Th>
                  <Th align="right">Preço</Th>
                  <Th>Promotor</Th>
                  <Th>Visita</Th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-subtle">
                    <Td className="tnum whitespace-nowrap">
                      <span className="font-semibold">{formatIsoBr(r.expiryDate)}</span>
                      <span className="block text-[11.5px] text-muted">hoje: {describeDays(r.daysFromToday)}</span>
                    </Td>
                    <Td>
                      <SeverityBadge severity={r.severity} />
                    </Td>
                    <Td>
                      <Link href={`/painel/atendimentos/${r.attendanceId}`} target="_blank" className="font-semibold hover:underline">
                        {r.productName}
                      </Link>
                      <span className="block text-[11.5px] text-muted">
                        SKU {r.sku}
                        {r.lot ? ` · lote ${r.lot}` : ""}
                        {r.photos ? ` · ${r.photos} foto(s)` : ""}
                      </span>
                    </Td>
                    <Td>
                      <Link href={`/painel/lojas/${r.storeId}`} target="_blank" className="hover:underline">
                        {r.storeName}
                      </Link>
                      <span className="block text-[11.5px] text-muted">{r.city}</span>
                    </Td>
                    <Td>{r.brandName}</Td>
                    <Td className="text-[12.5px]">{VALIDITY_LOCATION_LABEL[r.location]}</Td>
                    <Td align="right">
                      {r.quantity} {r.unit}
                    </Td>
                    <Td align="right">{r.price === null ? "—" : `R$ ${Number(r.price).toFixed(2).replace(".", ",")}`}</Td>
                    <Td>{r.promoterName}</Td>
                    <Td className="tnum">{fmtDate(r.visitDate)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={f.page} total={list.total} pageSize={f.pageSize} hrefFor={(p) => withParams(keep, { page: p })} />
          </>
        ) : (
          <EmptyState title="Nenhuma validade neste filtro" />
        )}
      </SectionCard>
    </>
  );
}
