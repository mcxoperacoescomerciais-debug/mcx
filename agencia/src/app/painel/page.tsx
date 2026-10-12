import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileDown,
  Map as MapIcon,
  PackageSearch,
  PlayCircle,
  ShieldAlert,
  Store,
  Tags,
  Users,
} from "lucide-react";
import { getScope } from "@/server/auth";
import { getDayBoard } from "@/server/operations";
import { listIssues } from "@/server/issues";
import { parseFilters, withParams } from "@/lib/filters";
import { fmtAgo, fmtLongDate, fmtTime, todayIso } from "@/lib/dates";
import { pct } from "@/lib/rules";
import { ISSUE_KIND_LABEL } from "@/lib/domain";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { FilterBar } from "./_components/filter-bar";
import { KpiCard, SectionCard } from "./_components/widgets";

export const metadata: Metadata = { title: "Visão geral" };

/** Relatórios independentes — cada um abre a própria página, com os próprios filtros. */
const REPORTS = [
  { href: "/painel/mapa", label: "Mapa operacional", text: "Lojas no mapa com a situação do dia", icon: MapIcon },
  { href: "/painel/visitas", label: "Visitas", text: "Lojas programadas, horários e situação", icon: Store },
  { href: "/painel/marcas", label: "Atendimentos por marca", text: "Execução de cada marca no período", icon: Tags },
  { href: "/painel/fotos", label: "Relatório fotográfico", text: "Antes e depois de cada atendimento", icon: Camera },
  { href: "/painel/estoque", label: "Estoque e ruptura", text: "Estoque, ruptura, validade e avaria", icon: PackageSearch },
  { href: "/painel/promotores", label: "Promotores", text: "Roteiro e histórico de cada profissional", icon: Users },
  { href: "/painel/pendencias", label: "Central de pendências", text: "O que exige ação, por prioridade", icon: ShieldAlert },
] as const;

export default async function OverviewPage({ searchParams }: PageProps<"/painel">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const day = { ...f, brand: null, chain: null, store: null, promoter: null, city: null };
  const [board, issues] = await Promise.all([getDayBoard(scope, day), listIssues(scope, { ...day, from: f.date, to: f.date })]);
  const k = board.kpis;
  const dateQs = (extra: Record<string, string | null> = {}) => withParams({ date: f.date === todayIso() ? null : f.date }, extra);
  const unreviewed = issues.filter((i) => !i.review).length;

  return (
    <>
      <PageHeader
        eyebrow={scope.agencyName}
        title="Visão geral"
        subtitle={
          <>
            <span className="first-letter:uppercase inline-block">{fmtLongDate(f.date)}</span> · dados de {fmtTime(board.generatedAt)}
            {board.lastSyncAt ? ` · último registro recebido ${fmtAgo(board.lastSyncAt)}` : " · nenhum registro recebido nesta data"}
          </>
        }
        actions={
          <>
            <LinkButton variant="secondary" href={`/api/reports/daily${withParams({ date: f.date, format: "pdf" })}`} prefetch={false}>
              <FileDown className="size-4" /> Relatório do dia (PDF)
            </LinkButton>
            <LinkButton variant="secondary" href={`/api/reports/daily${withParams({ date: f.date, format: "xlsx" })}`} prefetch={false}>
              <FileDown className="size-4" /> Excel
            </LinkButton>
          </>
        }
      />
      <FilterBar fields={["date"]} options={{}} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Lojas concluídas"
          value={
            <>
              {k.storesCompleted}
              <span className="text-[16px] font-medium text-muted"> de {k.storesScheduled}</span>
            </>
          }
          tone="success"
          sub={`${pct(k.storesCompleted, k.storesScheduled) ?? "—"}% do programado${k.storesWithException ? ` · ${k.storesWithException} com exceção` : ""}`}
          href={`/painel/visitas${dateQs({ status: "completed" })}`}
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard label="Em andamento" value={k.visitsInProgress} tone="info" sub="Visitas iniciadas e não encerradas" href={`/painel/visitas${dateQs({ status: "in_progress" })}`} icon={<PlayCircle className="size-4" />} />
        <KpiCard
          label="Pendentes ou atrasadas"
          value={k.storesPendingOrLate}
          tone={k.storesLate + k.storesMissed ? "danger" : "neutral"}
          sub={`${k.storesLate} atrasada(s) · ${k.storesMissed} não realizada(s)`}
          href={`/painel/visitas${dateQs({ status: "open" })}`}
          icon={<AlertTriangle className="size-4" />}
        />
        <KpiCard
          label="Pendências abertas"
          value={issues.length}
          tone={issues.length ? "warning" : "success"}
          sub={issues.length ? `${unreviewed} ainda não analisada(s)` : "Nada exige ação"}
          href={`/painel/pendencias${withParams({ from: f.date, to: f.date })}`}
          icon={<ShieldAlert className="size-4" />}
        />
      </div>

      <div className="grid xl:grid-cols-5 gap-6 mt-6">
        <SectionCard
          className="xl:col-span-3"
          title="Pendências prioritárias"
          subtitle="As mais urgentes do dia"
          action={
            <Link href={`/painel/pendencias${withParams({ from: f.date, to: f.date })}`} className="text-[13px] font-semibold text-brand-700 inline-flex items-center gap-1">
              Ver todas <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {issues.length ? (
            <ul className="divide-y divide-line border-t border-line">
              {issues.slice(0, 5).map((i) => (
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
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CheckCircle2 className="size-8 text-ok" />} title="Nenhuma pendência nesta data" />
          )}
        </SectionCard>

        <SectionCard className="xl:col-span-2" title="Relatórios" subtitle="Escolha o que deseja analisar" bodyClass="px-3 pb-3">
          <ul className="grid gap-1">
            {REPORTS.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.href}>
                  <Link href={`${r.href}${r.href === "/painel/pendencias" ? withParams({ from: f.date, to: f.date }) : dateQs()}`} className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-subtle">
                    <span className="size-9 rounded-lg bg-brand-50 text-brand-800 grid place-items-center shrink-0">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{r.label}</span>
                      <span className="block text-[12px] text-muted truncate">{r.text}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
