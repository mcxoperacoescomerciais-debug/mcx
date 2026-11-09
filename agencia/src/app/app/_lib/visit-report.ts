/**
 * Relatório da visita para o WhatsApp (pergunta ao encerrar a visita, quando a
 * agência liga a opção): por marca, os produtos com validade registrada (data,
 * dias, quantidade e valor) e os produtos em ruptura. Montado no celular, com o
 * que está guardado no aparelho — funciona sem internet (o WhatsApp envia
 * quando houver sinal).
 */
import { RUPTURE_SITUATION_LABEL } from "@/lib/domain";
import { daysBetween, fmtDate } from "@/lib/dates";
import { describeDays, formatIsoBr } from "@/lib/validity";
import type { BootstrapBrand, BootstrapProduct, BootstrapStore } from "@/lib/sync-types";
import type { LocalVisit } from "./local-store";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function visitReportText(
  visit: LocalVisit,
  ctx: { agency: string; promoter: string; store: BootstrapStore | undefined; brandById: Map<string, BootstrapBrand>; productById: Map<string, BootstrapProduct>; brandIds?: string[] | null; attendanceId?: string },
): string {
  const product = (id: string) => ctx.productById.get(id)?.name ?? "Produto";
  const lines = [
    `📋 *${ctx.attendanceId ? "Relatório do atendimento" : "Relatório da visita"} – ${ctx.agency}*`,
    `*Loja:* ${ctx.store ? `${ctx.store.chainName && !ctx.store.name.toLowerCase().includes(ctx.store.chainName.toLowerCase()) ? `${ctx.store.chainName} · ` : ""}${ctx.store.name} · ${ctx.store.city}` : "—"}`,
    `*Promotor:* ${ctx.promoter}`,
    `*Data:* ${fmtDate(visit.visitDate)}`,
  ];
  const atts = reportAttendances(visit, ctx.brandIds).filter((a) => !ctx.attendanceId || a.id === ctx.attendanceId);
  for (const a of atts) {
    const validities = Object.values(a.validities ?? {}).sort((x, y) => x.expiryDate.localeCompare(y.expiryDate));
    const ruptures = Object.values(a.ruptures);
    lines.push("", `🏷️ *${ctx.brandById.get(a.brandId)?.name ?? "Marca"}*`);
    if (validities.length) {
      lines.push(`⏳ *Próximos ao vencimento (${validities.length}):*`);
      for (const v of validities) {
        const days = daysBetween(visit.visitDate, v.expiryDate);
        const when = days < 0 ? `VENCIDO (${formatIsoBr(v.expiryDate, false)})` : `vence ${formatIsoBr(v.expiryDate, false)} (${describeDays(days)})`;
        lines.push(`• ${product(v.productId)} – ${when} · ${v.quantity} ${v.unit}${v.price != null ? ` · ${brl(v.price)}` : ""}`);
      }
    } else lines.push("⏳ Nenhum produto próximo ao vencimento.");
    if (ruptures.length) {
      lines.push(`🚫 *Produtos em ruptura (${ruptures.length}):*`);
      for (const r of ruptures) lines.push(`• ${product(r.productId)} – ${RUPTURE_SITUATION_LABEL[r.situation] ?? r.situation}`);
    } else lines.push("🚫 Nenhum produto em ruptura.");
  }
  if (!atts.length) lines.push("", "Nenhuma marca atendida nesta visita.");
  if (visit.notes) lines.push("", `📝 ${visit.notes}`);
  return lines.join("\n");
}

/** Atendimentos que entram no relatório (marcas escolhidas em Configurações; null = todas). */
export function reportAttendances(visit: LocalVisit, brandIds: string[] | null | undefined) {
  return Object.values(visit.attendances).filter((a) => a.status !== "cancelled" && (!brandIds || brandIds.includes(a.brandId)));
}

/** Link do WhatsApp: com número, abre a conversa dele; sem número, o promotor escolhe o contato. */
export function whatsappLink(text: string, phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
