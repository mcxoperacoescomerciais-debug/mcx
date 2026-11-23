/**
 * Assistente MCX (Fase 7): conversas, limites de custo, uso e configuração.
 * Cada pessoa vê só as próprias conversas. O dono liga/desliga, libera
 * usuários, escolhe o modelo e define os limites. A chamada à API fica em
 * ./anthropic.ts (injetável, para testar sem rede).
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import {
  attachmentError,
  ATTACH_TYPES,
  budgetState,
  costMicros,
  fmtUsd,
  historyForApi,
  MAX_MESSAGE_CHARS,
  monthProjection,
  monthStart,
  normalizeConfig,
  titleFrom,
  type AssistantConfig,
  type AssistantModel,
  type BudgetState,
  type Effort,
  type TokenUsage,
} from "@/lib/assistant";
import { addDays, todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { openAlertDemand } from "./contracts";
import { getDb, schema as s } from "./db";
import type { Actor, Result } from "./demands";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
const CONFIG_KEY = "assistant_config";

export interface TurnRequest {
  model: AssistantModel;
  effort: Effort;
  system: string;
  messages: Anthropic.Beta.Messages.BetaMessageParam[];
}
export interface TurnResult {
  text: string;
  usage: TokenUsage;
  stopReason: string | null;
}
export type Streamer = (req: TurnRequest, onText: (delta: string) => void, signal?: AbortSignal) => Promise<TurnResult>;

// ---------- Configuração (só o dono) ----------

export async function getAssistantConfig(): Promise<AssistantConfig> {
  const db = await getDb();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, CONFIG_KEY));
  return normalizeConfig(row?.value);
}

export async function saveAssistantConfig(actor: Actor, patch: Partial<AssistantConfig>): Promise<Result> {
  if (!can(actor.role, "assistant.manage")) return fail("Só o dono ajusta o Assistente.");
  const before = await getAssistantConfig();
  const next = normalizeConfig({ ...before, ...patch, prices: { ...before.prices, ...(patch.prices ?? {}) } });
  const db = await getDb();
  const ids = new Set((await db.select({ id: s.users.id }).from(s.users)).map((u) => u.id));
  next.allowedUserIds = next.allowedUserIds.filter((x) => ids.has(x));
  await db.insert(s.settings).values({ key: CONFIG_KEY, value: next }).onConflictDoUpdate({ target: s.settings.key, set: { value: next, updatedAt: new Date() } });
  const { systemPrompt: oldPrompt, ...beforeLog } = before;
  const { systemPrompt: newPrompt, ...afterLog } = next;
  await audit(actor.id, "assistant", "config", "updated", { before: beforeLog, after: { ...afterLog, systemPromptChanged: oldPrompt !== newPrompt } });
  return { ok: true, message: "Configuração do Assistente salva." };
}

// ---------- Gasto do mês e liberação ----------

async function spentSince(from: string, userId?: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${s.aiUsage.costMicros}), 0)::bigint` })
    .from(s.aiUsage)
    .where(userId ? and(gte(s.aiUsage.day, from), eq(s.aiUsage.userId, userId)) : gte(s.aiUsage.day, from));
  return Number(row?.total ?? 0);
}

export interface AssistantAccess {
  canUse: boolean;
  /** Por que não pode usar (mensagem para a tela). */
  reason: string | null;
  global: BudgetState;
  user: BudgetState;
  spentUserMicros: number;
  limitUserUsd: number;
  model: AssistantModel;
}

export async function assistantAccess(actor: Actor, hasKey: boolean, today: string = todayIso()): Promise<AssistantAccess> {
  const config = await getAssistantConfig();
  const from = monthStart(today);
  const [global, mine] = await Promise.all([spentSince(from), spentSince(from, actor.id)]);
  const g = budgetState(global, config.monthlyGlobalUsd);
  const u = budgetState(mine, config.monthlyPerUserUsd);
  let reason: string | null = null;
  if (!can(actor.role, "assistant.use")) reason = "Seu perfil não usa o Assistente.";
  else if (!config.enabled) reason = "O Assistente está desligado. O dono liga em Assistente: uso e ajustes.";
  else if (!config.allowedUserIds.includes(actor.id)) reason = "O Assistente ainda não foi liberado para você. Peça ao Eduardo.";
  else if (!hasKey) reason = "O Assistente ainda não tem a chave da API configurada no servidor. Avise o Eduardo.";
  else if (g === "blocked") reason = "O limite mensal de gasto do Assistente foi atingido. Volta no início do próximo mês ou quando o dono aumentar o limite.";
  else if (u === "blocked") reason = "Você atingiu o seu limite mensal do Assistente. Volta no início do próximo mês ou quando o dono aumentar o limite.";
  return { canUse: reason === null, reason, global: g, user: u, spentUserMicros: mine, limitUserUsd: config.monthlyPerUserUsd, model: config.model };
}

// ---------- Conversas ----------

export async function listConversations(actor: Actor, archived = false) {
  if (!can(actor.role, "assistant.use")) return [];
  const db = await getDb();
  return db
    .select({ id: s.aiConversations.id, title: s.aiConversations.title, updatedAt: s.aiConversations.updatedAt })
    .from(s.aiConversations)
    .where(and(eq(s.aiConversations.userId, actor.id), eq(s.aiConversations.archived, archived)))
    .orderBy(desc(s.aiConversations.updatedAt))
    .limit(100);
}

async function ownConversation(actor: Actor, id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [c] = await db.select().from(s.aiConversations).where(and(eq(s.aiConversations.id, id), eq(s.aiConversations.userId, actor.id)));
  return c ?? null;
}

export async function getConversation(actor: Actor, id: string) {
  if (!can(actor.role, "assistant.use")) return null;
  const c = await ownConversation(actor, id);
  if (!c) return null;
  const db = await getDb();
  const messages = await db.select().from(s.aiMessages).where(eq(s.aiMessages.conversationId, id)).orderBy(asc(s.aiMessages.createdAt));
  return { conversation: c, messages };
}

export async function renameConversation(actor: Actor, id: string, title: string): Promise<Result> {
  const c = await ownConversation(actor, id);
  if (!c) return fail("Conversa não encontrada.");
  const t = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return fail("Dê um nome à conversa.");
  const db = await getDb();
  await db.update(s.aiConversations).set({ title: t }).where(eq(s.aiConversations.id, id));
  return { ok: true };
}

export async function archiveConversation(actor: Actor, id: string, archived = true): Promise<Result> {
  const c = await ownConversation(actor, id);
  if (!c) return fail("Conversa não encontrada.");
  const db = await getDb();
  await db.update(s.aiConversations).set({ archived }).where(eq(s.aiConversations.id, id));
  return { ok: true, message: archived ? "Conversa arquivada." : "Conversa restaurada." };
}

/** Conversas mais antigas que o prazo de guarda são apagadas (mensagens juntas; o uso fica sem o vínculo). */
export async function purgeOldConversations(today: string = todayIso()): Promise<number> {
  const config = await getAssistantConfig();
  const cutoff = new Date(`${addDays(today, -Math.round(config.retentionMonths * 30.4))}T00:00:00Z`);
  const db = await getDb();
  const gone = await db.delete(s.aiConversations).where(lt(s.aiConversations.updatedAt, cutoff)).returning({ id: s.aiConversations.id });
  if (gone.length) await audit(null, "assistant", "retention", "purged", { after: { conversations: gone.length, months: config.retentionMonths }, source: "retenção" });
  return gone.length;
}

// ---------- Mensagem (turno) ----------

export interface TurnFile {
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}

export interface TurnInput {
  conversationId: string | null;
  text: string;
  files: TurnFile[];
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/**
 * Valida, grava a pergunta e chama a API (streaming via onText). Grava a
 * resposta e o custo mesmo se a pessoa fechar a tela no meio.
 */
export async function runTurn(
  actor: Actor,
  input: TurnInput,
  streamer: Streamer,
  opts: { hasKey: boolean; onText?: (delta: string) => void; onStart?: (conversationId: string) => void; signal?: AbortSignal; today?: string },
): Promise<Result<{ conversationId: string; text: string; costMicros: number }>> {
  const today = opts.today ?? todayIso();
  const access = await assistantAccess(actor, opts.hasKey, today);
  if (!access.canUse) return fail(access.reason!);
  const text = input.text.trim();
  if (!text && !input.files.length) return fail("Escreva a mensagem.");
  if (text.length > MAX_MESSAGE_CHARS) return fail(`Mensagem longa demais (máximo de ${MAX_MESSAGE_CHARS.toLocaleString("pt-BR")} caracteres).`);
  const attachError = attachmentError(input.files);
  if (attachError) return fail(attachError);

  const config = await getAssistantConfig();
  const db = await getDb();
  let conversationId = input.conversationId;
  if (conversationId) {
    const c = await ownConversation(actor, conversationId);
    if (!c) return fail("Conversa não encontrada.");
    if (c.archived) await db.update(s.aiConversations).set({ archived: false }).where(eq(s.aiConversations.id, c.id));
  } else {
    const [c] = await db.insert(s.aiConversations).values({ userId: actor.id, title: titleFrom(text || input.files[0]?.name || "") }).returning({ id: s.aiConversations.id });
    conversationId = c.id;
  }
  const previous = await db.select().from(s.aiMessages).where(eq(s.aiMessages.conversationId, conversationId)).orderBy(asc(s.aiMessages.createdAt));
  const attachments = input.files.map((f) => ({ name: f.name.slice(0, 200), type: f.type, size: f.size }));
  await db.insert(s.aiMessages).values({ conversationId, role: "user", content: text, attachments });
  await db.update(s.aiConversations).set({ updatedAt: new Date() }).where(eq(s.aiConversations.id, conversationId));
  opts.onStart?.(conversationId);

  const history = historyForApi(previous.filter((m) => !m.error || m.content).map((m) => ({ role: m.role, content: m.content, attachments: m.attachments })));
  const current: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...input.files.map((f): Anthropic.Beta.Messages.BetaContentBlockParam =>
      ATTACH_TYPES[f.type] === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(f.bytes) }, title: f.name.slice(0, 200) }
        : { type: "image", source: { type: "base64", media_type: f.type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: toBase64(f.bytes) } },
    ),
    { type: "text", text: text || "Veja o anexo." },
  ];
  // A última do histórico pode ser do usuário (resposta anterior falhou): junta numa mensagem só.
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const last = messages[messages.length - 1];
  if (last?.role === "user") messages[messages.length - 1] = { role: "user", content: [{ type: "text", text: last.content as string }, ...current] };
  else messages.push({ role: "user", content: current });

  const req: TurnRequest = { model: config.model, effort: config.effort, system: config.systemPrompt, messages };
  let answer = "";
  try {
    const result = await streamer(req, (d) => {
      answer += d;
      opts.onText?.(d);
    }, opts.signal);
    const refused = result.stopReason === "refusal";
    const cost = costMicros(result.usage, config.prices[config.model]);
    await db.insert(s.aiMessages).values({ conversationId, role: "assistant", content: result.text || answer, error: refused ? "O modelo não respondeu a este pedido por segurança. Reformule a pergunta." : result.stopReason === "max_tokens" ? "Resposta cortada por tamanho." : null });
    await db.insert(s.aiUsage).values({ userId: actor.id, conversationId, model: config.model, inputTokens: result.usage.input, outputTokens: result.usage.output, cacheReadTokens: result.usage.cacheRead, cacheWriteTokens: result.usage.cacheWrite, costMicros: cost, day: today });
    await db.update(s.aiConversations).set({ updatedAt: new Date() }).where(eq(s.aiConversations.id, conversationId));
    await audit(actor.id, "assistant", conversationId, "message", { after: { model: config.model, attachments: attachments.length, costMicros: cost } });
    await warnIfNearLimit(config, today);
    return { ok: true, conversationId, text: result.text || answer, costMicros: cost };
  } catch (err) {
    const { apiErrorMessage } = await import("./anthropic").catch(() => ({ apiErrorMessage: () => "Não consegui responder agora. Tente de novo." }));
    const message = apiErrorMessage(err);
    await db.insert(s.aiMessages).values({ conversationId, role: "assistant", content: answer, error: message });
    await audit(actor.id, "assistant", conversationId, "failed", { after: { model: config.model, error: message } });
    return fail(message);
  }
}

/** 80% do limite global do mês: uma demanda (única por mês) para o dono. */
async function warnIfNearLimit(config: AssistantConfig, today: string) {
  const spent = await spentSince(monthStart(today));
  if (budgetState(spent, config.monthlyGlobalUsd) === "ok") return;
  const db = await getDb();
  const [internal] = await db.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.kind, "internal")).limit(1);
  if (!internal) return;
  await openAlertDemand(
    db,
    "assistant_budget_80",
    today.slice(0, 7),
    {
      clientId: internal.id,
      title: `Assistente MCX passou de 80% do limite do mês (${fmtUsd(spent)} de US$ ${config.monthlyGlobalUsd})`,
      description: "Ao chegar a 100%, o chat bloqueia novas mensagens até o mês virar. Ajuste o limite ou o modelo em Assistente: uso e ajustes.",
      dueDate: today,
    },
    "owner",
  );
}

// ---------- Painel de uso (dono) ----------

export async function usageReport(actor: Actor, today: string = todayIso()) {
  if (!can(actor.role, "assistant.manage")) return null;
  const db = await getDb();
  const from = monthStart(today);
  const rows = await db
    .select({ userId: s.aiUsage.userId, name: s.users.name, model: s.aiUsage.model, day: s.aiUsage.day, cost: s.aiUsage.costMicros, input: s.aiUsage.inputTokens, output: s.aiUsage.outputTokens, cacheRead: s.aiUsage.cacheReadTokens })
    .from(s.aiUsage)
    .innerJoin(s.users, eq(s.users.id, s.aiUsage.userId))
    .where(gte(s.aiUsage.day, from));
  const sum = (list: typeof rows) => list.reduce((n, r) => n + r.cost, 0);
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const map = new Map<string, { label: string; cost: number; messages: number }>();
    for (const r of rows) {
      const k = key(r);
      const g = map.get(k) ?? { label: k, cost: 0, messages: 0 };
      g.cost += r.cost;
      g.messages++;
      map.set(k, g);
    }
    return [...map.values()].sort((a, b) => b.cost - a.cost);
  };
  const month = sum(rows);
  const conversations = rows.length
    ? (await db.select({ n: sql<number>`count(distinct ${s.aiUsage.conversationId})::int` }).from(s.aiUsage).where(gte(s.aiUsage.day, from)))[0]?.n ?? 0
    : 0;
  const config = await getAssistantConfig();
  const allowed = config.allowedUserIds.length ? await db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, config.allowedUserIds)) : [];
  return {
    today: sum(rows.filter((r) => r.day === today)),
    month,
    projection: monthProjection(month, today),
    messages: rows.length,
    conversations,
    avgPerMessage: rows.length ? Math.round(month / rows.length) : 0,
    cacheReadTokens: rows.reduce((n, r) => n + r.cacheRead, 0),
    byUser: group((r) => r.name),
    byModel: group((r) => r.model),
    global: budgetState(month, config.monthlyGlobalUsd),
    limitUsd: config.monthlyGlobalUsd,
    allowed,
  };
}
