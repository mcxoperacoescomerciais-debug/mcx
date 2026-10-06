import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { getScope } from "@/server/auth";
import { getWeeklyReport, reportTitle } from "@/server/weekly-report";
import { formatIsoBr } from "@/lib/validity";
import { buttonClass, PageHeader } from "@/components/ui";
import { SeverityChart, TrendChart } from "../../_components/charts";
import { HealthBadge, InsightList, KpiCard, SectionCard } from "../../_components/widgets";

export const metadata: Metadata = { title: "Relatório" };

export default async function ReportPage({ params }: PageProps<"/painel/relatorios/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const report = await getWeeklyReport(scope, id);
  if (!report) notFound();
  const d = report.data;
  const k = d.kpis;
  const p = d.previousKpis;

  return (
    <>
      <PageHeader
        title={`${reportTitle(d)} · ${formatIsoBr(d.period.start)} a ${formatIsoBr(d.period.end)}`}
        subtitle={`${d.clientName} · snapshot gerado em ${report.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · comparação com ${formatIsoBr(d.previous.start)} a ${formatIsoBr(d.previous.end)}`}
        actions={
          <>
            <Link href="/painel/relatorios" className={buttonClass("ghost")}>
              Todos os relatórios
            </Link>
            <a href={`/api/weekly-reports/${id}/pdf?inline=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <FileText className="size-4" /> Ver PDF
            </a>
            <a href={`/api/weekly-reports/${id}/pdf`} className={buttonClass("primary")}>
              <Download className="size-4" /> Baixar PDF executivo
            </a>
          </>
        }
      />
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Visitas realizadas" value={k.visits} previous={p.visits} invert={false} />
        <KpiCard label="Lojas visitadas" value={k.storesVisited} previous={p.storesVisited} invert={false} />
        <KpiCard label="Próx. ao vencimento" value={k.nearExpiry} previous={p.nearExpiry} />
        <KpiCard label="Vencidos" value={k.expired} previous={p.expired} tone="critical" />
        <KpiCard label="Rupturas" value={k.ruptures} previous={p.ruptures} />
        <KpiCard label="Avarias" value={k.damages} previous={p.damages} />
      </section>

      <div className="grid gap-4 mt-4 xl:grid-cols-2">
        <SectionCard title="Principais insights">
          <InsightList insights={d.insights.map((i, n) => ({ id: String(n), tone: i.tone as "info", text: i.text, priority: 0 }))} limit={10} />
        </SectionCard>
        <SectionCard title="Recomendações">
          {d.recommendations.length ? (
            <ol className="px-5 pb-5 space-y-2 list-decimal list-inside text-[13.5px]">
              {d.recommendations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Operação dentro do esperado.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 mt-4 xl:grid-cols-2">
        <SectionCard title="Itens por faixa de validade">
          <div className="px-3 pb-3">
            <SeverityChart data={d.severity} />
          </div>
        </SectionCard>
        <SectionCard title="Ocorrências por dia">
          <div className="px-3 pb-3">
            <TrendChart data={d.daily} />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 mt-4 xl:grid-cols-2">
        <SectionCard title="Top 10 produtos próximos ao vencimento">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
                <th className="font-semibold px-5 py-2">Produto</th>
                <th className="font-semibold px-3 py-2 text-right">Quantidade</th>
                <th className="font-semibold px-3 py-2 text-right">Lojas</th>
                <th className="font-semibold px-5 py-2 text-right">Menor validade</th>
              </tr>
            </thead>
            <tbody>
              {d.topProducts.map((x) => (
                <tr key={x.productId} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 font-semibold">{x.name}</td>
                  <td className="px-3 text-right tnum">{x.units} un</td>
                  <td className="px-3 text-right tnum">{x.stores}</td>
                  <td className="px-5 text-right tnum">{formatIsoBr(x.minExpiry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
        <SectionCard title="Top 10 lojas mais críticas">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
                <th className="font-semibold px-5 py-2">Loja</th>
                <th className="font-semibold px-3 py-2">Cidade</th>
                <th className="font-semibold px-3 py-2 text-right">Ocorrências</th>
                <th className="font-semibold px-3 py-2 text-right">Índice</th>
                <th className="font-semibold px-5 py-2">Situação</th>
              </tr>
            </thead>
            <tbody>
              {d.topStores.map((x) => (
                <tr key={x.storeId} className="border-b border-line last:border-0">
                  <td className="px-5 py-2 font-semibold">{x.name}</td>
                  <td className="px-3">{x.city}</td>
                  <td className="px-3 text-right tnum">{x.occurrences}</td>
                  <td className="px-3 text-right tnum font-bold">{x.index}</td>
                  <td className="px-5">
                    <HealthBadge health={x.health} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title={`Produtos vencidos · ${d.expired.length}`}>
          {d.expired.length ? (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
                  <th className="font-semibold px-5 py-2">Produto</th>
                  <th className="font-semibold px-3 py-2">Loja</th>
                  <th className="font-semibold px-3 py-2 text-right">Qtd</th>
                  <th className="font-semibold px-3 py-2">Validade</th>
                  <th className="font-semibold px-5 py-2">Visita</th>
                </tr>
              </thead>
              <tbody>
                {d.expired.map((x, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-5 py-2 font-semibold">{x.product}</td>
                    <td className="px-3">{x.store}</td>
                    <td className="px-3 text-right tnum">
                      {x.quantity} {x.unit}
                    </td>
                    <td className="px-3 tnum text-[#B42318] font-semibold">{formatIsoBr(x.expiryDate)}</td>
                    <td className="px-5 tnum">{formatIsoBr(x.visitDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Nenhum produto vencido na semana.</p>
          )}
        </SectionCard>
      </div>
    </>
  );
}
