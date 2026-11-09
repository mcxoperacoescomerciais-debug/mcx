import { getApiScope, STAFF, unauthorized } from "@/server/auth";
import { audit } from "@/server/audit";
import { combineReports, monthlyReport, monthlyWorkbook, type MonthlyReport } from "@/server/monthly-report";
import { filterOptions } from "@/server/operations";
import { canSeeBrand } from "@/server/scope";
import { isUuid } from "@/lib/filters";
import { slug } from "@/server/pdf/kit";
import { xlsxResponse } from "@/server/xlsx";

/**
 * Relatório mensal de atendimentos (Sistemática › Baixar Excel). Marca, rede e
 * promotor aceitam vários (separados por vírgula); marca vazia = todas as
 * marcas que o usuário enxerga, numa planilha só.
 */
export async function GET(request: Request) {
  const scope = await getApiScope(STAFF);
  if (!scope) return unauthorized();
  if (!scope.settings.modules.sistematica) return Response.json({ error: "Relatório não liberado para esta agência." }, { status: 403 });
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand") ?? "";
  const month = url.searchParams.get("month") ?? "";
  const one = (k: string) => {
    const ids = (url.searchParams.get(k) ?? "").split(",").filter(isUuid);
    return ids.length ? ids.join(",") : null;
  };
  const picked = brand.split(",").filter(Boolean);
  if (picked.some((b) => !isUuid(b) || !canSeeBrand(scope, b))) return Response.json({ error: "Escolha marcas que você pode acessar." }, { status: 400 });
  const brandIds = picked.length ? picked : (await filterOptions(scope)).brands.map((b) => b.id);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Informe o mês (AAAA-MM)." }, { status: 400 });
  const reports: MonthlyReport[] = [];
  for (const id of brandIds) {
    const one1 = await monthlyReport(scope, { brandId: id, month, chain: one("chain"), promoter: one("promoter") });
    if (one1) reports.push(one1);
  }
  const r = combineReports(reports);
  if (!r) return Response.json({ error: "Nenhuma marca encontrada." }, { status: 404 });
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "export", "monthly", "xlsx", { after: { brand, month, chain: one("chain"), promoter: one("promoter") } });
  return xlsxResponse(await monthlyWorkbook(r, scope.agencyName), `Atendimentos_${slug(reports.length > 1 ? `${reports.length}-marcas` : r.brand.name)}_${month}.xlsx`);
}
