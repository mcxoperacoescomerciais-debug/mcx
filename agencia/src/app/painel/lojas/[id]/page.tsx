import type { Metadata } from "next";
import { isUuid } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { brandFilter } from "@/server/scope";
import { listVisits } from "@/server/history";
import { ruptureList } from "@/server/analytics";
import { parseFilters, withParams } from "@/lib/filters";
import { ATTENDANCE_STATUS_TONE, ATTENDANCE_STATUS_LABEL, RUPTURE_SITUATION_LABEL, VISIT_STATUS_LABEL, VISIT_STATUS_TONE } from "@/lib/domain";
import { fmtDate, fmtTime } from "@/lib/dates";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";

export const metadata: Metadata = { title: "Loja" };

export default async function StorePage({ params, searchParams }: PageProps<"/painel/lojas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  const db = await getDb();
  const [row] = await db
    .select({ store: s.stores, chainName: s.chains.name })
    .from(s.stores)
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(and(eq(s.stores.id, id), eq(s.stores.agencyId, scope.agencyId)));
  if (!row) notFound();
  const f = { ...parseFilters(await searchParams, 30), store: id };
  const brands = await db
    .select({ id: s.brands.id, name: s.brands.name })
    .from(s.storeBrands)
    .innerJoin(s.brands, eq(s.brands.id, s.storeBrands.brandId))
    .where(and(eq(s.storeBrands.storeId, id), brandFilter(scope, s.brands.id)));
  if (scope.brandIds !== null && !brands.length) notFound();
  const [visits, ruptures] = await Promise.all([listVisits(scope, f), ruptureList(scope, f, { pageSize: 50 })]);
  const st = row.store;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/painel/visitas" className="hover:underline">Visitas</Link>}
        title={st.name}
        subtitle={`${[row.chainName, st.code ? `cód. ${st.code}` : null, st.address, st.district, `${st.city}/${st.state}`].filter(Boolean).join(" · ")} · últimos 30 dias`}
        actions={
          <LinkButton variant="secondary" href={`/api/reports/store/${id}${withParams({ from: f.from, to: f.to, brand: f.brand })}`} prefetch={false}>
            <FileDown className="size-4" /> Relatório da loja (PDF)
          </LinkButton>
        }
      />
      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-[13px] text-muted mr-1">Marcas autorizadas:</span>
        {brands.map((b) => (
          <Badge key={b.id} tone="neutral">
            {b.name}
          </Badge>
        ))}
        {st.rules ? <span className="text-[13px] text-ink-2 ml-3">Regras: {st.rules}</span> : null}
      </div>

      <SectionCard title={`Rupturas no período (${ruptures.total})`} subtitle="Produtos marcados como ruptura total">
        {ruptures.rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {ruptures.rows.map((r) => (
                <tr key={r.id} className="hover:bg-subtle">
                  <Td className="tnum">{fmtDate(r.visitDate)}</Td>
                  <Td>
                    <Link href={`/painel/atendimentos/${r.attendanceId}`} target="_blank" className="font-semibold hover:underline">
                      {r.productName}
                    </Link>
                  </Td>
                  <Td>{r.brandName}</Td>
                  <Td>{RUPTURE_SITUATION_LABEL[r.situation]}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-5 pb-5 text-[13.5px] text-muted">Nenhuma ruptura no período.</p>
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Histórico de atendimento" subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · ${visits.length} visita(s)`}>
        {visits.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Promotor</Th>
                <Th>Horário</Th>
                <Th>Marcas</Th>
                <Th align="right">Rupturas</Th>
                <Th>Visita</Th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className="hover:bg-subtle">
                  <Td className="tnum">
                    <Link href={`/painel/visitas/${v.id}`} target="_blank" className="font-semibold hover:underline">
                      {fmtDate(v.date)}
                    </Link>
                  </Td>
                  <Td>{v.promoterName}</Td>
                  <Td className="tnum whitespace-nowrap">
                    {fmtTime(v.startedAt)}–{v.finishedAt ? fmtTime(v.finishedAt) : "…"}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {v.attendances.map((a) => (
                        <Link key={a.id} href={`/painel/atendimentos/${a.id}`} target="_blank" title={ATTENDANCE_STATUS_LABEL[a.status]}>
                          <StatusBadge tone={ATTENDANCE_STATUS_TONE[a.status]} size="sm">
                            {a.brandName}
                          </StatusBadge>
                        </Link>
                      ))}
                    </div>
                  </Td>
                  <Td align="right">{v.attendances.reduce((n, a) => n + a.ruptures, 0) || "—"}</Td>
                  <Td>
                    <StatusBadge tone={VISIT_STATUS_TONE[v.status]} size="sm">
                      {VISIT_STATUS_LABEL[v.status]}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma visita no período" />
        )}
      </SectionCard>
      <p className="text-[12.5px] text-muted mt-3">
        Estoque desta loja por produto: veja{" "}
        <Link className="text-brand-700 font-semibold" href={`/painel/estoque${withParams({ store: id, from: f.from, to: f.to })}`}>
          Estoque filtrado por esta loja
        </Link>
        .
      </p>
    </>
  );
}
