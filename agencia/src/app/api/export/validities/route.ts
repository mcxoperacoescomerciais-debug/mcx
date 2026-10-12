import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { validityList, validitiesSheet } from "@/server/items";
import { buildWorkbook, csvResponse, xlsxResponse } from "@/server/xlsx";

export async function GET(request: Request) {
  const ctx = await reportContext(request, 30);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  const { rows } = await validityList(scope, f, { page: 1, pageSize: 50_000 });
  await logExport(scope, "validities", f, format);
  const sheet = validitiesSheet(rows);
  const name = `Validades_${f.from}_a_${f.to}`;
  if (format === "csv") return csvResponse(sheet, `${name}.csv`);
  return xlsxResponse(await buildWorkbook([sheet], { agency: scope.agencyName, title: "Validades" }), `${name}.xlsx`);
}
