import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { dailyReport, dailySheets } from "@/server/reports";
import { parseDayRange } from "@/lib/filters";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (!ctx) return unauthorized();
  const { scope, format } = ctx;
  const f = parseDayRange(Object.fromEntries(new URL(request.url).searchParams));
  const sheet = dailySheets(await dailyReport(scope, f, true))[0];
  await logExport(scope, "stores", f, format);
  if (format === "csv") return csvResponse(sheet, `Visitas_${f.from}_a_${f.to}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Visitas" }), `Visitas_${f.from}_a_${f.to}.xlsx`);
}
