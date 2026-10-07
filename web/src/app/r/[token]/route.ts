/**
 * Link curto do PDF da visita enviado no alerta de WhatsApp. Abre sem login:
 * o id é aleatório (impossível de adivinhar), vale só para essa visita e expira.
 */
import { resolveAlertLink } from "@/server/whatsapp-alert";
import { getVisitDetail, visitPdfFilename } from "@/server/visits";
import { renderVisitPdf } from "@/server/pdf/visit-pdf";

export async function GET(_request: Request, ctx: RouteContext<"/r/[token]">) {
  const { token } = await ctx.params;
  const link = await resolveAlertLink(token);
  if (!link) return new Response("Link inválido ou expirado. Abra a visita pelo painel.", { status: 404 });
  const scope = { tenantId: link.tenantId, clientId: link.clientId, userId: "", role: "admin" as const, promoterId: null };
  const visit = await getVisitDetail(scope, link.visitId);
  if (!visit) return new Response("Visita não encontrada.", { status: 404 });
  const pdf = await renderVisitPdf(visit);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${visitPdfFilename(visit)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
