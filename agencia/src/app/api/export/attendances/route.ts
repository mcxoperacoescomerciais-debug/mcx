import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { attendancesSheet } from "@/server/reports";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const sheet = await attendancesSheet(scope, f);
  await logExport(scope, "attendances", f, format);
  const name = `Atendimentos_${f.from}_a_${f.to}`;
  if (format === "csv") return csvResponse(sheet, `${name}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Atendimentos" }), `${name}.xlsx`);
}
