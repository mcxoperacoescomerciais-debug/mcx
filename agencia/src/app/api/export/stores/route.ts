import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { dailyReport, dailySheets } from "@/server/reports";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const sheet = dailySheets(await dailyReport(scope, f))[0];
  await logExport(scope, "stores", f, format);
  if (format === "csv") return csvResponse(sheet, `Lojas_${f.date}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Lojas" }), `Lojas_${f.date}.xlsx`);
}
