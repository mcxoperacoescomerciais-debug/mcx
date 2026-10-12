import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions, getDayBoard } from "@/server/operations";
import { parseFilters, withParams } from "@/lib/filters";
import { STOP_BUCKET_LABEL, STOP_BUCKET_TONE, STOP_BUCKETS } from "@/lib/domain";
import { fmtLongDate, fmtTime } from "@/lib/dates";
import { matchesQuery } from "@/lib/rules";
import { EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Visitas" };

/**
 * Relatório de visitas: uma linha por loja programada (ou visita extraordinária)
 * no dia. A visita é ao supermercado; o atendimento é por marca — por isso as
 * colunas de marcas previstas × atendidas.
 */
export default async function VisitsPage({ searchParams }: PageProps<"/painel/visitas">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const [board, options] = await Promise.all([getDayBoard(scope, f), filterOptions(scope)]);
  const stops = board.stops
    .filter((st) => !f.status || (f.status === "open" ? ["pending", "late", "missed"].includes(st.bucket) : f.status === "completed" ? st.bucket === "completed" || st.bucket === "exception" : st.bucket === f.status))
    .filter((st) => !f.store || st.storeId === f.store)
    .filter((st) => matchesQuery(`${st.storeName} ${st.chainName ?? ""} ${st.city} ${st.promoterName}`, f.q));

  return (
    <>
      <PageHeader
        title="Visitas"
        subtitle={<span className="first-letter:uppercase inline-block">{fmtLongDate(f.date)} · {stops.length} de {board.stops.length} visita(s) · cada visita reúne os atendimentos das marcas na loja</span>}
        actions={
          <LinkButton variant="secondary" href={`/api/export/stores${withParams({ date: f.date, brand: f.brand, chain: f.chain, promoter: f.promoter, city: f.city })}`} prefetch={false}>
            <FileDown className="size-4" /> Exportar (Excel)
          </LinkButton>
        }
      />
      <FilterBar
        fields={["date", "promoter", "city", "chain", "store", "status", "q"]}
        options={{ ...options, statuses: [{ id: "open", name: "Pendentes, atrasadas ou não realizadas" }, ...STOP_BUCKETS.map((b) => ({ id: b, name: STOP_BUCKET_LABEL[b] }))] }}
        statusLabel="Todas as situações"
        qPlaceholder="Buscar loja, rede ou promotor"
      />
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        {stops.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th>Promotor</Th>
                <Th>Horário</Th>
                <Th>Situação</Th>
                <Th align="right">Marcas previstas</Th>
                <Th align="right">Marcas atendidas</Th>
                <Th align="right">Pendências</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {stops.map((st) => (
                <tr key={st.key} className="hover:bg-subtle">
                  <Td>
                    <span className="font-semibold">{st.storeName}</span>
                    <span className="block text-[11.5px] text-muted">
                      {[st.chainName, st.city].filter(Boolean).join(" · ")}
                      {!st.scheduleId ? " · extraordinária" : ""}
                    </span>
                  </Td>
                  <Td>
                    <Link href={`/painel/promotores/${st.promoterId}?date=${st.date}`} className="hover:underline">
                      {st.promoterName}
                    </Link>
                  </Td>
                  <Td className="tnum whitespace-nowrap">
                    <span className="block">Previsto {st.plannedStart ?? "—"}</span>
                    <span className="block text-[12px] text-muted">
                      {st.visit ? `${fmtTime(st.visit.startedAt)} – ${st.visit.finishedAt ? fmtTime(st.visit.finishedAt) : "em andamento"}` : "não iniciada"}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge tone={STOP_BUCKET_TONE[st.bucket]} size="sm">
                      {STOP_BUCKET_LABEL[st.bucket]}
                    </StatusBadge>
                  </Td>
                  <Td align="right">{st.brandsTotal}</Td>
                  <Td align="right" className={st.brandsDone < st.brandsTotal && st.visit ? "text-warn font-semibold" : ""}>
                    {st.brandsDone}
                  </Td>
                  <Td align="right" className={st.issues ? "text-bad font-semibold" : ""}>
                    {st.issues || "—"}
                  </Td>
                  <Td align="right">
                    <Link
                      href={st.visit ? `/painel/visitas/${st.visit.id}` : `/painel/lojas/${st.storeId}`}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap"
                    >
                      {st.visit ? "Detalhes" : "Loja"} <ArrowRight className="size-3.5" />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma visita neste filtro" />
        )}
      </div>
    </>
  );
}
