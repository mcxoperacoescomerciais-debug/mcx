import { getApiScope, unauthorized } from "@/server/auth";
import { getVisitDetail, visitPdfFilename } from "@/server/visits";
import { renderVisitPdf } from "@/server/pdf/visit-pdf";

export async function GET(request: Request, ctx: RouteContext<"/api/visits/[id]/pdf">) {
  const scope = await getApiScope();
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  const visit = await getVisitDetail(scope, id);
  if (!visit) return new Response("Visita não encontrada", { status: 404 });
  const pdf = await renderVisitPdf(visit);
  const inline = new URL(request.url).searchParams.get("inline") === "1";
  const filename = visitPdfFilename(visit);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
