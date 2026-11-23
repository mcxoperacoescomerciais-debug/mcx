/** Fase 7 — Assistente MCX: custo, limites, liberação, conversas privadas e turno com API simulada. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import {
  attachmentError,
  budgetState,
  costMicros,
  DEFAULT_PRICES,
  historyForApi,
  HISTORY_LIMIT,
  monthProjection,
  normalizeConfig,
  titleFrom,
} from "../src/lib/assistant";
import { can } from "../src/lib/permissions";
import type { Actor } from "../src/server/demands";
import type { Streamer, TurnRequest } from "../src/server/assistant";

let db: DB;
let assistant: typeof import("../src/server/assistant");
let eduardo: Actor, maria: Actor, tainara: Actor;
const TODAY = "2026-11-23";

/** API simulada: devolve um texto em 2 pedaços e um uso fixo; guarda o último pedido. */
let lastRequest: TurnRequest | null = null;
let calls = 0;
const fake: Streamer = async (req, onText) => {
  calls++;
  lastRequest = req;
  onText("Olá, ");
  onText("Tainara.");
  return { text: "Olá, Tainara.", stopReason: "end_turn", usage: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 } };
};

before(async () => {
  db = await memDb();
  assistant = await import("../src/server/assistant");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  maria = actor("maria");
  tainara = actor("tainara");
});

describe("regras puras do Assistente", () => {
  test("custo em micro-dólares pelo preço por milhão de tokens", () => {
    // Haiku 5.5: 1.000 de entrada × 0,10 + 200 de saída × 0,50 = 100 + 100 micro-dólares
    assert.equal(costMicros({ input: 1000, output: 200, cacheRead: 0, cacheWrite: 0 }, DEFAULT_PRICES["claude-haiku-5-5"]), 200);
    assert.equal(costMicros({ input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }, DEFAULT_PRICES["claude-sonnet-5-5"]), 2_000_000);
    assert.equal(costMicros({ input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 }, DEFAULT_PRICES["claude-sonnet-5-5"]), 100_000);
  });
  test("80% avisa, 100% bloqueia; limite zero bloqueia", () => {
    assert.equal(budgetState(7_999_999, 10), "ok");
    assert.equal(budgetState(8_000_000, 10), "warn");
    assert.equal(budgetState(10_000_000, 10), "blocked");
    assert.equal(budgetState(0, 0), "blocked");
  });
  test("projeção do mês pelo ritmo até hoje", () => {
    assert.equal(monthProjection(1_000_000, "2026-11-10"), 3_000_000);
    assert.equal(monthProjection(0, "2026-11-01"), 0);
  });
  test("histórico: últimas mensagens, começa no usuário, anexo antigo vira só o nome", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const h = historyForApi(many);
    assert.ok(h.length <= HISTORY_LIMIT);
    assert.equal(h[0].role, "user");
    assert.equal(h[h.length - 1].content, "m29");
    const withFile = historyForApi([{ role: "user", content: "veja", attachments: [{ name: "pedido.jpg" }] }, { role: "assistant", content: "ok" }]);
    assert.match(withFile[0].content, /pedido\.jpg/);
    const doubled = historyForApi([{ role: "user", content: "a" }, { role: "user", content: "b" }]);
    assert.equal(doubled.length, 1, "duas do mesmo papel viram uma");
  });
  test("anexos: só foto e PDF, até 3, até 8 MB", () => {
    assert.equal(attachmentError([{ name: "a.jpg", type: "image/jpeg", size: 1000 }]), null);
    assert.match(attachmentError([{ name: "a.docx", type: "application/msword", size: 10 }])!, /foto|PDF/);
    assert.match(attachmentError([{ name: "a.pdf", type: "application/pdf", size: 9 * 1024 * 1024 }])!, /MB/);
    assert.match(attachmentError(Array.from({ length: 4 }, () => ({ name: "a.png", type: "image/png", size: 1 })))!, /No máximo/);
  });
  test("configuração salva com defeito volta ao padrão sem quebrar", () => {
    const c = normalizeConfig({ model: "gpt-qualquer", monthlyGlobalUsd: -5, retentionMonths: 999, effort: "max", systemPrompt: "curto" });
    assert.equal(c.model, "claude-haiku-5-5");
    assert.equal(c.monthlyGlobalUsd, 0);
    assert.equal(c.retentionMonths, 60);
    assert.equal(c.effort, "low");
    assert.ok(c.systemPrompt.length > 100);
    assert.equal(c.enabled, false, "desligado até o dono ligar");
    assert.equal(titleFrom(""), "Nova conversa");
  });
  test("perfis: todos podem ser liberados; só o dono ajusta", () => {
    assert.ok(can("operacional", "assistant.use"));
    assert.ok(can("gestor", "assistant.use"));
    assert.ok(!can("gestor", "assistant.manage"));
    assert.ok(can("owner", "assistant.manage"));
  });
});

describe("liberação e limites", () => {
  test("começa desligado; só o dono liga e libera", async () => {
    let a = await assistant.assistantAccess(tainara, true, TODAY);
    assert.equal(a.canUse, false);
    assert.match(a.reason!, /desligado/);
    assert.equal((await assistant.saveAssistantConfig(maria, { enabled: true })).ok, false);
    assert.ok((await assistant.saveAssistantConfig(eduardo, { enabled: true, allowedUserIds: [tainara.id, "nao-existe"] })).ok);
    assert.deepEqual((await assistant.getAssistantConfig()).allowedUserIds, [tainara.id], "id inexistente não entra");
    a = await assistant.assistantAccess(maria, true, TODAY);
    assert.match(a.reason!, /liberado/);
    a = await assistant.assistantAccess(tainara, false, TODAY);
    assert.match(a.reason!, /chave/);
    a = await assistant.assistantAccess(tainara, true, TODAY);
    assert.equal(a.canUse, true);
  });

  test("turno: grava pergunta e resposta, custo e streaming; arquivo não fica no banco", async () => {
    const deltas: string[] = [];
    const r = await assistant.runTurn(tainara, { conversationId: null, text: "Extrai o pedido desta foto", files: [{ name: "pedido.jpg", type: "image/jpeg", size: 3, bytes: new Uint8Array([1, 2, 3]) }] }, fake, { hasKey: true, today: TODAY, onText: (d) => deltas.push(d) });
    assert.ok(r.ok, r.ok ? "" : r.error);
    if (!r.ok) return;
    assert.deepEqual(deltas, ["Olá, ", "Tainara."]);
    assert.equal(r.costMicros, 200);
    const msgs = await db.select().from(s.aiMessages).where(eq(s.aiMessages.conversationId, r.conversationId));
    assert.deepEqual(msgs.map((m) => m.role).sort(), ["assistant", "user"]);
    assert.deepEqual(msgs.find((m) => m.role === "user")!.attachments, [{ name: "pedido.jpg", type: "image/jpeg", size: 3 }]);
    const [conv] = await db.select().from(s.aiConversations).where(eq(s.aiConversations.id, r.conversationId));
    assert.equal(conv.title, "Extrai o pedido desta foto");
    const content = lastRequest!.messages[0].content as { type: string }[];
    assert.deepEqual(content.map((b) => b.type), ["image", "text"]);
    assert.equal(lastRequest!.model, "claude-haiku-5-5");
    const usage = await db.select().from(s.aiUsage).where(eq(s.aiUsage.userId, tainara.id));
    assert.equal(usage.length, 1);
    assert.equal(usage[0].costMicros, 200);

    // Segunda mensagem: histórico vai junto, sem reenviar a imagem.
    const r2 = await assistant.runTurn(tainara, { conversationId: r.conversationId, text: "E o total?", files: [] }, fake, { hasKey: true, today: TODAY });
    assert.ok(r2.ok);
    assert.equal(lastRequest!.messages.length, 3);
    assert.match(lastRequest!.messages[0].content as string, /pedido\.jpg/);
  });

  test("conversa é só de quem criou", async () => {
    const [conv] = await db.select().from(s.aiConversations).where(eq(s.aiConversations.userId, tainara.id));
    assert.equal(await assistant.getConversation(eduardo, conv.id), null);
    assert.equal((await assistant.renameConversation(eduardo, conv.id, "x")).ok, false);
    assert.equal((await assistant.archiveConversation(maria, conv.id)).ok, false);
    assert.equal((await assistant.listConversations(eduardo)).length, 0);
    const r = await assistant.runTurn(eduardo, { conversationId: conv.id, text: "oi", files: [] }, fake, { hasKey: true, today: TODAY });
    assert.equal(r.ok, false);
    assert.ok((await assistant.renameConversation(tainara, conv.id, "Pedido Fini")).ok);
    assert.ok((await assistant.archiveConversation(tainara, conv.id)).ok);
    assert.equal((await assistant.listConversations(tainara)).length, 0);
    assert.equal((await assistant.listConversations(tainara, true)).length, 1);
  });

  test("erro da API: resposta marcada com erro, sem custo", async () => {
    const failing: Streamer = async () => {
      throw new Error("caiu");
    };
    const before = (await db.select().from(s.aiUsage)).length;
    const r = await assistant.runTurn(tainara, { conversationId: null, text: "teste de falha", files: [] }, failing, { hasKey: true, today: TODAY });
    assert.equal(r.ok, false);
    assert.equal((await db.select().from(s.aiUsage)).length, before);
    const [err] = await db.select().from(s.aiMessages).where(and(eq(s.aiMessages.role, "assistant"), eq(s.aiMessages.content, "")));
    assert.ok(err?.error);
  });

  test("80% gera um único aviso ao dono; 100% bloqueia sem chamar a API", async () => {
    await assistant.saveAssistantConfig(eduardo, { monthlyGlobalUsd: 1, monthlyPerUserUsd: 1 });
    await db.insert(s.aiUsage).values({ userId: tainara.id, model: "claude-haiku-5-5", costMicros: 800_000, day: TODAY });
    assert.ok((await assistant.runTurn(tainara, { conversationId: null, text: "mais uma", files: [] }, fake, { hasKey: true, today: TODAY })).ok);
    assert.ok((await assistant.runTurn(tainara, { conversationId: null, text: "e outra", files: [] }, fake, { hasKey: true, today: TODAY })).ok);
    const alerts = await db.select().from(s.alertRuns).where(eq(s.alertRuns.kind, "assistant_budget_80"));
    assert.equal(alerts.length, 1, "um aviso por mês");
    const [demand] = await db.select().from(s.demands).where(eq(s.demands.id, alerts[0].demandId));
    assert.equal(demand.assigneeId, eduardo.id, "aviso vai para o dono");

    await db.insert(s.aiUsage).values({ userId: tainara.id, model: "claude-haiku-5-5", costMicros: 300_000, day: TODAY });
    const n = calls;
    const r = await assistant.runTurn(tainara, { conversationId: null, text: "bloqueado?", files: [] }, fake, { hasKey: true, today: TODAY });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /limite/);
    assert.equal(calls, n, "não chama a API depois do limite");
    // No mês seguinte libera de novo.
    assert.equal((await assistant.assistantAccess(tainara, true, "2026-12-01")).canUse, true);
  });

  test("painel de uso só para o dono, com dia, mês, projeção e por pessoa", async () => {
    assert.equal(await assistant.usageReport(maria, TODAY), null);
    const r = (await assistant.usageReport(eduardo, TODAY))!;
    assert.ok(r.month >= 1_100_000);
    assert.equal(r.today, r.month);
    assert.ok(r.projection > r.month);
    assert.equal(r.byUser[0].label, "Tainara");
    assert.equal(r.global, "blocked");
  });

  test("conversas mais velhas que o prazo de guarda são apagadas", async () => {
    const [old] = await db.insert(s.aiConversations).values({ userId: tainara.id, title: "antiga", updatedAt: new Date("2026-01-01T00:00:00Z") }).returning();
    await db.insert(s.aiMessages).values({ conversationId: old.id, role: "user", content: "velha" });
    const n = await assistant.purgeOldConversations(TODAY);
    assert.equal(n, 1);
    assert.equal((await db.select().from(s.aiMessages).where(eq(s.aiMessages.conversationId, old.id))).length, 0);
  });
});
