/**
 * Aviso de armazenamento no WhatsApp da equipe MCX (CallMeBot).
 *
 * Mede o espaço das fotos (bucket do Supabase; em desenvolvimento, a soma dos
 * arquivos registrados) e do banco de dados, frente aos limites do plano
 * (STORAGE_PHOTOS_LIMIT_GB, padrão 1 GB = Supabase grátis; STORAGE_DB_LIMIT_GB,
 * padrão 0,5 GB). Envia:
 *   - toda segunda-feira: o relatório da semana (com o crescimento e a previsão);
 *   - em qualquer dia: alerta ao passar de 80% e de 100% (no máximo 1 por semana por nível).
 * Quem recebe: os números das Configurações com "aviso de armazenamento" ligado.
 * O controle do que já foi enviado fica na auditoria (entidade "storage").
 * É chamado uma vez por dia (GitHub Actions → /api/cron/storage) e pode ser
 * chamado de novo sem duplicar mensagens.
 */
import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { audit } from "./audit";
import { mergeSettings } from "@/lib/settings";
import { recipients, sendCallMeBot } from "./whatsapp-alert";
import { rowsOf } from "./promoter";

const GB = 1024 ** 3;
const limitGb = (env: string | undefined, d: number) => (Number(env) > 0 ? Number(env) : d);

export interface StorageUsage {
  photosBytes: number;
  photosLimit: number;
  photosEstimated: boolean;
  dbBytes: number;
  dbLimit: number;
}

export async function measureStorage(): Promise<StorageUsage> {
  const db = await getDb();
  let photosBytes = 0;
  let photosEstimated = false;
  try {
    const bucket = process.env.SUPABASE_BUCKET ?? "campo-evidencias";
    const r = rowsOf<{ bytes: string | number }>(await db.execute(sql`select coalesce(sum((metadata->>'size')::bigint), 0) as bytes from storage.objects where bucket_id = ${bucket}`));
    photosBytes = Number(r[0]?.bytes ?? 0);
  } catch {
    // Sem o esquema "storage" (desenvolvimento): soma dos arquivos registrados + ~20% das miniaturas.
    const [r] = await db.select({ bytes: sql<string>`coalesce(sum(${s.photos.bytes}), 0)` }).from(s.photos);
    photosBytes = Math.round(Number(r?.bytes ?? 0) * 1.2);
    photosEstimated = true;
  }
  const d = rowsOf<{ bytes: string | number }>(await db.execute(sql`select pg_database_size(current_database()) as bytes`));
  return {
    photosBytes,
    photosLimit: limitGb(process.env.STORAGE_PHOTOS_LIMIT_GB, 1) * GB,
    photosEstimated,
    dbBytes: Number(d[0]?.bytes ?? 0),
    dbLimit: limitGb(process.env.STORAGE_DB_LIMIT_GB, 0.5) * GB,
  };
}

const fmt = (b: number) => (b >= GB ? `${String(Number((b / GB).toFixed(2))).replace(".", ",")} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const pctOf = (u: number, l: number) => Math.round((u / l) * 100);

/** Dia da semana em São Paulo (1 = segunda). */
function weekdaySp(now: Date): number {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(d);
}

export function storageMessage(u: StorageUsage, prev: { photosBytes: number; at: Date } | null, alertLevel: 0 | 80 | 100): string {
  const pPct = pctOf(u.photosBytes, u.photosLimit);
  const dPct = pctOf(u.dbBytes, u.dbLimit);
  const lines = [
    alertLevel === 100 ? "🚨 *MCX Campo · limite de armazenamento atingido*" : alertLevel === 80 ? "⚠️ *MCX Campo · armazenamento acima de 80%*" : "📦 *MCX Campo · armazenamento da semana*",
    "",
    `*Fotos:* ${fmt(u.photosBytes)} de ${fmt(u.photosLimit)} (${pPct}%)${u.photosEstimated ? " · estimado" : ""}`,
    `*Banco de dados:* ${fmt(u.dbBytes)} de ${fmt(u.dbLimit)} (${dPct}%)`,
  ];
  if (prev) {
    const growth = u.photosBytes - prev.photosBytes;
    const weeks = Math.max(1, (Date.now() - prev.at.getTime()) / (7 * 86_400_000));
    const perWeek = growth / weeks;
    lines.push(`*Na semana:* ${growth >= 0 ? "+" : ""}${fmt(Math.abs(growth))} em fotos`);
    if (perWeek > 0 && u.photosBytes < u.photosLimit) {
      const left = Math.ceil((u.photosLimit - u.photosBytes) / perWeek);
      lines.push(`*Previsão:* no ritmo atual, o limite das fotos chega em ~${left} semana(s).`);
    }
  }
  if (alertLevel === 100) lines.push("", "Novas fotos podem deixar de ser salvas. Hora de migrar as fotos (Cloudflare R2) ou ampliar o plano.");
  else if (alertLevel === 80) lines.push("", "Planeje a migração das fotos (Cloudflare R2) ou a ampliação do plano.");
  return lines.join("\n");
}

async function platformAgencyId(): Promise<string | null> {
  const db = await getDb();
  const [p] = await db.select({ id: s.agencies.id }).from(s.agencies).where(eq(s.agencies.kind, "platform"));
  return p?.id ?? null;
}

/** Números que recebem o aviso (Configurações com o aviso de armazenamento ligado). */
async function storageRecipients() {
  const db = await getDb();
  const agencies = await db.select({ settings: s.agencies.settings }).from(s.agencies).where(eq(s.agencies.status, "active"));
  const seen = new Set<string>();
  const out: { phone: string; apikey: string }[] = [];
  for (const a of agencies) {
    const st = mergeSettings(a.settings);
    if (!st.alerts.storageReport) continue;
    for (const r of recipients(st)) if (!seen.has(r.phone)) seen.add(r.phone) && out.push(r);
  }
  return out;
}

export async function runStorageCheck(now = new Date(), opts: { force?: boolean } = {}): Promise<{ sent: string[]; usage: StorageUsage }> {
  const db = await getDb();
  const usage = await measureStorage();
  const agencyId = await platformAgencyId();
  const to = await storageRecipients();
  const sent: string[] = [];
  if (!agencyId || !to.length) return { sent, usage };

  const logs = (action: string, since: Date) =>
    db
      .select()
      .from(s.auditLogs)
      .where(and(eq(s.auditLogs.agencyId, agencyId), eq(s.auditLogs.entity, "storage"), eq(s.auditLogs.action, action), gte(s.auditLogs.createdAt, since)))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(1);
  const [lastWeekly] = await db
    .select()
    .from(s.auditLogs)
    .where(and(eq(s.auditLogs.agencyId, agencyId), eq(s.auditLogs.entity, "storage"), eq(s.auditLogs.action, "weekly_report")))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(1);
  const prev = lastWeekly ? { photosBytes: Number((lastWeekly.after as { photosBytes?: number } | null)?.photosBytes ?? 0), at: lastWeekly.createdAt } : null;
  const weekAgo = new Date(now.getTime() - 6 * 86_400_000);

  const send = async (text: string, action: string) => {
    const errors: string[] = [];
    for (const r of to) await sendCallMeBot(r.phone, r.apikey, text).catch((e: Error) => errors.push(e.message));
    if (errors.length < to.length) {
      await audit({ agencyId, userId: null }, "storage", "armazenamento", action, { after: { photosBytes: usage.photosBytes, dbBytes: usage.dbBytes } });
      sent.push(action);
    }
    if (errors.length) console.error("[aviso armazenamento]", errors);
  };

  // Relatório semanal: segunda-feira (ou o primeiro de todos, ou forçado pelo botão de teste).
  const weeklyDue = opts.force || !lastWeekly || (weekdaySp(now) === 1 && lastWeekly.createdAt < weekAgo);
  if (weeklyDue) await send(storageMessage(usage, prev, 0), "weekly_report");

  // Alerta de limite: o maior nível atingido, uma vez por semana por nível.
  const pct = Math.max(usage.photosBytes / usage.photosLimit, usage.dbBytes / usage.dbLimit) * 100;
  const level = pct >= 100 ? 100 : pct >= 80 ? 80 : 0;
  if (level && !(await logs(`level_${level}`, weekAgo)).length) await send(storageMessage(usage, prev, level), `level_${level}`);
  return { sent, usage };
}
