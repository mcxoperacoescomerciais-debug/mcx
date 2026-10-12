/**
 * PDF do atendimento para o PROMOTOR compartilhar no WhatsApp (só os próprios
 * atendimentos — o escopo do promotor já restringe).
 */
import { getApiScope, unauthorized } from "@/server/auth";
import { isUuid } from "@/lib/filters";
import { loadAttendanceBlock, renderAttendancesPdf } from "@/server/pdf/attendance-pdf";
import { pdfAgency, pdfResponse, slug } from "@/server/pdf/kit";
import { fmtDate } from "@/lib/dates";

export async function GET(_request: Request, ctx: RouteContext<"/api/promoter/attendance/[id]/pdf">) {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Não encontrado", { status: 404 });
  const block = await loadAttendanceBlock(scope, id);
  if (!block) return new Response("Atendimento não encontrado", { status: 404 });
  const d = block.d;
  const pdf = await renderAttendancesPdf({
    agency: await pdfAgency(scope),
    title: `Relatório de atendimento · ${d.brand.name}`,
    subtitle: `${d.store.name} · ${fmtDate(d.visit.visitDate)} · ${d.promoterName}`,
    blocks: [block],
    footer: `${scope.agencyName} · atendimento ${d.attendance.id.slice(0, 8)}`,
  });
  return pdfResponse(pdf, `Atendimento_${slug(d.brand.name)}_${slug(d.store.name)}_${d.visit.visitDate}.pdf`);
}
