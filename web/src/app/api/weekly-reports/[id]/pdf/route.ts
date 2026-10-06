import { getApiScope, MANAGER_ROLES, unauthorized } from "@/server/auth";
import { getWeeklyReport } from "@/server/weekly-report";
import { renderWeeklyPdf } from "@/server/pdf/weekly-pdf";

export async function GET(request: Request, ctx: RouteContext<"/api/weekly-reports/[id]/pdf">) {
  const scope = await getApiScope(MANAGER_ROLES);
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  const report = await getWeeklyReport(scope, id);
  if (!report) return new Response("Relatório não encontrado", { status: 404 });
  const pdf = await renderWeeklyPdf(report.data);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const name = `Suinco_Relatorio_${report.periodStart}_a_${report.periodEnd}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
