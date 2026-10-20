import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, FileWarning, Plus, UserX, XCircle } from "lucide-react";
import { getScope } from "@/server/auth";
import { canManageTastings, monthRange, tastingDashboard } from "@/server/tastings";
import { shiftMonth } from "@/server/finance";
import { getDb, schema as s } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { brl, monthLabel } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { LinkButton, PageHeader } from "@/components/ui";
import { KpiCard, SectionCard } from "../_components/widgets";
import { ActionForm } from "../_components/action-form";
import { DegTabs } from "./_components/deg-tabs";
import { deleteSamplesAction, seedSamplesAction } from "./actions";

export const metadata: Metadata = { title: "Degustações" };


/** Painel exclusivo das degustações: operação e financeiro do mês (não aparece na Visão geral). */
export default async function TastingsDashboard({ searchParams }: PageProps<"/painel/degustacoes">) {
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const sp = await searchParams;
  const { from, to, month } = monthRange(typeof sp.mes === "string" ? sp.mes : null);
  const d = await tastingDashboard(scope, from, to);
  const o = d.ops;
  const f = d.fin;
  const list = (extra: Record<string, string | null>) => `/painel/degustacoes/agenda${withParams({ mes: month, view: "lista", ...extra })}`;
  const canEdit = canManageTastings(scope);
  const db = await getDb();
  const [sample] = await db.select({ id: s.tastings.id }).from(s.tastings).where(and(eq(s.tastings.agencyId, scope.agencyId), eq(s.tastings.sample, true))).limit(1);

  return (
    <>
      <DegTabs />
      <PageHeader
        title="Degustações"
        subtitle={`Painel de ${monthLabel(month)} · operação e resultado financeiro das ações`}
        actions={
          <>
            <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
              <Link href={withParams({ mes: shiftMonth(month, -1) })} aria-label="Mês anterior" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-l-lg">
                <ChevronLeft className="size-4" />
              </Link>
              <Link href="/painel/degustacoes" className="h-9 px-3 grid place-items-center text-[13px] font-semibold border-x border-line hover:bg-subtle">
                Este mês
              </Link>
              <Link href={withParams({ mes: shiftMonth(month, 1) })} aria-label="Próximo mês" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-r-lg">
                <ChevronRight className="size-4" />
              </Link>
            </div>
            {canEdit ? (
              <LinkButton href="/painel/degustacoes/nova">
                <Plus className="size-4" /> Nova degustação
              </LinkButton>
            ) : null}
          </>
        }
      />

      <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2 mb-2">Operação</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Degustações do mês" value={o.total} href={list({})} icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Confirmadas" value={o.confirmed} tone="info" href={list({ status: "confirmed" })} icon={<CalendarCheck2 className="size-4" />} />
        <KpiCard label="Aguardando confirmação" value={o.awaitingConfirmation} tone={o.awaitingConfirmation ? "warning" : "neutral"} href={list({ status: "awaiting_confirmation" })} icon={<CalendarClock className="size-4" />} />
        <KpiCard label="Sem degustadora" value={o.noTaster} tone={o.noTaster ? "danger" : "success"} href={list({ status: "awaiting_taster" })} icon={<UserX className="size-4" />} />
        <KpiCard label="Concluídas" value={o.completed} tone="success" href={list({ status: "completed" })} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Canceladas" value={o.cancelled} href={list({ status: "cancelled" })} icon={<XCircle className="size-4" />} />
        <KpiCard label="Materiais pendentes" value={o.materialsPending} tone={o.materialsPending ? "warning" : "success"} sub="Checklist ainda não concluído" href={list({ flag: "pending_materials" })} icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Documentação pendente" value={o.docsPending} tone={o.docsPending ? "warning" : "success"} href={list({ flag: "pending_docs" })} icon={<FileWarning className="size-4" />} />
      </div>

      <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2 mt-7 mb-2">Financeiro do mês</h2>
      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Previsto" subtitle="Ações programadas do mês (canceladas não entram; multa aparece à parte)" bodyClass="px-5 pb-5">
          <dl className="divide-y divide-line text-[14px]">
            <Line label="Receita prevista do mês" value={brl(f.revenuePlanned)} href={list({})} />
            <Line label="Receita das confirmadas (inclui em andamento e concluídas)" value={brl(f.revenueConfirmed)} href={list({ status: "confirmed" })} />
            <Line label="Custos previstos com degustadoras" value={`− ${brl(f.tasterCostPlanned)}`} />
            <Line label="Outros custos diretos previstos" value={`− ${brl(f.otherCostPlanned)}`} />
            <Line label="Resultado de contribuição previsto" value={brl(f.contributionPlanned)} strong />
            {f.cancellationFees ? <Line label="Multas de cancelamento registradas" value={brl(f.cancellationFees)} href={list({ status: "cancelled" })} /> : null}
          </dl>
        </SectionCard>
        <SectionCard title="Realizado" subtitle="Só o que foi registrado: nada é presumido como faturado, recebido ou pago" bodyClass="px-5 pb-5">
          <dl className="divide-y divide-line text-[14px]">
            <Line label="Resultado realizado das concluídas" value={brl(f.contributionActual)} strong href={list({ status: "completed" })} />
            <Line label="Receita realizada (concluídas)" value={brl(f.revenueActual)} />
            <Line label="Faturado para as marcas" value={brl(f.billed)} href={list({ flag: "pending_finance" })} />
            <Line label="Recebido" value={brl(f.received)} />
            <Line label="A receber" value={brl(f.toReceive)} tone={f.toReceive ? "warn" : undefined} />
            <Line label="Pago às degustadoras" value={brl(f.tasterPaid)} />
            <Line label="Pagamentos pendentes às degustadoras" value={brl(f.tasterPending)} tone={f.tasterPending ? "warn" : undefined} href={list({ flag: "pending_finance" })} />
          </dl>
        </SectionCard>
      </div>
      <p className="text-[12px] text-muted mt-3">
        Resultado de contribuição = receita − custos diretos da ação. Não é o lucro líquido da agência (ainda há despesas administrativas e gerais). O consolidado da agência fica em{" "}
        <Link href={`/painel/financeiro${withParams({ mes: month })}`} className="font-semibold text-brand-700 hover:underline">
          Financeiro
        </Link>
        .
      </p>

      {canEdit ? (
        <SectionCard title="Dados de exemplo" subtitle="Para ver como ficam a agenda e os resultados antes de cadastrar as ações reais" className="mt-7" bodyClass="px-5 pb-5">
          {sample ? (
            <>
              <p className="text-[13.5px] text-ink-2 mb-3">Há degustações e degustadoras fictícias (marcadas como “Exemplo”). Quando não precisar mais delas, apague todas de uma vez — os cadastros reais não são afetados.</p>
              <ActionForm action={deleteSamplesAction} hidden={{}} submitLabel="Apagar dados de exemplo" variant="danger" />
            </>
          ) : (
            <>
              <p className="text-[13.5px] text-ink-2 mb-3">Cria cerca de 18 degustações fictícias (mês passado, este mês e o próximo) e 6 degustadoras de exemplo, sem telefone.</p>
              <ActionForm action={seedSamplesAction} hidden={{}} submitLabel="Criar dados de exemplo" variant="secondary" />
            </>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}

function Line({ label, value, strong, href, tone }: { label: string; value: string; strong?: boolean; href?: string; tone?: "warn" }) {
  const v = <dd className={`tnum text-right ${strong ? "font-bold text-[15px]" : "font-semibold"} ${tone === "warn" ? "text-warn" : ""}`}>{value}</dd>;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className={strong ? "font-semibold" : "text-ink-2"}>{href ? <Link href={href} className="hover:underline">{label}</Link> : label}</dt>
      {v}
    </div>
  );
}
