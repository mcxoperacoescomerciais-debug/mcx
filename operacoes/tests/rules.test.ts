/** Regras das demandas, fila, datas, anti-duplicata e registro de capacidades. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { addDays, formatRelative, isIsoDate, nextFriday, todayIso, weekday } from "../src/lib/dates";
import { NAV } from "../src/lib/nav";
import { buildQueue, isOverdue, queueGroup } from "../src/lib/queue";
import { looksDuplicate } from "../src/lib/similarity";
import { CAPABILITIES } from "../src/server/capabilities";
import type { Actor } from "../src/server/demands";

let db: DB;
let demands: typeof import("../src/server/demands");
let maria: Actor, tainara: Actor;
let clientId: string, categoryId: string;
const today = todayIso();

before(async () => {
  db = await memDb();
  demands = await import("../src/server/demands");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  maria = actor("maria");
  tainara = actor("tainara");
  clientId = (await db.select().from(s.clients)).find((c) => c.name === "Regis")!.id;
  categoryId = (await db.select().from(s.categories))[0].id;
});

describe("datas (America/Sao_Paulo)", () => {
  test("hoje vira à meia-noite de Brasília, não de UTC", () => {
    assert.equal(todayIso(new Date("2026-11-21T02:30:00Z")), "2026-11-20");
    assert.equal(todayIso(new Date("2026-11-21T03:00:00Z")), "2026-11-21");
  });
  test("atalhos de prazo", () => {
    assert.equal(addDays("2026-11-30", 1), "2026-12-01");
    assert.equal(weekday("2026-11-20"), 5);
    assert.equal(nextFriday("2026-11-20"), "2026-11-20");
    assert.equal(nextFriday("2026-11-21"), "2026-11-27");
    assert.equal(formatRelative("2026-11-21", "2026-11-20"), "Amanhã");
    assert.equal(formatRelative(null, "2026-11-20"), "Sem prazo");
    assert.equal(isIsoDate("2026-02-30"), false);
  });
});

describe("fila", () => {
  const d = (status: string, due: string | null, follow: string | null = null) => ({ status, priority: "medium", dueDate: due, followUpDate: follow }) as never;
  test("grupos e ordem: atrasadas, hoje, cobrar hoje, próximas, aguardando", () => {
    assert.equal(queueGroup(d("todo", addDays(today, -1)), today), "overdue");
    assert.equal(queueGroup(d("doing", today), today), "today");
    assert.equal(queueGroup(d("waiting", addDays(today, 5), today), today), "followup");
    assert.equal(queueGroup(d("waiting", addDays(today, -3), addDays(today, 2)), today), "waiting");
    assert.equal(queueGroup(d("todo", null), today), "next");
    assert.equal(queueGroup(d("done", addDays(today, -1)), today), null);
    const q = buildQueue([d("todo", addDays(today, 3)), d("waiting", null, today), d("todo", today), d("todo", addDays(today, -2))], today);
    assert.deepEqual(q.map((g) => g.group), ["overdue", "today", "followup", "next"]);
  });
  test("atraso é calculado na consulta; concluída nunca está atrasada", () => {
    assert.equal(isOverdue({ status: "todo", dueDate: addDays(today, -1) }, today), true);
    assert.equal(isOverdue({ status: "todo", dueDate: today }, today), false);
    assert.equal(isOverdue({ status: "done", dueDate: addDays(today, -9) }, today), false);
  });
});

describe("demandas", () => {
  const base = (title: string) => ({ title, clientId, categoryId, assigneeId: tainara.id, dueDate: addDays(today, 1) });

  test("campos obrigatórios e “Sem prazo” só com prioridade Baixa", async () => {
    assert.equal((await demands.createDemand(maria, { ...base("ab") })).ok, false);
    assert.equal((await demands.createDemand(maria, { ...base("Sem responsável aaa"), assigneeId: "" })).ok, false);
    assert.equal((await demands.createDemand(maria, { ...base("Sem prazo média bbb"), dueDate: null })).ok, false);
    assert.equal((await demands.createDemand(maria, { ...base("Data torta ccc"), dueDate: "2026-13-40" })).ok, false);
    const low = await demands.createDemand(maria, { ...base("Arrumar pasta de modelos ddd"), dueDate: null, priority: "low" });
    assert.ok(low.ok);
    if (low.ok) assert.equal((await demands.updateDemand(maria, low.id, { priority: "high" })).ok, false, "subir prioridade sem prazo");
  });

  test("anti-duplicata avisa sem bloquear", async () => {
    const first = await demands.createDemand(maria, base("Digitar pedido Bel Chocolate Sup. Castro"));
    assert.ok(first.ok);
    const again = await demands.createDemand(maria, base("digitar pedido bel chocolate - sup castro"));
    assert.equal(again.ok, false);
    assert.ok(!again.ok && again.duplicate, "deve apontar a demanda parecida");
    assert.ok((await demands.createDemand(maria, base("digitar pedido bel chocolate - sup castro"), { confirmDuplicate: true })).ok);
    assert.equal(looksDuplicate("Fechamento mensal Barão", "Fechamento mensal Café Bravo"), false);
    assert.equal(looksDuplicate("Ajustar rota", "Ajustar rota de Sete Lagoas"), true);
  });

  test("aguardando retorno exige de quem e data; histórico grava de → para", async () => {
    const created = await demands.createDemand(maria, base("Cobrar tabela de preço eee"));
    assert.ok(created.ok);
    const id = created.ok ? created.id : "";
    assert.equal((await demands.changeStatus(tainara, id, "waiting")).ok, false);
    assert.equal((await demands.changeStatus(tainara, id, "waiting", { waitingFor: "Regis" })).ok, false);
    assert.ok((await demands.changeStatus(tainara, id, "waiting", { waitingFor: "Regis", followUpDate: addDays(today, 2) })).ok);
    assert.ok((await demands.updateDemand(maria, id, { dueDate: addDays(today, 4), assigneeId: maria.id })).ok);
    assert.ok((await demands.changeStatus(maria, id, "done")).ok);
    const d = await demands.getDemand(maria, id);
    assert.equal(d?.status, "done");
    assert.equal(d?.completedBy, maria.id);
    assert.ok(d?.completedAt);
    assert.equal(d?.waitingFor, null);
    const fields = d!.history.map((h) => h.field);
    for (const f of ["created", "status", "dueDate", "assignee"]) assert.ok(fields.includes(f), `histórico sem ${f}`);
    const status = d!.history.filter((h) => h.field === "status").map((h) => `${h.fromValue}>${h.toValue}`);
    assert.ok(status.includes("A fazer>Aguardando retorno") && status.includes("Aguardando retorno>Concluído"));
  });

  test("checklist registra quem marcou; exclusão é lógica e exige motivo", async () => {
    const created = await demands.createDemand(maria, base("Separar kit de degustação fff"));
    assert.ok(created.ok);
    const id = created.ok ? created.id : "";
    assert.ok((await demands.addChecklistItem(tainara, id, "Colheres")).ok);
    const item = (await demands.getDemand(tainara, id))!.checklist[0];
    assert.ok((await demands.toggleChecklistItem(tainara, item.id, true)).ok);
    const checked = (await demands.getDemand(maria, id))!.checklist[0];
    assert.equal(checked.checkedBy, tainara.id);
    assert.ok(checked.checkedAt);
    assert.equal((await demands.deleteDemand(maria, id, "")).ok, false);
    assert.ok((await demands.deleteDemand(maria, id, "criada em duplicidade")).ok);
    assert.equal(await demands.getDemand(maria, id), null);
    const [row] = await db.select().from(s.demands).where(eq(s.demands.id, id));
    assert.ok(row.deletedAt, "o registro continua no banco");
    const logs = await db.select().from(s.auditLogs).where(eq(s.auditLogs.entityId, id));
    assert.ok(logs.some((l) => l.action === "deleted" && l.reason === "criada em duplicidade"));
  });

  test("categoria sugerida pelo histórico do contratante", async () => {
    const suggestions = await demands.categorySuggestions();
    assert.equal(suggestions[clientId], categoryId);
  });
});

describe("registro de capacidades (manual vivo)", () => {
  test("toda capacidade tem 3 exemplos, perfis e canal", () => {
    const ids = new Set<string>();
    for (const c of CAPABILITIES) {
      assert.ok(!ids.has(c.id), `id repetido: ${c.id}`);
      ids.add(c.id);
      assert.equal(c.examples.length, 3, c.id);
      assert.ok(c.examples.every((e) => e.trim().length >= 10), `${c.id}: exemplo vazio`);
      assert.ok(c.roles.length > 0 && c.channels.length > 0, c.id);
      assert.match(c.since, /^\d{4}-\d{2}-\d{2}$/);
    }
  });
  test("toda rota do menu está registrada", () => {
    const routes = new Set(CAPABILITIES.flatMap((c) => c.routes ?? []));
    for (const item of NAV) assert.ok(routes.has(item.href), `rota sem capacidade: ${item.href}`);
  });
  test("toda server action está registrada (e nada registrado sobra)", () => {
    const src = readFileSync("src/app/actions.ts", "utf8");
    const actions = [...src.matchAll(/export async function (\w+)/g)].map((m) => m[1]).sort();
    const registered = CAPABILITIES.flatMap((c) => c.actions ?? []).sort();
    assert.deepEqual(registered, actions);
  });
});
