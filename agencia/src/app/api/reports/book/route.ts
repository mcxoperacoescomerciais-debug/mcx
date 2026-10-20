import { unauthorized } from "@/server/auth";
import { reportContext, logExport } from "@/server/export-helpers";
import { bookData, renderBookPdf } from "@/server/pdf/book-pdf";
import { pdfAgency, pdfResponse, slug } from "@/server/pdf/kit";

/** Book de Atendimento (PDF ou PowerPoint, ?format=pptx) com os filtros do Relatório fotográfico. */
export async function GET(request: Request) {
  const ctx = await reportContext(request, 7);
  if (!ctx) return unauthorized();
  const { scope, f } = ctx;
  const pptx = new URL(request.url).searchParams.get("format") === "pptx";
  const data = await bookData(scope, f);
  await logExport(scope, "book", f, pptx ? "pptx" : "pdf");
  const name = `Book_de_Atendimento_${slug(data.brandName ?? scope.agencyName)}_${f.from}_a_${f.to}`;
  if (pptx) {
    const { renderBookPptx } = await import("@/server/pdf/book-pptx");
    const bytes = await renderBookPptx(await pdfAgency(scope), data);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${name}.pptx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return pdfResponse(await renderBookPdf(await pdfAgency(scope), data), `${name}.pdf`);
}
