import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileBarChart2 } from "lucide-react";
import { getScope, getSessionUser, STAFF_ROLES } from "@/server/auth";
import { listWeeklyReports, previousWeek, type WeeklyReportData } from "@/server/weekly-report";
import { formatIsoBr } from "@/lib/validity";
import { Badge, Button, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { FormNotice } from "../_components/form";
import { generateReportAction } from "./actions";

export const metadata: Metadata = { title: "Relatórios" };

export default async function ReportsPage({ searchParams }: PageProps<"/painel/relatorios">) {
  const scope = await getScope();
  const user = await getSessionUser();
  const sp = await searchParams;
  const canGenerate = Boolean(user && STAFF_ROLES.includes(user.role));
  const reports = await listWeeklyReports(scope);
  const last = previousWeek();
  const dateClass = "h-10 rounded-lg border border-line-strong px-3 text-[13px] bg-surface";

  return (
    <>
      <PageHeader title="Relatórios" subtitle="Escolha o período e gere o relatório executivo (tela + PDF) para enviar ao gestor da SUINCO. A comparação é com o período anterior de mesmo tamanho." />
      {canGenerate ? (
        <Card className="p-4 mb-4">
          <form action={generateReportAction} className="flex flex-wrap items-end gap-3">
            <label>
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">De</span>
              <input type="date" name="de" defaultValue={last.start} required className={dateClass} />
            </label>
            <label>
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Até</span>
              <input type="date" name="ate" defaultValue={last.end} required className={dateClass} />
            </label>
            <Button type="submit">
              <FileBarChart2 className="size-4" /> Gerar relatório
            </Button>
            <span className="text-[12.5px] text-muted">Já vem preenchido com a semana anterior (segunda a domingo).</span>
          </form>
          <div className="mt-3">
            <FormNotice error={sp.erro as string | undefined} />
          </div>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        {reports.length ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
                <th className="font-semibold px-5 py-2.5">Período</th>
                <th className="font-semibold px-3 py-2.5 text-right">Visitas</th>
                <th className="font-semibold px-3 py-2.5 text-right">Próx. venc.</th>
                <th className="font-semibold px-3 py-2.5 text-right">Vencidos</th>
                <th className="font-semibold px-3 py-2.5 text-right">Rupturas</th>
                <th className="font-semibold px-3 py-2.5 text-right">Avarias</th>
                <th className="font-semibold px-3 py-2.5">Gerado</th>
                <th className="font-semibold px-5 py-2.5 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const d = r.data as WeeklyReportData;
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
                    <td className="px-5 py-3">
                      <Link href={`/painel/relatorios/${r.id}`} className="font-semibold hover:underline tnum">
                        {formatIsoBr(r.periodStart)} a {formatIsoBr(r.periodEnd)}
                      </Link>
                    </td>
                    <td className="px-3 text-right tnum">{d.kpis.visits}</td>
                    <td className="px-3 text-right tnum">{d.kpis.nearExpiry}</td>
                    <td className={`px-3 text-right tnum ${d.kpis.expired ? "text-[#B42318] font-bold" : ""}`}>{d.kpis.expired}</td>
                    <td className="px-3 text-right tnum">{d.kpis.ruptures}</td>
                    <td className="px-3 text-right tnum">{d.kpis.damages}</td>
                    <td className="px-3 text-[12.5px]">
                      {r.generatedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}{" "}
                      <Badge>{r.generatedBy ? "gerado no painel" : "importado"}</Badge>
                    </td>
                    <td className="px-5 text-right">
                      <a href={`/api/weekly-reports/${r.id}/pdf`} className={buttonClass("ghost", "sm")}>
                        <Download className="size-3.5" /> PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={<FileBarChart2 className="size-8" />} title="Nenhum relatório gerado ainda" />
        )}
      </Card>
    </>
  );
}
