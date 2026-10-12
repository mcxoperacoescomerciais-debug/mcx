import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Camera, CheckCircle2, ClipboardCheck, FileDown, PackageX, PlayCircle, Store, Users } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions, getDayBoard, PROMOTER_STATUS_LABEL, PROMOTER_STATUS_TONE, summarizePromoters } from "@/server/operations";
import { listIssues } from "@/server/issues";
import { parseFilters, withParams } from "@/lib/filters";
import { fmtAgo, fmtLongDate, fmtTime, todayIso } from "@/lib/dates";
import { pct } from "@/lib/rules";
import { ISSUE_KIND_LABEL, STOP_BUCKET_LABEL, STOP_BUCKET_TONE } from "@/lib/domain";
import { Badge, LinkButton, PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { FilterBar } from "./_components/filter-bar";
import { DayProgress, KpiCard, SectionCard, Table, Td, Th } from "./_components/widgets";

export const metadata: Metadata = { title: "Painel do dia" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const [board, options, issues] = await Promise.all([
    getDayBoard(scope, f),
    filterOptions(scope),
    listIssues(scope, { ...f, from: f.date, to: f.date }),
  ]);
  const promoters = summarizePromoters(board);
  const k = board.kpis;
  const keep = { date: f.date === todayIso() ? null : f.date, brand: f.brand, chain: f.chain, promoter: f.promoter, city: f.city, store: f.store };
  const dayQs = (extra: Record<string, string | null> = {}) => withParams(keep, extra);
  const attention = board.stops.filter((st) => st.bucket === "late" || st.bucket === "exception" || st.bucket === "missed" || st.issues > 0).slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow={scope.agencyName}
        title="Painel do dia"
        subtitle={
          <>
            <span className="first-letter:uppercase inline-block">{fmtLongDate(f.date)}</span> · dados de {fmtTime(board.generatedAt)}
            {board.lastSyncAt ? ` · último registro recebido ${fmtAgo(board.lastSyncAt)}` : " · nenhum registro recebido nesta data"}
          </>
        }
        actions={
          <>
            <LinkButton variant="secondary" href={`/api/reports/daily${dayQs({ date: f.date, format: "pdf" })}`} prefetch={false}>
              <FileDown className="size-4" /> Relatório do dia (PDF)
            </LinkButton>
            <LinkButton variant="secondary" href={`/api/reports/daily${dayQs({ date: f.date, format: "xlsx" })}`} prefetch={false}>
              <FileDown className="size-4" /> Excel
            </LinkButton>
          </>
        }
      />
      <FilterBar fields={["date", "brand", "chain", "promoter", "city"]} options={options} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Promotores programados" value={k.promotersScheduled} sub={`${k.promotersActive} com atividade registrada`} href={`/painel/promotores${dayQs()}`} icon={<Users className="size-4" />} />
        <KpiCard label="Lojas programadas" value={k.storesScheduled} sub={k.extraVisits ? `+${k.extraVisits} visita(s) extraordinária(s)` : "Sem visitas extraordinárias"} href={`/painel/lojas${dayQs()}`} icon={<Store className="size-4" />} />
        <KpiCard
          label="Lojas concluídas"
          value={k.storesCompleted}
          tone="success"
          sub={`${pct(k.storesCompleted, k.storesScheduled) ?? "—"}% de ${k.storesScheduled} · ${k.storesWithException} com exceção`}
          href={`/painel/lojas${dayQs({ status: "completed" })}`}
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard label="Visitas em andamento" value={k.visitsInProgress} tone="info" sub="Iniciadas e não encerradas" href={`/painel/lojas${dayQs({ status: "in_progress" })}`} icon={<PlayCircle className="size-4" />} />
        <KpiCard
          label="Pendentes ou atrasadas"
          value={k.storesPendingOrLate}
          tone={k.storesLate + k.storesMissed ? "danger" : "neutral"}
          sub={`${k.storesLate} atrasada(s) · ${k.storesMissed} não realizada(s)`}
          href={`/painel/lojas${dayQs({ status: "open" })}`}
          icon={<AlertTriangle className="size-4" />}
        />
        <KpiCard label="Atendimentos de marca concluídos" value={k.attendancesCompleted} sub={`de ${k.attendancesPlanned} marca(s) previstas`} href={`/painel/lojas${dayQs()}`} icon={<ClipboardCheck className="size-4" />} />
        <KpiCard label="Atendimentos com pendência" value={k.attendancesWithIssues} tone={k.attendancesWithIssues ? "warning" : "neutral"} sub="Correção, exceção, reprovação ou foto não sincronizada" href={`/painel/pendencias${withParams(keep, { from: f.date, to: f.date })}`} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Registros com fotos incompletas" value={k.photosIncomplete} tone={k.photosIncomplete ? "warning" : "neutral"} sub="Sem antes/depois ou aguardando envio" href={`/painel/fotos${withParams(keep, { from: f.date, to: f.date, status: "incomplete" })}`} icon={<Camera className="size-4" />} />
        <KpiCard label="Produtos com ruptura" value={k.ruptureProducts} tone={k.ruptureProducts ? "danger" : "neutral"} sub={`${k.ruptureCount} registro(s) de ruptura no dia`} href={`/painel/rupturas${withParams(keep, { from: f.date, to: f.date })}`} icon={<PackageX className="size-4" />} />
        <KpiCard label="Pendências abertas" value={issues.length} tone={issues.length ? "danger" : "success"} sub={`${issues.filter((i) => !i.review).length} ainda não analisada(s)`} href={`/painel/pendencias${withParams(keep, { from: f.date, to: f.date })}`} icon={<AlertTriangle className="size-4" />} />
      </div>

      <SectionCard className="mt-6" title="Progresso da operação" subtitle={`${board.stops.length} loja(s) no dia — cada uma contada em um único grupo`} bodyClass="px-5 pb-5">
        <DayProgress buckets={board.buckets} total={board.stops.length} hrefFor={(b) => `/painel/lojas${dayQs({ status: b })}`} />
      </SectionCard>

      <div className="grid xl:grid-cols-5 gap-6 mt-6">
        <SectionCard
          className="xl:col-span-3"
          title="O que precisa ser resolvido"
          subtitle="Pendências do dia, por prioridade"
          action={
            <Link href={`/painel/pendencias${withParams(keep, { from: f.date, to: f.date })}`} className="text-[13px] font-semibold text-brand-700 inline-flex items-center gap-1">
              Central de pendências <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {issues.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {issues.slice(0, 8).map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className="flex items-start gap-3 px-5 py-3 hover:bg-subtle">
                    <Badge tone={i.priority <= 2 ? "danger" : i.priority <= 4 ? "warning" : "neutral"} className="mt-0.5 shrink-0">
                      {ISSUE_KIND_LABEL[i.kind]}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold truncate">{i.title}</p>
                      <p className="text-[12.5px] text-muted truncate">
                        {i.storeName}
                        {i.brandName ? ` · ${i.brandName}` : ""} · {i.promoterName}
                      </p>
                    </div>
                    {i.review ? <StatusBadge tone="info" size="sm">Analisada</StatusBadge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CheckCircle2 className="size-8 text-ok" />} title="Nenhuma pendência nesta data">
              Fotos, estoque, correções e visitas estão em dia para os filtros escolhidos.
            </EmptyState>
          )}
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title="Promotores"
          subtitle="Situação a partir da programação e dos registros recebidos"
          action={
            <Link href={`/painel/promotores${dayQs()}`} className="text-[13px] font-semibold text-brand-700 inline-flex items-center gap-1">
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {promoters.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Promotor</Th>
                  <Th align="right">Lojas</Th>
                  <Th>Situação</Th>
                  <Th>Último registro</Th>
                </tr>
              </thead>
              <tbody>
                {promoters.map((p) => (
                  <tr key={p.promoterId} className="hover:bg-subtle">
                    <Td>
                      <Link href={`/painel/promotores/${p.promoterId}${dayQs()}`} className="font-semibold hover:underline">
                        {p.name}
                      </Link>
                    </Td>
                    <Td align="right">
                      {p.completed}/{p.scheduled}
                    </Td>
                    <Td>
                      <StatusBadge tone={PROMOTER_STATUS_TONE[p.status]} size="sm">
                        {PROMOTER_STATUS_LABEL[p.status]}
                      </StatusBadge>
                    </Td>
                    <Td className="text-muted whitespace-nowrap">{p.lastActivity ? fmtAgo(p.lastActivity) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhuma programação nesta data">Cadastre a programação em Operação › Programação.</EmptyState>
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="mt-6"
        title="Lojas que exigem atenção"
        subtitle="Atrasadas, não realizadas, com exceção ou com pendência de registro"
        action={
          <Link href={`/painel/lojas${dayQs()}`} className="text-[13px] font-semibold text-brand-700 inline-flex items-center gap-1">
            Monitor de lojas <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        {attention.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th>Promotor</Th>
                <Th>Previsto</Th>
                <Th>Marcas</Th>
                <Th>Situação</Th>
                <Th align="right">Pendências</Th>
              </tr>
            </thead>
            <tbody>
              {attention.map((st) => (
                <tr key={st.key} className="hover:bg-subtle">
                  <Td>
                    {st.visit ? (
                      <Link href={`/painel/visitas/${st.visit.id}`} className="font-semibold hover:underline">
                        {st.storeName}
                      </Link>
                    ) : (
                      <span className="font-semibold">{st.storeName}</span>
                    )}
                    <span className="block text-[12px] text-muted">{[st.chainName, st.city].filter(Boolean).join(" · ")}</span>
                  </Td>
                  <Td>{st.promoterName}</Td>
                  <Td className="tnum">{st.plannedStart ?? "—"}</Td>
                  <Td className="tnum">
                    {st.brandsDone}/{st.brandsTotal}
                  </Td>
                  <Td>
                    <StatusBadge tone={STOP_BUCKET_TONE[st.bucket]} size="sm">
                      {STOP_BUCKET_LABEL[st.bucket]}
                    </StatusBadge>
                  </Td>
                  <Td align="right">{st.issues || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<CheckCircle2 className="size-8 text-ok" />} title="Nenhuma loja exige atenção agora" />
        )}
      </SectionCard>
    </>
  );
}
