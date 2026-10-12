import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions, getDayBoard } from "@/server/operations";
import { parseFilters, withParams } from "@/lib/filters";
import { STOP_BUCKET_LABEL, STOP_BUCKET_TONE, STOP_BUCKETS } from "@/lib/domain";
import { fmtLongDate, fmtTime } from "@/lib/dates";
import { matchesQuery } from "@/lib/rules";
import { EmptyState, LinkButton, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Lojas" };

export default async function StoresMonitorPage({ searchParams }: PageProps<"/painel/lojas">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const [board, options] = await Promise.all([getDayBoard(scope, f), filterOptions(scope)]);
  const stops = board.stops
    .filter((st) => !f.status || (f.status === "open" ? ["pending", "late", "missed"].includes(st.bucket) : f.status === "completed" ? st.bucket === "completed" || st.bucket === "exception" : st.bucket === f.status))
    .filter((st) => matchesQuery(`${st.storeName} ${st.chainName ?? ""} ${st.city} ${st.promoterName}`, f.q));

  return (
    <>
      <PageHeader
        title="Monitoramento das lojas"
        subtitle={<span className="first-letter:uppercase inline-block">{fmtLongDate(f.date)} · {stops.length} de {board.stops.length} loja(s)</span>}
        actions={
          <LinkButton variant="secondary" href={`/api/export/stores${withParams({ date: f.date, brand: f.brand, chain: f.chain, promoter: f.promoter, city: f.city })}`} prefetch={false}>
            <FileDown className="size-4" /> Exportar (Excel)
          </LinkButton>
        }
      />
      <FilterBar
        fields={["date", "brand", "chain", "city", "promoter", "status", "q"]}
        options={{ ...options, statuses: [{ id: "open", name: "Pendentes/atrasadas/não realizadas" }, ...STOP_BUCKETS.map((b) => ({ id: b, name: STOP_BUCKET_LABEL[b] }))] }}
        statusLabel="Todas as situações"
        qPlaceholder="Buscar loja, rede ou cidade"
      />
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        {stops.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th>Rede</Th>
                <Th>Cidade</Th>
                <Th>Promotor</Th>
                <Th>Marcas previstas</Th>
                <Th>Progresso</Th>
                <Th>Previsto</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Situação</Th>
                <Th align="right">Pendências</Th>
              </tr>
            </thead>
            <tbody>
              {stops.map((st) => (
                <tr key={st.key} className="hover:bg-subtle">
                  <Td>
                    <Link href={st.visit ? `/painel/visitas/${st.visit.id}` : `/painel/lojas/${st.storeId}`} className="font-semibold hover:underline">
                      {st.storeName}
                    </Link>
                    {!st.scheduleId ? <span className="block text-[11px] text-muted">extraordinária</span> : null}
                  </Td>
                  <Td>{st.chainName ?? "—"}</Td>
                  <Td>{st.city}</Td>
                  <Td>
                    <Link href={`/painel/promotores/${st.promoterId}?date=${st.date}`} className="hover:underline">
                      {st.promoterName}
                    </Link>
                  </Td>
                  <Td className="max-w-[220px]">
                    <span className="text-[12.5px] text-ink-2">{st.plannedBrands.map((b) => b.name).join(", ") || "—"}</span>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2 min-w-[110px]">
                      <Progress value={st.brandsDone} total={st.brandsTotal} className="flex-1" tone={st.bucket === "in_progress" ? "info" : "success"} />
                      <span className="tnum text-[12px] text-muted">
                        {st.brandsDone}/{st.brandsTotal}
                      </span>
                    </div>
                  </Td>
                  <Td className="tnum">{st.plannedStart ?? "—"}</Td>
                  <Td className="tnum">{st.visit ? fmtTime(st.visit.startedAt) : "—"}</Td>
                  <Td className="tnum">{st.visit?.finishedAt ? fmtTime(st.visit.finishedAt) : "—"}</Td>
                  <Td>
                    <StatusBadge tone={STOP_BUCKET_TONE[st.bucket]} size="sm">
                      {STOP_BUCKET_LABEL[st.bucket]}
                    </StatusBadge>
                  </Td>
                  <Td align="right" className={st.issues ? "text-bad font-semibold" : ""}>
                    {st.issues || "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma loja neste filtro" />
        )}
      </div>
    </>
  );
}
