import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { bookData, renderBookPdf } from "@/server/pdf/book-pdf";
import { pdfAgency, pdfResponse, slug } from "@/server/pdf/kit";

/** Book de Atendimento (PDF) com os filtros do Relatório fotográfico. */
export async function GET(request: Request) {
  const ctx = await reportContext(request, 7);
  if (!ctx) return unauthorized();
  const { scope, f } = ctx;
  const data = await bookData(scope, f);
  await logExport(scope, "book", f, "pdf");
  const name = `Book_de_Atendimento_${slug(data.brandName ?? scope.agencyName)}_${f.from}_a_${f.to}`;
  return pdfResponse(await renderBookPdf(await pdfAgency(scope), data), `${name}.pdf`);
}
