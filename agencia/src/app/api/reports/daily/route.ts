import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { dailyReport, dailySheets } from "@/server/reports";
import { renderDailyPdf } from "@/server/pdf/report-pdfs";
import { pdfAgency, pdfResponse } from "@/server/pdf/kit";
import { buildWorkbook, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const r = await dailyReport(scope, f);
  await logExport(scope, "daily", f, format);
  const note = [f.brand ? "filtrado por marca" : null, f.promoter ? "filtrado por promotor" : null, f.chain ? "filtrado por rede" : null, f.city ? `cidade ${f.city}` : null].filter(Boolean).join(" · ");
  if (format === "pdf") return pdfResponse(await renderDailyPdf(await pdfAgency(scope), r, note), `Relatorio_diario_${f.date}.pdf`);
  return xlsxResponse(await buildWorkbook(dailySheets(r), { agency: scope.agencyName, title: "Relatório diário" }), `Relatorio_diario_${f.date}.xlsx`);
}
