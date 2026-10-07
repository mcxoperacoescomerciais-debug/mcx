/**
 * Alerta de WhatsApp para a gestão: quando o promotor finaliza uma visita com
 * validades críticas, envia promotor, loja, cidade, os itens e o link do PDF.
 * Crítico (ajustável em Configurações):
 *   - vencido ou vencendo em até bands.critical dias;
 *   - grande quantidade: vencendo em até alerts.bulkDays dias e quantidade acima de alerts.bulkMinQty.
 *
 * Envio pelo CallMeBot (grátis, só texto — por isso o PDF vai como link curto
 * /r/<id aleatório>, que abre sem login e expira em LINK_DAYS dias).
 * Número e chave: Configurações › Alerta no WhatsApp (ou, como reserva, as
 * variáveis ALERT_WHATSAPP_PHONE / ALERT_WHATSAPP_APIKEY). Vários destinatários:
 * separe por vírgula, na mesma ordem. APP_URL opcional (no Render usa RENDER_EXTERNAL_URL).
 *
 * Cada visita é avisada uma vez só (registro na tabela notifications).
 */
import "server-only";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { LOCATION_LABEL, type Location } from "@/lib/domain";
import { describeDays, formatIsoBr } from "@/lib/validity";
import type { ClientSettings } from "@/lib/settings";
import { getClientSettings } from "./settings";
import type { Result } from "./admin";

const KIND = "critical_visit";
export const LINK_DAYS = 30;

function recipients(st: ClientSettings): { phone: string; apikey: string }[] {
  const phoneList = st.alerts.whatsappPhone || process.env.ALERT_WHATSAPP_PHONE || "";
  const keyList = st.alerts.whatsappApiKey || process.env.ALERT_WHATSAPP_APIKEY || "";
  const phones = phoneList.split(",").map((p) => p.trim()).filter(Boolean);
  const keys = keyList.split(",").map((k) => k.trim());
  return phones.map((phone, i) => ({ phone, apikey: keys[i] ?? keys[0] ?? "" })).filter((r) => r.apikey);
}

function baseUrl(): string {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function buildCriticalVisitMessage(visitId: string, linkId: string, st: ClientSettings): Promise<string | null> {
  const db = await getDb();
  const [v] = await db
    .select({ visitDate: s.visits.visitDate, promoter: s.users.name, store: s.stores.name, code: s.stores.code, city: s.stores.city })
    .from(s.visits)
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(eq(s.visits.id, visitId));
  if (!v) return null;

  const items = await db
    .select({
      product: s.products.name,
      expiryDate: s.occurrences.expiryDate,
      days: s.occurrences.daysToExpiry,
      severity: s.occurrences.severity,
      quantity: s.occurrences.quantity,
      unit: s.occurrences.unit,
      location: s.occurrences.location,
    })
    .from(s.occurrences)
    .innerJoin(s.products, eq(s.products.id, s.occurrences.productId))
    .where(
      and(
        eq(s.occurrences.visitId, visitId),
        eq(s.occurrences.type, "validity"),
        or(
          lte(s.occurrences.daysToExpiry, st.bands.critical),
          and(lte(s.occurrences.daysToExpiry, st.alerts.bulkDays), gt(s.occurrences.quantity, st.alerts.bulkMinQty)),
        ),
        isNull(s.occurrences.deletedAt),
      ),
    )
    .orderBy(s.occurrences.daysToExpiry);
  if (!items.length) return null;

  const line = (i: (typeof items)[number]) => {
    const when = (i.days ?? 0) < 0 ? `VENCIDO (${formatIsoBr(i.expiryDate, false)})` : `vence ${formatIsoBr(i.expiryDate, false)} (${describeDays(i.days ?? 0)})`;
    const qty = i.quantity != null ? ` · ${i.quantity} ${i.unit}` : "";
    return `• ${i.product} – ${when}${qty} · ${LOCATION_LABEL[i.location as Location] ?? i.location}`;
  };
  const urgent = items.filter((i) => (i.days ?? 0) <= st.bands.critical);
  const bulk = items.filter((i) => (i.days ?? 0) > st.bands.critical);
  const lines = [
    ...(urgent.length ? [`*Vencidos ou vencendo em até ${st.bands.critical} dias (${urgent.length}):*`, ...urgent.map(line)] : []),
    ...(urgent.length && bulk.length ? [""] : []),
    ...(bulk.length ? [`*Grande quantidade – vence em até ${st.alerts.bulkDays} dias, acima de ${st.alerts.bulkMinQty} (${bulk.length}):*`, ...bulk.map(line)] : []),
  ];
  return [
    "⚠️ *Validade crítica – SUINCO*",
    `*Promotor:* ${v.promoter}`,
    `*Loja:* ${v.store}${v.code ? ` · ${v.code}` : ""}`,
    `*Cidade:* ${v.city}`,
    `*Visita:* ${formatIsoBr(v.visitDate)}`,
    "",
    ...lines,
    "",
    `📄 Relatório (PDF): ${baseUrl()}/r/${linkId}`,
  ].join("\n");
}

async function sendCallMeBot(phone: string, apikey: string, text: string): Promise<void> {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const body = await res.text();
  if (!res.ok || /error|invalid/i.test(body.slice(0, 500))) throw new Error(`CallMeBot ${res.status}: ${body.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
}

/** Visita do link curto do alerta (válido por LINK_DAYS dias). */
export async function resolveAlertLink(id: string): Promise<{ tenantId: string; clientId: string; visitId: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [n] = await db.select().from(s.notifications).where(and(eq(s.notifications.id, id), eq(s.notifications.kind, KIND)));
  if (!n || Date.now() - n.createdAt.getTime() > LINK_DAYS * 86400000) return null;
  const p = n.payload as { visitId?: string; clientId?: string };
  return p.visitId && p.clientId ? { tenantId: n.tenantId, clientId: p.clientId, visitId: p.visitId } : null;
}

/** Chamado depois que a visita finalizada é gravada. Nunca lança erro (não pode atrapalhar a sincronização). */
export async function notifyCriticalVisit(scope: Scope, visitId: string): Promise<void> {
  try {
    const st = await getClientSettings(scope.clientId);
    const to = recipients(st);
    if (!to.length) return;
    const db = await getDb();
    const [already] = await db
      .select({ id: s.notifications.id })
      .from(s.notifications)
      .where(and(eq(s.notifications.kind, KIND), sql`${s.notifications.payload}->>'visitId' = ${visitId}`))
      .limit(1);
    if (already) return;
    // Registra antes de enviar: se dois envios da mesma visita chegarem juntos, só um avisa.
    // O id do registro (aleatório) é também o link curto do PDF.
    const payload = { visitId, clientId: scope.clientId };
    const [n] = await db.insert(s.notifications).values({ tenantId: scope.tenantId, kind: KIND, channel: "whatsapp", payload }).returning();
    const text = await buildCriticalVisitMessage(visitId, n.id, st);
    if (!text) {
      await db.delete(s.notifications).where(eq(s.notifications.id, n.id));
      return;
    }
    const errors: string[] = [];
    for (const r of to) await sendCallMeBot(r.phone, r.apikey, text).catch((e: Error) => errors.push(e.message));
    await db
      .update(s.notifications)
      .set(errors.length < to.length ? { sentAt: new Date() } : { payload: { ...payload, error: errors.join(" | ") } })
      .where(eq(s.notifications.id, n.id));
    if (errors.length) console.error("[alerta whatsapp]", visitId, errors);
  } catch (err) {
    console.error("[alerta whatsapp] falhou", visitId, err);
  }
}

/** Botão "Enviar mensagem de teste" das Configurações. */
export async function sendTestAlert(scope: Scope): Promise<Result> {
  const st = await getClientSettings(scope.clientId);
  const to = recipients(st);
  if (!to.length) return { ok: false, error: "Preencha o número e a chave do CallMeBot e salve antes de testar." };
  const text = [
    "✅ *Teste – alertas SUINCO*",
    "Este número vai receber os avisos de validade crítica:",
    `• vencidos ou vencendo em até ${st.bands.critical} dias`,
    `• vencendo em até ${st.alerts.bulkDays} dias com mais de ${st.alerts.bulkMinQty} unidades`,
  ].join("\n");
  const errors: string[] = [];
  for (const r of to) await sendCallMeBot(r.phone, r.apikey, text).catch((e: Error) => errors.push(`${r.phone}: ${e.message}`));
  return errors.length ? { ok: false, error: `Falha no envio — confira número e chave. ${errors.join(" | ")}` } : { ok: true };
}
