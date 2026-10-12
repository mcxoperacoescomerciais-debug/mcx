import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { brandReport, rupturesSheet, stockSheet } from "@/server/reports";
import { renderBrandPdf } from "@/server/pdf/report-pdfs";
import { pdfResponse, slug } from "@/server/pdf/kit";
import { buildWorkbook, xlsxResponse } from "@/server/xlsx";
import { canSeeBrand } from "@/server/scope";

export async function GET(request: Request) {
  const ctx = await reportContext(request, 30);
  if (!ctx) return unauthorized();
  const { scope, f, format } = ctx;
  if (!f.brand || !canSeeBrand(scope, f.brand)) return Response.json({ error: "Escolha uma marca que você pode acessar." }, { status: 400 });
  const r = await brandReport(scope, f);
  if (!r.brand) return Response.json({ error: "Marca não encontrada." }, { status: 404 });
  await logExport(scope, "brand", f, format);
  const name = `Marca_${slug(r.brand.name)}_${f.from}_a_${f.to}`;
  if (format === "pdf") return pdfResponse(await renderBrandPdf(scope.agencyName, r, f.from, f.to), `${name}.pdf`);
  const wb = await buildWorkbook(
    [
      {
        name: "Por loja",
        columns: [
          { header: "Loja", key: "store", width: 32 },
          { header: "Cidade", key: "city", width: 18 },
          { header: "Atendimentos", key: "visits" },
          { header: "Concluídos", key: "completed" },
          { header: "Exceções/cancelados", key: "exceptions" },
          { header: "Rupturas", key: "ruptures" },
          { header: "Último atendimento", key: "last" },
        ],
        rows: r.byStore,
      },
      {
        name: "Por produto",
        columns: [
          { header: "Produto", key: "product", width: 38 },
          { header: "SKU", key: "sku" },
          { header: "Lojas com registro", key: "stores" },
          { header: "Quantidade somada", key: "quantity" },
          { header: "Estoque zero", key: "zero" },
          { header: "Não encontrado", key: "notFound" },
          { header: "Rupturas", key: "ruptures" },
        ],
        rows: r.byProduct,
      },
      { ...stockSheet(r.latest), name: "Último estoque por loja" },
      rupturesSheet(r.ruptures),
    ],
    { agency: scope.agencyName, title: `Relatório ${r.brand.name}` },
  );
  return xlsxResponse(wb, `${name}.xlsx`);
}
