/** Assistente com consultas: ferramentas somente leitura, permissões e o laço de ferramentas. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { addDays, todayIso } from "../src/lib/dates";
import type { Actor } from "../src/server/demands";
import type { Streamer } from "../src/server/assistant";

let db: DB;
let tools: typeof import("../src/server/assistant-tools");
let demands: typeof import("../src/server/demands");
let assistant: typeof import("../src/server/assistant");
let eduardo: Actor, tainara: Actor;
let clientId: string, categoryId: string;
const today = todayIso();

before(async () => {
  delete process.env.CAMPO_READONLY_DATABASE_URL;
  db = await memDb();
  tools = await import("../src/server/assistant-tools");
  demands = await import("../src/server/demands");
  assistant = await import("../src/server/assistant");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  tainara = actor("tainara");
  clientId = (await db.select().from(s.clients))[0].id;
  categoryId = (await db.select().from(s.categories))[0].id;
});

async function newDemand(title: string, assigneeId: string, due: string) {
  const r = await demands.createDemand(eduardo, { title, clientId, categoryId, assigneeId, dueDate: today, priority: "medium" }, { confirmDuplicate: true });
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) await db.update(s.demands).set({ dueDate: due }).where(eq(s.demands.id, (r as unknown as { id: string }).id));
}

describe("ferramentas de consulta do Assistente", () => {
  test("sem a leitura do Campo, só as ferramentas do Operações", () => {
    const names = tools.assistantTools().map((t) => t.name);
    assert.deepEqual(names, ["resumo_do_dia", "buscar_demandas"]);
    assert.match(tools.toolsInstructions(today), /NÃO está ligada/);
  });

  test("resumo do dia: atrasadas, vencendo hoje e por responsável", async () => {
    await newDemand("Teste atrasada do Eduardo", eduardo.id, addDays(today, -3));
    await newDemand("Teste de hoje da Tainara", tainara.id, today);
    const r = await tools.runAssistantTool(eduardo, "resumo_do_dia", {});
    assert.ok(!r.isError, r.text);
    const data = JSON.parse(r.text);
    const late = data.operacoes.demandas.lista_atrasadas.map((d: { titulo: string }) => d.titulo);
    const due = data.operacoes.demandas.lista_vencem_no_dia.map((d: { titulo: string }) => d.titulo);
    assert.ok(late.includes("Teste atrasada do Eduardo"));
    assert.ok(due.includes("Teste de hoje da Tainara"));
    assert.equal(data.campo.aviso, "Leitura do MCX Campo ainda não ligada.");
  });

  test("operacional só vê as próprias demandas (mesma regra da tela)", async () => {
    const r = await tools.runAssistantTool(tainara, "buscar_demandas", { situacao: "abertas", limite: 60 });
    const data = JSON.parse(r.text);
    assert.ok(data.demandas.every((d: { responsavel: string }) => d.responsavel === "Tainara" || d.responsavel.startsWith("Tainara")), r.text);
    assert.ok(!data.demandas.some((d: { titulo: string }) => d.titulo === "Teste atrasada do Eduardo"));
  });

  test("ferramenta de Campo sem configuração responde com aviso, sem erro", async () => {
    const r = await tools.runAssistantTool(eduardo, "campo_detalhe", { tipo: "rupturas", de: today, ate: today });
    assert.equal(r.isError, true);
    assert.match(r.text, /não ligada/);
  });

  test("o turno envia as ferramentas e executa a consulta pedida pelo modelo", async () => {
    let asked = "";
    const fake: Streamer = async (req, onText) => {
      assert.ok(req.tools?.some((t) => t.name === "resumo_do_dia"));
      assert.doesNotMatch(req.system, /não tem acesso aos dados do sistema MCX/);
      asked = (await req.runTool!("buscar_demandas", { situacao: "atrasadas" })).text;
      onText("Resumo pronto.");
      return { text: "Resumo pronto.", stopReason: "end_turn", usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 } };
    };
    await assistant.saveAssistantConfig(eduardo, { enabled: true, allowedUserIds: [eduardo.id] });
    const r = await assistant.runTurn(eduardo, { conversationId: null, text: "Como foi o dia?", files: [] }, fake, { hasKey: true });
    assert.ok(r.ok, JSON.stringify(r));
    assert.match(asked, /Teste atrasada do Eduardo/);
  });

  test("prompt antigo salvo perde a frase de que não vê dados", () => {
    assert.equal(assistant.withoutNoDataLine("Regra A\n- Você não tem acesso aos dados do sistema MCX nem pode executar ações nele.\nRegra B"), "Regra A\nRegra B");
  });

  test("tarefa repetida: vira rotina, aparece no dia certo e operacional só repete para si", async () => {
    const routines = await import("../src/server/routines");
    const base = { clientId, categoryId, priority: "medium" as const, startDate: today };
    const weekday = new Date(`${today}T12:00:00`).getDay();
    const r = await routines.createRepeatingDemand(eduardo, { ...base, title: "Conferir estoque semanal teste", assigneeId: eduardo.id }, { kind: "weekly", weekdays: [weekday] });
    assert.ok(r.ok, JSON.stringify(r));
    const [rt] = await db.select().from(s.routines).where(eq(s.routines.name, "Conferir estoque semanal teste"));
    assert.equal(rt.frequency, "weekly");
    assert.deepEqual(rt.weekdays, [weekday]);
    const made = (await db.select().from(s.demands).where(eq(s.demands.routineId, rt.id))).length;
    assert.equal(made, 1, "a primeira repetição é hoje: já aparece");
    const other = (weekday + 3) % 7;
    assert.ok((await routines.createRepeatingDemand(eduardo, { ...base, title: "Outra repetida teste", assigneeId: eduardo.id }, { kind: "weekly", weekdays: [other] })).ok);
    const [rt2] = await db.select().from(s.routines).where(eq(s.routines.name, "Outra repetida teste"));
    assert.equal((await db.select().from(s.demands).where(eq(s.demands.routineId, rt2.id))).length, 0, "só aparece no dia da semana escolhido");
    const daily = await routines.createRepeatingDemand(eduardo, { ...base, title: "Diária teste", assigneeId: eduardo.id }, { kind: "daily" });
    assert.ok(daily.ok);
    const [rt3] = await db.select().from(s.routines).where(eq(s.routines.name, "Diária teste"));
    assert.equal(rt3.frequency, "interval");
    assert.equal(rt3.intervalDays, 1);
    const denied = await routines.createRepeatingDemand(tainara, { ...base, title: "Repetida para o Eduardo", assigneeId: eduardo.id }, { kind: "daily" });
    assert.equal(denied.ok, false);
    assert.ok((await routines.createRepeatingDemand(tainara, { ...base, title: "Repetida da Tainara", assigneeId: tainara.id }, { kind: "monthly", monthDay: 5 })).ok);
  });

  test("a leitura do Campo só roda em transação READ ONLY e só com consultas fixas", () => {
    const src = readFileSync("src/server/campo-readonly.ts", "utf8");
    assert.match(src, /begin\("read only"/);
    assert.doesNotMatch(src, /\b(insert|update|delete|truncate|alter|drop|create)\s/i);
    assert.doesNotMatch(src, /sql\.unsafe/);
  });
});
