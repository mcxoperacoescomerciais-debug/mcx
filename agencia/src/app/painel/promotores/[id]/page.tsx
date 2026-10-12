import type { Metadata } from "next";
import { isUuid } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { canSeePromoter } from "@/server/scope";
import { getDayBoard, filterOptions, summarizePromoters, PROMOTER_STATUS_LABEL, PROMOTER_STATUS_TONE } from "@/server/operations";
import { listVisits } from "@/server/history";
import { parseFilters } from "@/lib/filters";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE, EMPLOYMENT_LABEL, STOP_BUCKET_LABEL, STOP_BUCKET_TONE, VISIT_STATUS_LABEL, VISIT_STATUS_TONE } from "@/lib/domain";
import { addDays, fmtDate, fmtLongDate, fmtTime } from "@/lib/dates";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "../../_components/filter-bar";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";

export const metadata: Metadata = { title: "Promotor" };

export default async function PromoterPage({ params, searchParams }: PageProps<"/painel/promotores/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  if (!canSeePromoter(scope, id)) notFound();
  const db = await getDb();
  const [p] = await db.select().from(s.users).where(eq(s.users.id, id));
  if (!p || p.agencyId !== scope.agencyId || p.role !== "promoter") notFound();
  const raw = await searchParams;
  const f = parseFilters(raw);
  const from = typeof raw.from === "string" ? f.from : addDays(f.date, -13);
  const to = typeof raw.to === "string" ? f.to : f.date;
  const [board, visits, options] = await Promise.all([
    getDayBoard(scope, { ...f, promoter: id }),
    listVisits(scope, { ...f, from, to, promoter: id }),
    filterOptions(scope),
  ]);
  const summary = summarizePromoters(board)[0];
  const [manager] = p.managerId ? await db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, p.managerId)) : [];

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/painel/promotores" className="hover:underline">Promotores</Link>}
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {p.name}
            {summary ? <StatusBadge tone={PROMOTER_STATUS_TONE[summary.status]}>{PROMOTER_STATUS_LABEL[summary.status]}</StatusBadge> : null}
          </span>
        }
        subtitle={[p.employment ? EMPLOYMENT_LABEL[p.employment] : null, p.region, p.internalCode, manager ? `gestor: ${manager.name}` : null, p.status === "inactive" ? "inativo" : null].filter(Boolean).join(" · ")}
      />
      <FilterBar fields={["date", "brand"]} options={options} />

      <SectionCard title={<span className="first-letter:uppercase inline-block">Roteiro de {fmtLongDate(f.date)}</span>} subtitle={summary ? `${summary.completed} de ${summary.scheduled} loja(s) concluída(s) · ${summary.attendancesDone}/${summary.attendancesTotal} marca(s)` : undefined}>
        {board.stops.length ? (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Loja</Th>
                <Th>Previsto</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Marcas</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {board.stops.map((st, i) => (
                <tr key={st.key} className="hover:bg-subtle align-top">
                  <Td className="text-muted tnum">{st.scheduleId ? i + 1 : "extra"}</Td>
                  <Td>
                    {st.visit ? (
                      <Link href={`/painel/visitas/${st.visit.id}`} className="font-semibold hover:underline">
                        {st.storeName}
                      </Link>
                    ) : (
                      <span className="font-semibold">{st.storeName}</span>
                    )}
                    <span className="block text-[11.5px] text-muted">{[st.chainName, st.city].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td className="tnum">{st.plannedStart ?? "—"}</Td>
                  <Td className="tnum">{st.visit ? fmtTime(st.visit.startedAt) : "—"}</Td>
                  <Td className="tnum">{st.visit?.finishedAt ? fmtTime(st.visit.finishedAt) : "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {[...st.plannedBrands.map((b) => b.id), ...st.attendances.map((a) => a.brandId)]
                        .filter((b, idx, arr) => arr.indexOf(b) === idx)
                        .map((b) => {
                          const a = st.attendances.find((x) => x.brandId === b);
                          const name = a?.brandName ?? st.plannedBrands.find((x) => x.id === b)?.name;
                          return a ? (
                            <Link key={b} href={`/painel/atendimentos/${a.id}`}>
                              <StatusBadge tone={ATTENDANCE_STATUS_TONE[a.status]} size="sm">
                                {name}
                              </StatusBadge>
                            </Link>
                          ) : (
                            <StatusBadge key={b} tone="neutral" size="sm">
                              {name}
                            </StatusBadge>
                          );
                        })}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge tone={STOP_BUCKET_TONE[st.bucket]} size="sm">
                      {STOP_BUCKET_LABEL[st.bucket]}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Sem programação nesta data" />
        )}
      </SectionCard>

      <SectionCard className="mt-6" title="Histórico de visitas" subtitle={`${fmtDate(from)} a ${fmtDate(to)} · ${visits.length} visita(s)`}>
        {visits.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Loja</Th>
                <Th>Horário</Th>
                <Th>Marcas atendidas</Th>
                <Th align="right">Rupturas</Th>
                <Th>Visita</Th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id} className="hover:bg-subtle">
                  <Td className="tnum whitespace-nowrap">{fmtDate(v.date)}</Td>
                  <Td>
                    <Link href={`/painel/visitas/${v.id}`} className="font-semibold hover:underline">
                      {v.storeName}
                    </Link>
                    <span className="block text-[11.5px] text-muted">{v.city}</span>
                  </Td>
                  <Td className="tnum whitespace-nowrap">
                    {fmtTime(v.startedAt)}–{v.finishedAt ? fmtTime(v.finishedAt) : "…"}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {v.attendances.map((a) => (
                        <Link key={a.id} href={`/painel/atendimentos/${a.id}`} title={ATTENDANCE_STATUS_LABEL[a.status]}>
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
    </>
  );
}
