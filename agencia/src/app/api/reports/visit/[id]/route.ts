import { getApiScope, STAFF, unauthorized } from "@/server/auth";
import { isUuid } from "@/lib/filters";
import { getVisitDetail } from "@/server/details";
import { loadAttendanceBlock, renderAttendancesPdf } from "@/server/pdf/attendance-pdf";
import { pdfResponse, slug } from "@/server/pdf/kit";
import { audit } from "@/server/audit";
import { fmtDate, fmtTime } from "@/lib/dates";
import { VISIT_STATUS_LABEL } from "@/lib/domain";

/** Visita completa: uma seção por marca, cada uma com seus próprios registros. */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/visit/[id]">) {
  const scope = await getApiScope(STAFF);
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Não encontrado", { status: 404 });
  const v = await getVisitDetail(scope, id);
  if (!v) return new Response("Visita não encontrada", { status: 404 });
  const blocks = (await Promise.all(v.attendances.map((a) => loadAttendanceBlock(scope, a.a.id)))).filter((b) => b !== null);
  const pendingBrands = v.planned.filter((p) => !v.attendances.some((a) => a.a.brandId === p.id)).map((p) => p.name);
  const pdf = await renderAttendancesPdf({
    agency: scope.agencyName,
    title: `Relatório da visita · ${v.store.name}`,
    subtitle: `${fmtDate(v.visit.visitDate)} · ${v.promoterName} · ${fmtTime(v.visit.startedAt)}–${v.visit.finishedAt ? fmtTime(v.visit.finishedAt) : "em aberto"} · ${VISIT_STATUS_LABEL[v.visit.status]}`,
    summary: [
      { label: "Marcas previstas", value: Math.max(v.planned.length, v.attendances.length) },
      { label: "Atendimentos concluídos", value: v.attendances.filter((a) => a.a.status === "completed").length, tone: "success" },
      { label: "Rupturas", value: v.ruptures.length, tone: v.ruptures.length ? "danger" : "neutral" },
      { label: "Marcas não atendidas", value: pendingBrands.length, tone: pendingBrands.length ? "warning" : "neutral" },
    ],
    intro: [pendingBrands.length ? `Marcas previstas sem atendimento: ${pendingBrands.join(", ")}.` : "", v.visit.closeReason ? `Justificativa de encerramento: “${v.visit.closeReason}”.` : ""].filter(Boolean).join(" ") || undefined,
    blocks,
    footer: `${scope.agencyName} · visita ${v.visit.id.slice(0, 8)}`,
  });
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "report", id, "visit_pdf");
  return pdfResponse(pdf, `Visita_${slug(v.store.name)}_${v.visit.visitDate}.pdf`, new URL(request.url).searchParams.get("inline") === "1");
}
