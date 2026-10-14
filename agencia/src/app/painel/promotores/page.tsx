import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions, getRangeBoard, PROMOTER_STATUS_LABEL, PROMOTER_STATUS_TONE, summarizePromoters, type PromoterOpStatus } from "@/server/operations";
import { listPromoters } from "@/server/history";
import { parseDayRange, withParams } from "@/lib/filters";
import { EMPLOYMENT_LABEL } from "@/lib/domain";
import { fmtAgo, fmtDate, fmtLongDate } from "@/lib/dates";
import { matchesQuery } from "@/lib/rules";
import { EmptyState, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Promotores" };

const SORTS = { name: "Promotor", scheduled: "Lojas programadas", completed: "Concluídas", issues: "Pendências", last: "Último registro" } as const;

export default async function PromotersPage({ searchParams }: PageProps<"/painel/promotores">) {
  const scope = await getScope();
  const raw = await searchParams;
  const f = parseDayRange(raw);
  const sort = (typeof raw.sort === "string" && raw.sort in SORTS ? raw.sort : "name") as keyof typeof SORTS;
  const [board, people, options] = await Promise.all([getRangeBoard(scope, f), listPromoters(scope), filterOptions(scope)]);
  const summaries = new Map(summarizePromoters(board).map((p) => [p.promoterId, p]));
  let rows = people
    .filter((p) => p.status === "active" || summaries.has(p.id))
    .map((p) => {
      const sum = summaries.get(p.id);
      return {
        ...p,
        scheduled: sum?.scheduled ?? 0,
        started: sum?.started ?? 0,
        completed: sum?.completed ?? 0,
        attDone: sum?.attendancesDone ?? 0,
        attTotal: sum?.attendancesTotal ?? 0,
        issues: sum?.issues ?? 0,
        last: sum?.lastActivity ?? null,
        opStatus: (sum?.status ?? "no_schedule") as PromoterOpStatus,
      };
    })
    .filter((p) => matchesQuery(`${p.name} ${p.region ?? ""} ${p.internalCode ?? ""}`, f.q))
    .filter((p) => !f.promoter || p.id === f.promoter)
    .filter((p) => !f.status || p.opStatus === f.status);
  // Gestor restrito a marcas: só promotores que atuaram com essas marcas na data.
  if (scope.brandIds !== null || f.brand || f.chain || f.city || f.store) rows = rows.filter((p) => summaries.has(p.id));
  rows.sort((a, b) =>
    sort === "scheduled" ? b.scheduled - a.scheduled : sort === "completed" ? b.completed - a.completed : sort === "issues" ? b.issues - a.issues : sort === "last" ? (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) : a.name.localeCompare(b.name, "pt-BR"),
  );
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, city: f.city, q: f.q || null, status: f.status };

  return (
    <>
      <PageHeader title="Monitoramento dos promotores" subtitle={<span className="first-letter:uppercase inline-block">{f.from === f.to ? fmtLongDate(f.from) : `${fmtDate(f.from)} a ${fmtDate(f.to)}`} · situação calculada pela programação e pelos registros recebidos</span>} />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "city", "status", "q"]}
        options={{ ...options, statuses: Object.entries(PROMOTER_STATUS_LABEL).map(([id, name]) => ({ id, name })) }}
        statusLabel="Todas as situações"
        qPlaceholder="Buscar promotor ou região"
      />
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                {(["name"] as const).map((k) => (
                  <SortTh key={k} k={k} sort={sort} keep={keep} />
                ))}
                <Th>Roteiro / região</Th>
                <SortTh k="scheduled" sort={sort} keep={keep} align="right" />
                <Th align="right">Visitas iniciadas</Th>
                <SortTh k="completed" sort={sort} keep={keep} align="right" />
                <Th>Atendimentos de marca</Th>
                <SortTh k="issues" sort={sort} keep={keep} align="right" />
                <SortTh k="last" sort={sort} keep={keep} />
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-subtle">
                  <Td>
                    <Link href={`/painel/promotores/${p.id}${withParams({ from: f.from, to: f.to })}`} target="_blank" className="font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-[11.5px] text-muted">
                      {p.employment ? EMPLOYMENT_LABEL[p.employment] : ""}
                      {p.internalCode ? ` · ${p.internalCode}` : ""}
                      {p.status === "inactive" ? " · inativo" : ""}
                    </span>
                  </Td>
                  <Td className="text-ink-2">{p.region ?? "—"}</Td>
                  <Td align="right">{p.scheduled}</Td>
                  <Td align="right">{p.started}</Td>
                  <Td align="right">{p.completed}</Td>
                  <Td>
                    {p.attTotal ? (
                      <div className="flex items-center gap-2 min-w-[130px]">
                        <Progress value={p.attDone} total={p.attTotal} className="flex-1" />
                        <span className="tnum text-[12px] text-muted">
                          {p.attDone}/{p.attTotal}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>
                  <Td align="right" className={p.issues ? "text-bad font-semibold" : ""}>
                    {p.issues || "—"}
                  </Td>
                  <Td className="text-muted whitespace-nowrap">{p.last ? fmtAgo(p.last) : "—"}</Td>
                  <Td>
                    <StatusBadge tone={PROMOTER_STATUS_TONE[p.opStatus]} size="sm">
                      {PROMOTER_STATUS_LABEL[p.opStatus]}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhum promotor neste filtro" />
        )}
      </div>
      <p className="text-[12px] text-muted mt-3">
        “Com atraso” só aparece quando o horário previsto mais a tolerância ({scope.settings.lateToleranceMin} min) passou sem a visita começar. Ausência de registro recente, sozinha, não indica atraso.
      </p>
    </>
  );
}

function SortTh({ k, sort, keep, align }: { k: keyof typeof SORTS; sort: string; keep: Record<string, string | null>; align?: "right" }) {
  return (
    <Th align={align}>
      <Link href={withParams(keep, { sort: k === "name" ? null : k })} className={`inline-flex items-center gap-1 ${sort === k ? "text-ink" : ""}`}>
        {SORTS[k]}
        {sort === k ? <ArrowDown className="size-3" /> : null}
      </Link>
    </Th>
  );
}
