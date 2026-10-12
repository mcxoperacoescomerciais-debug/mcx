/**
 * Link curto do PDF do atendimento enviado no alerta de WhatsApp. Abre sem
 * login: o id é aleatório (impossível de adivinhar), vale só para esse
 * atendimento e expira (ver src/server/whatsapp-alert.ts).
 */
import { agencySystemScope } from "@/server/auth";
import { resolveAlertLink } from "@/server/whatsapp-alert";
import { loadAttendanceBlock, renderAttendancesPdf } from "@/server/pdf/attendance-pdf";
import { pdfAgency, pdfResponse, slug } from "@/server/pdf/kit";
import { fmtDate } from "@/lib/dates";

export async function GET(_request: Request, ctx: RouteContext<"/r/[id]">) {
  const { id } = await ctx.params;
  const link = await resolveAlertLink(id);
  const scope = link ? await agencySystemScope(link.agencyId) : null;
  if (!link || !scope) return new Response("Link inválido ou expirado. Abra o atendimento pelo painel.", { status: 404 });
  const block = await loadAttendanceBlock(scope, link.attendanceId);
  if (!block) return new Response("Atendimento não encontrado.", { status: 404 });
  const d = block.d;
  const pdf = await renderAttendancesPdf({
    agency: await pdfAgency(scope),
    title: `Relatório de atendimento · ${d.brand.name}`,
    subtitle: `${d.store.name} · ${fmtDate(d.visit.visitDate)} · ${d.promoterName}`,
    blocks: [block],
    footer: `${scope.agencyName} · atendimento ${d.attendance.id.slice(0, 8)}`,
  });
  return pdfResponse(pdf, `Atendimento_${slug(d.brand.name)}_${slug(d.store.name)}_${d.visit.visitDate}.pdf`, true);
}
