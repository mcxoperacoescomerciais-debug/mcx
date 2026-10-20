import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getScope } from "@/server/auth";
import { canSeeFinance, financeOverview } from "@/server/finance";
import { brl, pct } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { todayIso } from "@/lib/dates";

import { KpiCard, SectionCard } from "../_components/widgets";
import { DreRow, DreTable, FinHeader, PctRow } from "./_components/fin-ui";

export const metadata: Metadata = { title: "Financeiro" };

/** DRE geral da empresa: promotoria + degustações, previsto × realizado. */
export default async function FinancePage({ searchParams }: PageProps<"/painel/financeiro">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const sp = await searchParams;
  const ov = await financeOverview(scope, typeof sp.mes === "string" ? sp.mes : todayIso().slice(0, 7));
  const P = ov.dre.planned;
  const R = ov.dre.realized;
  const promoRes = (x: typeof P) => x.promotoriaRevenue - x.payroll;
  const tastRes = (x: typeof P) => x.tastingRevenue - x.taxes - x.tasterCost - x.tastingOtherCosts;
  return (
    <>
      <FinHeader title="DRE geral da empresa" subtitle="promotoria + degustações, até o resultado de contribuição" month={ov.month} path="/painel/financeiro" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Receita prevista do mês" value={brl(P.revenue)} sub={`Promotoria ${brl(P.promotoriaRevenue)} · Degustações ${brl(P.tastingRevenue)}`} />
        <KpiCard label="Receita realizada até agora" value={brl(R.revenue)} tone="info" sub={`Promotoria ${brl(R.promotoriaRevenue)} (visitas feitas) · Degustações ${brl(R.tastingRevenue)}`} />
        <KpiCard label="Folha de pagamento" value={brl(ov.payroll.total)} tone="warning" sub={`${ov.payroll.people.length} promotor(es) ativo(s)${ov.payroll.withoutCost ? ` · ${ov.payroll.withoutCost} sem custo informado` : ""}`} href={`/painel/financeiro/promotoria${withParams({ mes: ov.month })}#folha`} />
        <KpiCard label="Resultado previsto" value={brl(P.contribution)} tone={P.contribution >= 0 ? "success" : "danger"} sub={`Margem ${pct(P.margin)} · realizado ${brl(R.contribution)}`} />
      </div>


      <div className="grid xl:grid-cols-5 gap-6 mt-6">
        <SectionCard className="xl:col-span-3" title="DRE geral do mês" subtitle="Previsto (meta cheia e ações programadas) × realizado (visitas feitas e ações concluídas)" bodyClass="px-5 pb-5">
          <DreTable>
            <DreRow label="Receita de promotoria (VR ATEND)" p={P.promotoriaRevenue} r={R.promotoriaRevenue} />
            <DreRow label="Receita de degustações" p={P.tastingRevenue} r={R.tastingRevenue} />
            <DreRow label="Receita bruta" p={P.revenue} r={R.revenue} strong />
            <DreRow label="(−) Impostos e deduções informados" p={-P.taxes} r={-R.taxes} />
            <DreRow label="(−) Folha de pagamento dos promotores" p={-P.payroll} r={-R.payroll} />
            <DreRow label="(−) Degustadoras" p={-P.tasterCost} r={-R.tasterCost} />
            <DreRow label="(−) Outros custos diretos das degustações" p={-P.tastingOtherCosts} r={-R.tastingOtherCosts} />
            <DreRow label="Resultado de contribuição" p={P.contribution} r={R.contribution} strong />
            <PctRow label="Margem de contribuição" p={pct(P.margin)} r={pct(R.margin)} />
          </DreTable>
          <p className="text-[12px] text-muted mt-3 flex gap-1.5">
            <Info className="size-4 shrink-0" /> Não é o lucro líquido: faltam as despesas administrativas e gerais da agência.
          </p>
        </SectionCard>
        <div className="xl:col-span-2 grid gap-4 content-start">
          <SectionCard title="Resultado por área" bodyClass="px-5 pb-5">
            <DreTable>
              <DreRow label="Promotoria" p={promoRes(P)} r={promoRes(R)} />
              <DreRow label="Degustações" p={tastRes(P)} r={tastRes(R)} />
            </DreTable>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold">
              <Link href={`/painel/financeiro/promotoria${withParams({ mes: ov.month })}`} className="text-brand-700 hover:underline">DRE promotoria →</Link>
              <Link href={`/painel/financeiro/degustacoes${withParams({ mes: ov.month })}`} className="text-brand-700 hover:underline">DRE degustações →</Link>
              <Link href="/painel/financeiro/estrategico" className="text-brand-700 hover:underline">Visão estratégica por marca →</Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
