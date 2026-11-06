import { getApiScope, STAFF, unauthorized } from "@/server/auth";
import { audit } from "@/server/audit";
import { monthlyReport, monthlyWorkbook } from "@/server/monthly-report";
import { canSeeBrand } from "@/server/scope";
import { isUuid } from "@/lib/filters";
import { slug } from "@/server/pdf/kit";
import { xlsxResponse } from "@/server/xlsx";

/** Relatório mensal de atendimentos de uma marca (Sistemática › Baixar Excel). */
export async function GET(request: Request) {
  const scope = await getApiScope(STAFF);
  if (!scope) return unauthorized();
  if (!scope.settings.modules.sistematica) return Response.json({ error: "Relatório não liberado para esta agência." }, { status: 403 });
  const url = new URL(request.url);
  const brand = url.searchParams.get("brand") ?? "";
  const month = url.searchParams.get("month") ?? "";
  const one = (k: string) => {
    const v = url.searchParams.get(k);
    return v && isUuid(v) ? v : null;
  };
  if (!isUuid(brand) || !canSeeBrand(scope, brand)) return Response.json({ error: "Escolha uma marca que você pode acessar." }, { status: 400 });
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Informe o mês (AAAA-MM)." }, { status: 400 });
  const r = await monthlyReport(scope, { brandId: brand, month, chain: one("chain"), promoter: one("promoter") });
  if (!r) return Response.json({ error: "Marca não encontrada." }, { status: 404 });
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "export", "monthly", "xlsx", { after: { brand, month, chain: one("chain"), promoter: one("promoter") } });
  return xlsxResponse(await monthlyWorkbook(r, scope.agencyName), `Atendimentos_${slug(r.brand.name)}_${month}.xlsx`);
}
