import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { ruptureList, ruptureSummary } from "@/server/analytics";
import { EXPORT_PAGE_SIZE, parseFilters, withParams } from "@/lib/filters";
import { RUPTURE_SITUATION_LABEL } from "@/lib/domain";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui";
import { ProductTabs } from "../_components/product-tabs";
import { FilterBar } from "../_components/filter-bar";
import { KpiCard, RankBar, SectionCard, Table, Td, Th } from "../_components/widgets";
import { DailyBars } from "../_components/daily-bars";
import { StoreGroups } from "../_components/store-groups";

export const metadata: Metadata = { title: "Rupturas" };

export default async function RupturesPage({ searchParams }: PageProps<"/painel/rupturas">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 30);
  const [sum, list, options] = await Promise.all([ruptureSummary(scope, f), ruptureList(scope, { ...f, page: 1, pageSize: EXPORT_PAGE_SIZE }), filterOptions(scope)]);
  const t = sum.totals;
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city, q: f.q || null };

  return (
    <>
      <ProductTabs />
      <PageHeader
        title="Ruptura"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · produtos marcados pelos promotores como “Ruptura total”`}
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "q"]}
        options={options}
        qPlaceholder="Produto ou SKU"
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Rupturas no período" value={t.total} tone={t.total ? "danger" : "neutral"} sub={`em ${t.visits} visita(s)`} />
        <KpiCard label="Lojas com ruptura" value={t.stores} />
        <KpiCard label="Produtos diferentes" value={t.products} />
        <KpiCard label="Recorrentes" value={sum.recurrent.length} tone={sum.recurrent.length ? "warning" : "neutral"} sub="Mesmo produto e loja em 2+ visitas" />
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mt-6">
        <SectionCard title="Evolução diária" subtitle="Rupturas registradas por dia de visita" bodyClass="px-5 pb-5">
          <DailyBars data={sum.daily} from={f.from} to={f.to} label="Rupturas" />
        </SectionCard>
        <Ranking title="Produtos mais registrados" rows={sum.products} hrefFor={() => null} />
        <Ranking title="Lojas com mais ocorrências" rows={sum.stores} hrefFor={(id) => `/painel/lojas/${id}`} />
      </div>
      <div className="mt-6">
        <SectionCard title="Recorrência" subtitle="Mesmo produto na mesma loja em 2 ou mais visitas do período">
          {sum.recurrent.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Loja</Th>
                  <Th align="right">Visitas com ruptura</Th>
                </tr>
              </thead>
              <tbody>
                {sum.recurrent.map((r) => (
                  <tr key={`${r.product}${r.store}`}>
                    <Td>{r.product}</Td>
                    <Td>{r.store}</Td>
                    <Td align="right" className="font-semibold">
                      {r.n}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-[13.5px] text-muted">Nenhuma recorrência no período.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard className="mt-6" title="Rupturas por loja" subtitle={`${list.total} registro(s) no período · clique na loja para ver os produtos`} bodyClass="pb-1">
        {list.rows.length ? (
          <StoreGroups
            rows={list.rows}
            storeOf={(r) => ({ id: r.storeId, name: r.storeName, city: r.city })}
            head={
              <tr>
                <Th>Data</Th>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th>Promotor</Th>
                <Th>Situação</Th>
              </tr>
            }
            renderRow={(r) => (
              <tr key={r.id} className="hover:bg-surface">
                <Td className="tnum whitespace-nowrap">{fmtDateTime(r.recordedAt).slice(0, 16)}</Td>
                <Td>
                  <Link href={`/painel/atendimentos/${r.attendanceId}`} target="_blank" className="font-semibold hover:underline">
                    {r.productName}
                  </Link>
                  <span className="block text-[11.5px] text-muted">SKU {r.sku}</span>
                </Td>
                <Td>{r.brandName}</Td>
                <Td>{r.promoterName}</Td>
                <Td className="text-[12.5px]">{RUPTURE_SITUATION_LABEL[r.situation]}</Td>
              </tr>
            )}
            exportTitle="Rupturas registradas"
            exportHead={["Data", "Produto", "SKU", "Marca", "Promotor", "Situação"]}
            exportRow={(r) => [fmtDateTime(r.recordedAt).slice(0, 16), r.productName, r.sku, r.brandName, r.promoterName, RUPTURE_SITUATION_LABEL[r.situation]]}
            page={f.page}
            hrefFor={(p) => withParams(keep, { page: p })}
          />
        ) : (
          <EmptyState title="Nenhuma ruptura neste filtro" />
        )}
      </SectionCard>
    </>
  );
}

function Ranking({ title, subtitle, rows, hrefFor }: { title: string; subtitle?: string; rows: { id: string; name: string; n: number; stores: number }[]; hrefFor: (id: string) => string | null }) {
  const max = rows[0]?.n ?? 0;
  return (
    <SectionCard title={title} subtitle={subtitle ?? "Top 10 por número de ocorrências"}>
      {rows.length ? (
        <ul className="px-5 pb-4 space-y-2.5">
          {rows.map((r) => {
            const href = hrefFor(r.id);
            return (
              <li key={r.id} className="grid grid-cols-[1fr_auto] gap-3 items-center text-[13px]">
                <span className="truncate" title={r.name}>
                  {href ? (
                    <Link href={href} target="_blank" className="hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                  <span className="text-muted text-[11.5px]"> · {r.stores} loja(s)</span>
                </span>
                <RankBar value={r.n} max={max} />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-[13.5px] text-muted">Sem dados no período.</p>
      )}
    </SectionCard>
  );
}
