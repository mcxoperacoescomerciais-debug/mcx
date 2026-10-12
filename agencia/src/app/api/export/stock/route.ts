import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { stockRecords } from "@/server/analytics";
import { stockSheet } from "@/server/reports";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const { rows } = await stockRecords(scope, f, { page: 1, pageSize: 50_000 });
  await logExport(scope, "stock", f, format);
  const sheet = stockSheet(rows);
  const name = `Estoque_${f.from}_a_${f.to}`;
  if (format === "csv") return csvResponse(sheet, `${name}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Estoque" }), `${name}.xlsx`);
}
