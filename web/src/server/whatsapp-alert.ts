/**
 * Alerta de WhatsApp para a gestão: quando o promotor finaliza uma visita com
 * validades críticas (vencidas ou dentro da faixa "crítica" das configurações),
 * envia promotor, loja, cidade, os itens e o link do PDF da visita.
 *
 * Envio pelo CallMeBot (grátis, só texto — por isso o PDF vai como link curto
 * /r/<id aleatório>, que abre sem login e expira em LINK_DAYS dias).
 * Configuração no Render:
 *   ALERT_WHATSAPP_PHONE   número com DDI, ex.: +5537999998888
 *   ALERT_WHATSAPP_APIKEY  chave recebida do CallMeBot
 *   APP_URL                opcional; no Render usa RENDER_EXTERNAL_URL
 * Vários destinatários: separe por vírgula, na mesma ordem nas duas variáveis.
 *
 * Cada visita é avisada uma vez só (registro na tabela notifications).
 */
import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { LOCATION_LABEL, type Location } from "@/lib/domain";
import { describeDays, formatIsoBr } from "@/lib/validity";

const KIND = "critical_visit";
export const LINK_DAYS = 30;

function recipients(): { phone: string; apikey: string }[] {
  const phones = (process.env.ALERT_WHATSAPP_PHONE ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const keys = (process.env.ALERT_WHATSAPP_APIKEY ?? "").split(",").map((k) => k.trim());
  return phones.map((phone, i) => ({ phone, apikey: keys[i] ?? keys[0] ?? "" })).filter((r) => r.apikey);
}

function baseUrl(): string {
  return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function buildCriticalVisitMessage(visitId: string, linkId: string): Promise<string | null> {
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
        inArray(s.occurrences.severity, ["expired", "critical"]),
        isNull(s.occurrences.deletedAt),
      ),
    )
    .orderBy(s.occurrences.daysToExpiry);
  if (!items.length) return null;

  const lines = items.map((i) => {
    const when = i.severity === "expired" ? `VENCIDO (${formatIsoBr(i.expiryDate, false)})` : `vence ${formatIsoBr(i.expiryDate, false)} (${describeDays(i.days ?? 0)})`;
    const qty = i.quantity != null ? ` · ${i.quantity} ${i.unit}` : "";
    return `• ${i.product} – ${when}${qty} · ${LOCATION_LABEL[i.location as Location] ?? i.location}`;
  });
  return [
    "⚠️ *Validade crítica – SUINCO*",
    `*Promotor:* ${v.promoter}`,
    `*Loja:* ${v.store}${v.code ? ` · ${v.code}` : ""}`,
    `*Cidade:* ${v.city}`,
    `*Visita:* ${formatIsoBr(v.visitDate)}`,
    "",
    `*${items.length} ${items.length === 1 ? "item crítico" : "itens críticos"}:*`,
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
    const to = recipients();
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
    const text = await buildCriticalVisitMessage(visitId, n.id);
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
