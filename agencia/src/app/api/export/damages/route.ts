import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { damageList, damagesSheet } from "@/server/items";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request, 30);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const { rows } = await damageList(scope, f, { page: 1, pageSize: 50_000 });
  await logExport(scope, "damages", f, format);
  const sheet = damagesSheet(rows);
  const name = `Avarias_${f.from}_a_${f.to}`;
  if (format === "csv") return csvResponse(sheet, `${name}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Avarias" }), `${name}.xlsx`);
}
