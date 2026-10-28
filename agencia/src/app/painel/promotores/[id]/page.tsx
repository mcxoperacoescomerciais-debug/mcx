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
import { workTimes } from "@/server/work-time";
import { brandTimes } from "@/server/brand-time";
import { withParams } from "@/lib/filters";
import { fmtClock, fmtMinutes, type Stat } from "@/lib/work-time";
import { KpiCard } from "../../_components/widgets";
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
    getDayBoard(scope, { ...f, date: to, promoter: id }),
    listVisits(scope, { ...f, from, to, promoter: id }),
    filterOptions(scope),
  ]);
  const [workMap, brands] = await Promise.all([workTimes(scope, from, to, id), brandTimes(scope, { from, to, promoterId: id })]);
  const work = workMap.get(id) ?? null;
  const showAll = raw.marcas === "todas";
  const openBrand = typeof raw.marca === "string" ? brands.find((b) => b.brandId === raw.marca) ?? null : null;
  const keepPeriod = { from, to };
  const maxAvg = Math.max(1, ...brands.map((b) => b.avg ?? 0));
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
      <FilterBar range={{ from, to }} fields={["period", "brand"]} options={options} />

      <SectionCard
        title={`Tempo de trabalho · ${fmtDate(from)} a ${fmtDate(to)}`}
        subtitle="Calculado pelos horários de entrada e saída de cada loja registrados no aplicativo. Ajuste o período no filtro acima."
        className="mb-6"
        bodyClass="px-5 pb-5"
      >
        {work && work.days.length ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <KpiCard label="Horas trabalhadas" value={fmtMinutes(work.shiftMinutes)} sub={`${work.days.length} dia(s) · ${fmtMinutes(work.storeMinutes)} dentro das lojas`} />
              <KpiCard label="Tempo médio em cada loja" value={fmtMinutes(work.store.avg)} sub={`mín. ${fmtMinutes(work.store.min)} · máx. ${fmtMinutes(work.store.max)}`} />
              <KpiCard label="Tempo médio entre lojas" value={fmtMinutes(work.travel.avg)} sub={`mín. ${fmtMinutes(work.travel.min)} · máx. ${fmtMinutes(work.travel.max)}`} />
              <KpiCard label="Jornada média" value={`${fmtClock(work.start.avg)} às ${fmtClock(work.end.avg)}`} sub={`${fmtMinutes(work.shift.avg)} por dia`} tone={work.openForgotten ? "danger" : undefined} />
            </div>
            <Table className="mt-4">
              <thead>
                <tr>
                  <Th>Indicador</Th>
                  <Th align="right">Média</Th>
                  <Th align="right">Mínimo</Th>
                  <Th align="right">Máximo</Th>
                </tr>
              </thead>
              <tbody>
                <StatRow label="Tempo em cada loja" s={work.store} f={fmtMinutes} />
                <StatRow label="Tempo de uma loja a outra" s={work.travel} f={fmtMinutes} />
                <StatRow label="Horário em que pega o serviço (1ª loja)" s={work.start} f={fmtClock} />
                <StatRow label="Horário em que finaliza a última loja" s={work.end} f={fmtClock} />
                <StatRow label="Jornada do dia (1ª entrada ao fim da última loja)" s={work.shift} f={fmtMinutes} />
              </tbody>
            </Table>
            <h3 className="font-semibold text-[14px] mt-5 mb-1">Detalhado por dia</h3>
            <Table>
              <thead>
                <tr>
                  <Th>Dia</Th>
                  <Th align="right">Lojas</Th>
                  <Th align="right">Início</Th>
                  <Th align="right">Fim</Th>
                  <Th align="right">Jornada</Th>
                  <Th align="right">Em loja</Th>
                  <Th align="right">Média por loja</Th>
                  <Th align="right">Deslocamento</Th>
                  <Th align="right">Média entre lojas</Th>
                </tr>
              </thead>
              <tbody>
                {work.days.map((d) => (
                  <tr key={d.date}>
                    <Td className="whitespace-nowrap">
                      {fmtDate(d.date)}
                      {d.openForgotten ? <span className="block text-[11.5px] text-bad font-semibold">visita deixada aberta</span> : null}
                    </Td>
                    <Td align="right">{d.visits}</Td>
                    <Td align="right" className="tnum">{fmtClock(d.firstStart)}</Td>
                    <Td align="right" className="tnum">{fmtClock(d.lastEnd)}</Td>
                    <Td align="right" className="tnum font-semibold">{fmtMinutes(d.shiftMinutes || null)}</Td>
                    <Td align="right" className="tnum">{fmtMinutes(d.storeMinutes || null)}</Td>
                    <Td align="right" className="tnum">{fmtMinutes(d.avgStore)}</Td>
                    <Td align="right" className="tnum">{fmtMinutes(d.travelMinutes || null)}</Td>
                    <Td align="right" className="tnum">{fmtMinutes(d.avgTravel)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : (
          <EmptyState title="Nenhuma visita neste período" />
        )}
      </SectionCard>

      <SectionCard
        id="marcas"
        title="Tempo médio por marca"
        subtitle={`Do início ao fim do atendimento de cada marca · ${fmtDate(from)} a ${fmtDate(to)}${brands.length ? ` · ${brands.length} marca(s)` : ""}. Clique na marca para ver cada atendimento.`}
        className="mb-6"
        bodyClass="pb-2"
      >
        {brands.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th align="right">Atendimentos</Th>
                  <Th>Tempo médio</Th>
                  <Th align="right">Mínimo</Th>
                  <Th align="right">Máximo</Th>
                  <Th align="right">Tempo total</Th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? brands : brands.slice(0, 5)).map((b) => (
                  <tr key={b.brandId} className={openBrand?.brandId === b.brandId ? "bg-brand-50" : "hover:bg-subtle"}>
                    <Td>
                      <Link href={`/painel/promotores/${id}${withParams({ ...keepPeriod, marcas: showAll ? "todas" : null, marca: openBrand?.brandId === b.brandId ? null : b.brandId })}#marcas`} scroll={false} className="font-semibold text-brand-700 hover:underline">
                        {b.brandName}
                      </Link>
                    </Td>
                    <Td align="right" className="tnum">{b.n}</Td>
                    <Td>
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <span className="h-2 rounded-full bg-brand-600" style={{ width: `${Math.max(4, ((b.avg ?? 0) / maxAvg) * 100)}%`, maxWidth: 120 }} />
                        <span className="tnum font-semibold">{fmtMinutes(b.avg)}</span>
                      </div>
                    </Td>
                    <Td align="right" className="tnum">{fmtMinutes(b.min)}</Td>
                    <Td align="right" className="tnum">{fmtMinutes(b.max)}</Td>
                    <Td align="right" className="tnum">{fmtMinutes(b.totalMinutes)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {brands.length > 5 ? (
              <Link href={`/painel/promotores/${id}${withParams({ ...keepPeriod, marcas: showAll ? null : "todas", marca: openBrand?.brandId ?? null })}#marcas`} scroll={false} className="block px-5 py-2.5 text-[13px] font-semibold text-brand-700 hover:underline">
                {showAll ? "Ver só as 5 principais" : `Ver mais (todas as ${brands.length} marcas)`}
              </Link>
            ) : null}
            {openBrand ? (
              <div className="mx-5 mt-3 mb-3 rounded-xl border border-line">
                <p className="px-4 pt-3 pb-1 font-semibold text-[14px]">
                  {openBrand.brandName}: {openBrand.n} atendimento(s) · média {fmtMinutes(openBrand.avg)}
                </p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Dia</Th>
                      <Th>Loja</Th>
                      <Th align="right">Tempo na marca</Th>
                      <Th align="right">Comparado à média</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {openBrand.rows.map((r) => {
                      const diff = openBrand.avg ? r.minutes - openBrand.avg : 0;
                      return (
                        <tr key={r.attendanceId} className="hover:bg-subtle">
                          <Td className="tnum whitespace-nowrap">{fmtDate(r.date)}</Td>
                          <Td>
                            {r.storeName} <span className="text-muted">· {r.city}</span>
                          </Td>
                          <Td align="right" className="tnum font-semibold">{fmtMinutes(r.minutes)}</Td>
                          <Td align="right" className={`tnum ${diff > 10 ? "text-warn" : diff < -10 ? "text-info" : "text-muted"}`}>
                            {diff === 0 ? "na média" : `${diff > 0 ? "+" : "−"}${fmtMinutes(Math.abs(diff))}`}
                          </Td>
                          <Td align="right">
                            <Link href={`/painel/atendimentos/${r.attendanceId}`} className="text-[13px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
                              Ver atendimento →
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState title="Nenhum atendimento concluído neste período" />
        )}
      </SectionCard>

      <SectionCard title={<span className="first-letter:uppercase inline-block">Roteiro de {fmtLongDate(to)}</span>} subtitle={summary ? `${summary.completed} de ${summary.scheduled} loja(s) concluída(s) · ${summary.attendancesDone}/${summary.attendancesTotal} marca(s)` : undefined}>
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
                      <Link href={`/painel/visitas/${st.visit.id}`} target="_blank" className="font-semibold hover:underline">
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
                            <Link key={b} href={`/painel/atendimentos/${a.id}`} target="_blank">
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
                    <Link href={`/painel/visitas/${v.id}`} target="_blank" className="font-semibold hover:underline">
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
    </>
  );
}

function StatRow({ label, s, f }: { label: string; s: Stat; f: (v: number | null) => string }) {
  return (
    <tr>
      <Td>{label}</Td>
      <Td align="right" className="tnum font-semibold">{f(s.avg)}</Td>
      <Td align="right" className="tnum">{f(s.min)}</Td>
      <Td align="right" className="tnum">{f(s.max)}</Td>
    </tr>
  );
}
