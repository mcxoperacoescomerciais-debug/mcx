import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { ruptureList } from "@/server/analytics";
import { rupturesSheet } from "@/server/reports";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request, 30);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const { rows } = await ruptureList(scope, f, { page: 1, pageSize: 50_000 });
  await logExport(scope, "ruptures", f, format);
  const sheet = rupturesSheet(rows);
  const name = `Rupturas_${f.from}_a_${f.to}`;
  if (format === "csv") return csvResponse(sheet, `${name}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Rupturas" }), `${name}.xlsx`);
}
