/**
 * Alerta de validade crítica no WhatsApp da gestão (modo SUINCO), por agência.
 *
 * Quando o promotor FINALIZA um atendimento com validade crítica, a agência
 * recebe: nome da agência, marca, promotor, loja, cidade, os itens e o link do
 * PDF do atendimento. Crítico (ajustável em Configurações de cada agência):
 *   - vencido ou vencendo em até `validityBands.critical` dias;
 *   - grande quantidade: vencendo em até `alerts.bulkDays` dias e quantidade
 *     acima de `alerts.bulkMinQty`.
 *
 * Envio pelo CallMeBot (grátis, só texto): o PDF vai como link curto
 * /r/<id aleatório>, que abre sem login por LINK_DAYS dias. Número e chave
 * ficam nas Configurações da agência (variáveis ALERT_WHATSAPP_* como reserva).
 * Cada atendimento é avisado uma vez só (tabela whatsapp_alerts).
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import type { ActionResult } from "./manager";
import { VALIDITY_LOCATION_LABEL } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { describeDays, formatIsoBr, isAlertItem } from "@/lib/validity";
import type { AgencySettings } from "@/lib/settings";

export const LINK_DAYS = 30;

function recipients(st: AgencySettings): { phone: string; apikey: string }[] {
  const phoneList = st.alerts.whatsappPhone || process.env.ALERT_WHATSAPP_PHONE || "";
  const keyList = st.alerts.whatsappApiKey || process.env.ALERT_WHATSAPP_APIKEY || "";
  const phones = phoneList.split(",").map((p) => p.trim()).filter(Boolean);
  const keys = keyList.split(",").map((k) => k.trim());
  return phones.map((phone, i) => ({ phone, apikey: keys[i] ?? keys[0] ?? "" })).filter((r) => r.apikey);
}

function baseUrl(): string {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function buildAlertMessage(scope: Pick<Scope, "agencyId" | "agencyName" | "settings">, attendanceId: string, linkId: string): Promise<{ text: string; items: number } | null> {
  const db = await getDb();
  const [a] = await db
    .select({
      brand: s.brands.name,
      visitDate: s.visits.visitDate,
      promoter: s.users.name,
      store: s.stores.name,
      code: s.stores.code,
      city: s.stores.city,
      chain: s.chains.name,
    })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(and(eq(s.attendances.id, attendanceId), eq(s.attendances.agencyId, scope.agencyId)));
  if (!a) return null;

  const rows = await db
    .select({
      product: s.products.name,
      expiryDate: s.validities.expiryDate,
      days: s.validities.daysToExpiry,
      quantity: s.validities.quantity,
      unit: s.validities.unit,
      location: s.validities.location,
    })
    .from(s.validities)
    .innerJoin(s.products, eq(s.products.id, s.validities.productId))
    .where(and(eq(s.validities.attendanceId, attendanceId), isNull(s.validities.deletedAt)))
    .orderBy(s.validities.daysToExpiry);
  const rule = { bands: scope.settings.validityBands, bulkDays: scope.settings.alerts.bulkDays, bulkMinQty: scope.settings.alerts.bulkMinQty };
  const items = rows.filter((r) => isAlertItem(r.days, r.quantity, rule));
  if (!items.length) return null;

  const line = (i: (typeof items)[number]) =>
    `• ${i.product} – ${i.days < 0 ? `VENCIDO (${formatIsoBr(i.expiryDate, false)})` : `vence ${formatIsoBr(i.expiryDate, false)} (${describeDays(i.days)})`} · ${i.quantity} ${i.unit} · ${VALIDITY_LOCATION_LABEL[i.location]}`;
  const urgent = items.filter((i) => i.days <= rule.bands.critical);
  const bulk = items.filter((i) => i.days > rule.bands.critical);
  const text = [
    `⚠️ *Validade crítica – ${scope.agencyName}*`,
    `*Marca:* ${a.brand}`,
    `*Promotor:* ${a.promoter}`,
    `*Loja:* ${a.chain && !a.store.toLowerCase().includes(a.chain.toLowerCase()) ? `${a.chain} · ` : ""}${a.store}${a.code && !a.store.includes(a.code) ? ` · ${a.code}` : ""}`,
    `*Cidade:* ${a.city}`,
    `*Visita:* ${fmtDate(a.visitDate)}`,
    "",
    ...(urgent.length ? [`*Vencidos ou vencendo em até ${rule.bands.critical} dias (${urgent.length}):*`, ...urgent.map(line)] : []),
    ...(urgent.length && bulk.length ? [""] : []),
    ...(bulk.length ? [`*Grande quantidade – vence em até ${rule.bulkDays} dias, acima de ${rule.bulkMinQty} (${bulk.length}):*`, ...bulk.map(line)] : []),
    "",
    `📄 Relatório (PDF): ${baseUrl()}/r/${linkId}`,
  ].join("\n");
  return { text, items: items.length };
}

async function sendCallMeBot(phone: string, apikey: string, text: string): Promise<void> {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const body = await res.text();
  if (!res.ok || /error|invalid/i.test(body.slice(0, 500))) throw new Error(`CallMeBot ${res.status}: ${body.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
}

/** Atendimento do link curto do alerta (válido por LINK_DAYS dias). */
export async function resolveAlertLink(id: string): Promise<{ agencyId: string; attendanceId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(s.whatsappAlerts).where(eq(s.whatsappAlerts.id, id));
  if (!row || Date.now() - row.createdAt.getTime() > LINK_DAYS * 86_400_000) return null;
  return { agencyId: row.agencyId, attendanceId: row.attendanceId };
}

/** Chamado depois que o atendimento finalizado é gravado. Nunca lança erro. */
export async function notifyCriticalAttendance(scope: Scope, attendanceId: string): Promise<void> {
  try {
    const to = recipients(scope.settings);
    if (!to.length) return;
    const db = await getDb();
    // Registra antes de enviar (índice único por atendimento): reenvios não duplicam.
    const [row] = await db
      .insert(s.whatsappAlerts)
      .values({ agencyId: scope.agencyId, attendanceId, items: 0 })
      .onConflictDoNothing()
      .returning();
    if (!row) return;
    const msg = await buildAlertMessage(scope, attendanceId, row.id);
    if (!msg) {
      await db.delete(s.whatsappAlerts).where(eq(s.whatsappAlerts.id, row.id));
      return;
    }
    const errors: string[] = [];
    for (const r of to) await sendCallMeBot(r.phone, r.apikey, msg.text).catch((e: Error) => errors.push(e.message));
    await db
      .update(s.whatsappAlerts)
      .set({ items: msg.items, sentAt: errors.length < to.length ? new Date() : null, error: errors.length ? errors.join(" | ").slice(0, 500) : null })
      .where(eq(s.whatsappAlerts.id, row.id));
    if (errors.length) console.error("[alerta whatsapp]", attendanceId, errors);
  } catch (err) {
    console.error("[alerta whatsapp] falhou", attendanceId, err);
  }
}

/** Botão "Enviar mensagem de teste" das Configurações da agência. */
export async function sendTestAlert(scope: Scope): Promise<ActionResult> {
  const to = recipients(scope.settings);
  if (!to.length) return { ok: false, error: "Preencha o número e a chave do CallMeBot e salve antes de testar." };
  const st = scope.settings;
  const text = [
    `✅ *Teste – alertas ${scope.agencyName}*`,
    "Este número vai receber os avisos de validade crítica:",
    `• vencidos ou vencendo em até ${st.validityBands.critical} dias`,
    `• vencendo em até ${st.alerts.bulkDays} dias com mais de ${st.alerts.bulkMinQty} unidades`,
  ].join("\n");
  const errors: string[] = [];
  for (const r of to) await sendCallMeBot(r.phone, r.apikey, text).catch((e: Error) => errors.push(`${r.phone}: ${e.message}`));
  return errors.length ? { ok: false, error: `Falha no envio — confira número e chave. ${errors.join(" | ")}` } : { ok: true, message: "Mensagem de teste enviada. Confira o WhatsApp." };
}
