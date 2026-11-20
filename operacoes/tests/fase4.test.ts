/** Fase 4 — Estoque dos clientes: saldo por movimentação, FEFO, permissões, contagem, equipamentos, checklist e alertas. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { addDays, todayIso } from "../src/lib/dates";
import { can } from "../src/lib/permissions";
import { balanceOf, expiringLots, fefo, lotBalances, monthSummary, statement, type Move } from "../src/lib/stock";
import type { Actor } from "../src/server/demands";

let db: DB;
let stock: typeof import("../src/server/stock");
let demands: typeof import("../src/server/demands");
let templates: typeof import("../src/server/templates");
let eduardo: Actor, maria: Actor, tainara: Actor;
let clientId: string, otherClientId: string, categoryId: string;
const today = todayIso();

async function newItem(name: string, extra: Partial<import("../src/server/stock").StockItemInput> = {}): Promise<string> {
  const r = await stock.saveStockItem(maria, null, { clientId, name, category: "disposable", unit: "un", ...extra });
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.ok ? r.id : "";
}
const balance = async (id: string) => (await stock.getStockItem(maria, id))!.balance;

before(async () => {
  db = await memDb();
  stock = await import("../src/server/stock");
  demands = await import("../src/server/demands");
  templates = await import("../src/server/templates");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  maria = actor("maria");
  tainara = actor("tainara");
  const clients = await db.select().from(s.clients);
  clientId = clients.find((c) => c.name === "Regis")!.id;
  otherClientId = clients.find((c) => c.name === "Lucas")!.id;
  categoryId = (await db.select().from(s.categories)).find((c) => c.name === "Degustação")!.id;
});

describe("cálculos", () => {
  const moves: Move[] = [
    { kind: "in", delta: 20, day: "2026-10-10", lot: "A", expiresOn: "2026-12-01" },
    { kind: "in", delta: 10, day: "2026-10-20", lot: "B", expiresOn: "2026-11-25" },
    { kind: "out", delta: -8, day: "2026-11-03", lot: "B", expiresOn: "2026-11-25", counterpart: "Degustação", city: "Itaúna" },
    { kind: "out", delta: -5, day: "2026-11-10", lot: "A", expiresOn: "2026-12-01", counterpart: "Degustação", city: "Itaúna" },
    { kind: "return", delta: 2, day: "2026-11-11", lot: "A", expiresOn: "2026-12-01" },
    { kind: "loss", delta: -1, day: "2026-11-12", lot: "B", expiresOn: "2026-11-25" },
    { kind: "adjust", delta: -1, day: "2026-11-20", lot: "A", expiresOn: "2026-12-01" },
    { kind: "in", delta: 30, day: "2026-12-02", lot: "C", expiresOn: "2027-03-01" },
  ];
  test("saldo, lotes e extrato com saldo acumulado", () => {
    assert.equal(balanceOf(moves), 47);
    assert.deepEqual(lotBalances(moves), [{ lot: "B", expiresOn: "2026-11-25", quantity: 1 }, { lot: "A", expiresOn: "2026-12-01", quantity: 16 }, { lot: "C", expiresOn: "2027-03-01", quantity: 30 }]);
    assert.deepEqual(statement(moves).map((m) => m.balance), [20, 30, 22, 17, 19, 18, 17, 47]);
  });
  test("FEFO consome primeiro o lote que vence antes e acusa falta", () => {
    const lots = lotBalances(moves);
    assert.deepEqual(fefo(lots, 5), { picks: [{ lot: "B", expiresOn: "2026-11-25", quantity: 1 }, { lot: "A", expiresOn: "2026-12-01", quantity: 4 }], shortfall: 0 });
    assert.equal(fefo(lots, 50).shortfall, 3);
    assert.deepEqual(expiringLots(lots, "2026-12-01").map((l) => l.lot), ["B", "A"]);
  });
  test("resumo do mês fecha: inicial + entradas − saídas + devoluções − perdas + ajustes = final", () => {
    const r = monthSummary(moves, "2026-11-01", "2026-11-30");
    assert.deepEqual({ ...r, byDestination: undefined }, { opening: 30, entries: 0, outputs: 13, returns: 2, losses: 1, adjustments: -1, closing: 17, byDestination: undefined });
    assert.deepEqual(r.byDestination, [{ destination: "Degustação — Itaúna", quantity: 13 }]);
    assert.equal(monthSummary(moves, "2026-12-01", "2026-12-31").opening, 17);
  });
});

describe("permissões", () => {
  test("operacional movimenta e conta; cadastro, perda e ajuste são do gestor", async () => {
    assert.ok(can("operacional", "stock.move") && !can("operacional", "stock.manage"));
    assert.equal((await stock.saveStockItem(tainara, null, { clientId, name: "Item da Tainara", category: "disposable", unit: "un" })).ok, false);
    const id = await newItem("Guardanapos teste perm");
    assert.ok((await stock.addMovement(tainara, id, { kind: "in", quantity: 100, counterpart: "Recebido do cliente" })).ok);
    assert.ok((await stock.addMovement(tainara, id, { kind: "out", quantity: 30, counterpart: "Degustação Itaúna", city: "Itaúna" })).ok);
    assert.ok((await stock.addMovement(tainara, id, { kind: "return", quantity: 5 })).ok);
    assert.equal((await stock.addMovement(tainara, id, { kind: "loss", quantity: 1, reason: "rasgou" })).ok, false);
    assert.ok((await stock.addMovement(maria, id, { kind: "loss", quantity: 1, reason: "rasgou" })).ok);
    assert.equal(await balance(id), 74);
    assert.equal((await stock.setInventoryDay(tainara, 5)).ok, false);
    assert.equal((await stock.addStockUnit(tainara, id, "Unidade 1")).ok, false);
    assert.equal(await stock.monthlyStockReport(tainara, clientId, today) !== null, true, "ver o estoque é permitido");
    assert.match(readFileSync("src/app/(app)/estoque/[clientId]/relatorio/page.tsx", "utf8"), /await requireCan\("stock\.manage"\)/);
  });
});

describe("movimentações", () => {
  test("validações: origem, destino, motivo, data futura, quantidade e saldo insuficiente", async () => {
    const id = await newItem("Copos teste validação");
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 10 })).ok, false, "entrada sem origem");
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 0, counterpart: "x" })).ok, false);
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 1.5, counterpart: "x" })).ok, false);
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 10, counterpart: "x", day: addDays(today, 1) })).ok, false, "data futura");
    assert.ok((await stock.addMovement(maria, id, { kind: "in", quantity: 10, counterpart: "Recebido do cliente", reference: "NF 123" })).ok);
    assert.equal((await stock.addMovement(maria, id, { kind: "out", quantity: 5 })).ok, false, "saída sem destino");
    assert.equal((await stock.addMovement(maria, id, { kind: "loss", quantity: 5 })).ok, false, "perda sem motivo");
    const over = await stock.addMovement(maria, id, { kind: "out", quantity: 11, counterpart: "Ação" });
    assert.ok(!over.ok && /Saldo insuficiente/.test(over.error));
    assert.equal(await balance(id), 10, "nada foi gravado nas tentativas inválidas");
    assert.equal((await stock.addMovement(maria, id, { kind: "adjust" as never, quantity: 5 })).ok, false, "ajuste só pela contagem");
  });

  test("validade: entrada exige data; saída sai por FEFO e se divide entre lotes", async () => {
    const id = await newItem("Café teste FEFO", { category: "product", unit: "pct", tracksExpiry: true });
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 10, counterpart: "Cliente" })).ok, false, "sem validade");
    assert.ok((await stock.addMovement(maria, id, { kind: "in", quantity: 10, counterpart: "Cliente", lot: "NOVO", expiresOn: addDays(today, 200) })).ok);
    assert.ok((await stock.addMovement(maria, id, { kind: "in", quantity: 4, counterpart: "Cliente", lot: "VELHO", expiresOn: addDays(today, 40) })).ok);
    assert.ok((await stock.addMovement(tainara, id, { kind: "out", quantity: 6, counterpart: "Degustação Itaúna" })).ok);
    let item = (await stock.getStockItem(maria, id))!;
    assert.deepEqual(item.lots, [{ lot: "NOVO", expiresOn: addDays(today, 200), quantity: 8 }]);
    const outs = item.statement.filter((m) => m.kind === "out").map((m) => `${m.lot}:${m.delta}`).sort();
    assert.deepEqual(outs, ["NOVO:-2", "VELHO:-4"]);
    assert.equal((await stock.addMovement(maria, id, { kind: "out", quantity: 1, counterpart: "x", lot: "VELHO" })).ok, false, "lote sem saldo");
    assert.ok((await stock.addMovement(maria, id, { kind: "out", quantity: 1, counterpart: "x", lot: "NOVO", expiresOn: addDays(today, 200) })).ok);
    item = (await stock.getStockItem(maria, id))!;
    assert.equal(item.balance, 7);
    assert.equal(item.expiring.length, 0);
    assert.equal((await stock.saveStockItem(maria, id, { clientId, name: "Café teste FEFO", category: "product", unit: "pct", tracksExpiry: false })).ok, false, "não desliga validade com lotes");
  });

  test("movimentação nunca é alterada nem apagada pelo código do estoque", () => {
    const src = readFileSync("src/server/stock.ts", "utf8");
    assert.ok(!/update\(s\.stockMovements\)/.test(src) && !/delete\(s\.stockMovements\)/.test(src));
    assert.ok(/movement_\$\{input\.kind\}/.test(src), "toda movimentação grava auditoria");
  });

  test("item: nome repetido no mesmo contratante é recusado; mínimo e desativação", async () => {
    const id = await newItem("Item único teste", { minQuantity: 50 });
    assert.equal((await stock.saveStockItem(maria, null, { clientId, name: "item ÚNICO teste", category: "disposable", unit: "un" })).ok, false);
    assert.ok((await stock.saveStockItem(maria, null, { clientId: otherClientId, name: "Item único teste", category: "disposable", unit: "un" })).ok, "outro contratante pode");
    let data = (await stock.clientStock(tainara, clientId))!;
    assert.equal(data.items.find((i) => i.id === id)?.low, true, "saldo 0 abaixo do mínimo 50");
    assert.ok((await stock.saveStockItem(maria, id, { clientId, name: "Item único teste", category: "disposable", unit: "un", minQuantity: 50, active: false })).ok);
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 1, counterpart: "x" })).ok, false, "item desativado");
    data = (await stock.clientStock(tainara, clientId))!;
    assert.equal(data.items.find((i) => i.id === id)?.active, false);
  });
});

describe("contagem e ajuste de inventário", () => {
  test("gestor: diferença exige motivo e vira ajuste; saldo passa a ser o contado", async () => {
    const id = await newItem("Colheres teste contagem");
    assert.ok((await stock.addMovement(maria, id, { kind: "in", quantity: 100, counterpart: "Cliente" })).ok);
    assert.equal((await stock.recordCount(maria, id, 90, null)).ok, false);
    assert.ok((await stock.recordCount(maria, id, 90, "10 colheres quebradas")).ok);
    const item = (await stock.getStockItem(maria, id))!;
    assert.equal(item.balance, 90);
    const adjust = item.statement.find((m) => m.kind === "adjust")!;
    assert.equal(adjust.delta, -10);
    assert.equal(adjust.reason, "10 colheres quebradas");
    assert.ok((await stock.recordCount(maria, id, 90, null)).ok, "contagem que bate não pede motivo");
    assert.equal((await stock.getStockItem(maria, id))!.statement.filter((m) => m.kind === "adjust").length, 1);
  });

  test("operacional: a contagem fica pendente; só o gestor aprova; o ajuste usa o saldo do momento", async () => {
    const id = await newItem("Guardanapos teste pendente");
    assert.ok((await stock.addMovement(maria, id, { kind: "in", quantity: 50, counterpart: "Cliente" })).ok);
    assert.ok((await stock.recordCount(tainara, id, 45, "faltaram 5")).ok);
    assert.equal(await balance(id), 50, "contagem do operacional não mexe no saldo");
    const [count] = await db.select().from(s.stockCounts).where(and(eq(s.stockCounts.itemId, id), eq(s.stockCounts.status, "pending")));
    assert.equal((await stock.decideCount(tainara, count.id, true, null)).ok, false);
    // Entre a contagem e a aprovação saiu mais material: o ajuste leva ao contado, não repete a diferença antiga.
    assert.ok((await stock.addMovement(tainara, id, { kind: "out", quantity: 3, counterpart: "Ação" })).ok);
    assert.ok((await stock.decideCount(maria, count.id, true, null)).ok);
    assert.equal(await balance(id), 45);
    assert.equal((await stock.decideCount(maria, count.id, true, null)).ok, false, "não aprova duas vezes");
    assert.ok((await stock.recordCount(tainara, id, 40, null)).ok);
    const [second] = await db.select().from(s.stockCounts).where(and(eq(s.stockCounts.itemId, id), eq(s.stockCounts.status, "pending")));
    assert.ok((await stock.decideCount(maria, second.id, false, null)).ok);
    assert.equal(await balance(id), 45, "descartar não ajusta");
  });
});

describe("equipamentos", () => {
  test("controle por unidade: em uso exige com quem e até quando; manutenção é do gestor; sem quantidade", async () => {
    const id = await newItem("Garrafa térmica teste", { category: "equipment" });
    assert.equal((await stock.addMovement(maria, id, { kind: "in", quantity: 1, counterpart: "x" })).ok, false);
    assert.equal((await stock.recordCount(maria, id, 2, "x")).ok, false);
    assert.ok((await stock.addStockUnit(maria, id, "Garrafa teste 1")).ok);
    const [unit] = (await stock.getStockItem(maria, id))!.units;
    assert.equal((await stock.setUnitStatus(tainara, unit.id, { status: "in_use" })).ok, false);
    assert.equal((await stock.setUnitStatus(tainara, unit.id, { status: "in_use", holder: "Helvécio", dueBack: addDays(today, -1) })).ok, false);
    assert.ok((await stock.setUnitStatus(tainara, unit.id, { status: "in_use", holder: "Helvécio", dueBack: addDays(today, 2) })).ok);
    assert.equal((await stock.setUnitStatus(tainara, unit.id, { status: "maintenance" })).ok, false);
    assert.ok((await stock.setUnitStatus(tainara, unit.id, { status: "available" })).ok);
    assert.ok((await stock.setUnitStatus(maria, unit.id, { status: "maintenance" })).ok);
    assert.equal((await stock.setUnitStatus(tainara, unit.id, { status: "available" })).ok, false);
    const other = await newItem("Copos não equipamento");
    assert.equal((await stock.addStockUnit(maria, other, "Unidade")).ok, false);
  });
});

describe("checklist da demanda", () => {
  test("vínculo mostra o saldo, avisa a falta e registra as saídas só com confirmação (tudo ou nada, uma vez só)", async () => {
    const copos = await newItem("Copos teste kit");
    const colheres = await newItem("Colheres teste kit");
    const alheio = (await stock.saveStockItem(maria, null, { clientId: otherClientId, name: "Item de outro cliente kit", category: "disposable", unit: "un" })) as { ok: true; id: string };
    assert.ok((await stock.addMovement(maria, copos, { kind: "in", quantity: 200, counterpart: "Cliente" })).ok);
    assert.ok((await stock.addMovement(maria, colheres, { kind: "in", quantity: 100, counterpart: "Cliente" })).ok);
    const created = await demands.createDemand(maria, { title: "Separar kit de teste do estoque", clientId, categoryId, assigneeId: tainara.id, dueDate: addDays(today, 1) });
    assert.ok(created.ok);
    const demandId = created.ok ? created.id : "";
    assert.ok((await demands.addChecklistItem(tainara, demandId, "Copos")).ok);
    assert.ok((await demands.addChecklistItem(tainara, demandId, "Colheres")).ok);
    const [c1, c2] = (await demands.getDemand(tainara, demandId))!.checklist;
    await db.update(s.demandChecklistItems).set({ quantity: 150 }).where(eq(s.demandChecklistItems.demandId, demandId));
    assert.equal((await stock.linkChecklistItem(tainara, c1.id, alheio.id)).ok, false, "item de outro contratante");
    assert.ok((await stock.linkChecklistItem(tainara, c1.id, copos)).ok);
    assert.ok((await stock.linkChecklistItem(tainara, c2.id, colheres)).ok);
    let panel = (await stock.demandStock(tainara, demandId))!;
    assert.deepEqual(panel.lines.map((l) => [l.balance, l.short]), [[200, false], [100, true]]);
    assert.equal(await balance(copos), 200, "vincular e concluir não baixam nada sozinhos");

    const tooMuch = await stock.registerDemandOutputs(tainara, demandId, [{ checklistItemId: c1.id, quantity: 150 }, { checklistItemId: c2.id, quantity: 150 }], { counterpart: "Degustação Itaúna", city: "Itaúna" });
    assert.equal(tooMuch.ok, false);
    assert.equal(await balance(copos), 200, "uma linha sem saldo desfaz todas");
    assert.equal((await stock.registerDemandOutputs(tainara, demandId, [{ checklistItemId: c1.id, quantity: 150 }], { counterpart: "" })).ok, false);
    assert.ok((await stock.registerDemandOutputs(tainara, demandId, [{ checklistItemId: c1.id, quantity: 150 }, { checklistItemId: c2.id, quantity: 100 }], { counterpart: "Degustação Itaúna", city: "Itaúna" })).ok);
    assert.equal(await balance(copos), 50);
    assert.equal(await balance(colheres), 0);
    assert.equal((await stock.registerDemandOutputs(tainara, demandId, [{ checklistItemId: c1.id, quantity: 10 }], { counterpart: "Degustação Itaúna" })).ok, false, "não registra duas vezes");
    panel = (await stock.demandStock(tainara, demandId))!;
    assert.deepEqual(panel.lines.map((l) => l.registered), [150, 100]);
    const out = (await stock.getStockItem(maria, copos))!.statement.find((m) => m.kind === "out")!;
    assert.equal(out.demandId, demandId);
    assert.equal(out.city, "Itaúna");
    const report = (await stock.monthlyStockReport(maria, clientId, today))!;
    assert.deepEqual(report.rows.find((r) => r.id === copos)?.byDestination, [{ destination: "Degustação Itaúna — Itaúna", quantity: 150 }]);
  });

  test("o vínculo com o estoque viaja do modelo de checklist para a demanda", async () => {
    const item = await newItem("Guardanapos teste modelo");
    const tpl = await templates.saveTemplate(maria, null, { name: "Kit de teste com estoque", clientId, status: "published", items: [{ text: "Guardanapos", quantity: 2, unit: "pct", perAction: true, stockItemId: item }, { text: "Autorização da loja" }] });
    assert.ok(tpl.ok);
    const created = await demands.createDemand(maria, { title: "Kit pelo modelo com estoque zzz", clientId, categoryId, assigneeId: tainara.id, dueDate: addDays(today, 1) });
    assert.ok(created.ok);
    if (!tpl.ok || !created.ok) return;
    assert.ok((await templates.applyTemplate(tainara, created.id, tpl.id, 3)).ok);
    const panel = (await stock.demandStock(tainara, created.id))!;
    assert.deepEqual(panel.lines.map((l) => [l.text, l.stockItemId, l.quantity]), [["Guardanapos", item, 6], ["Autorização da loja", null, null]]);
    assert.equal(panel.lines[0].short, true, "pede 6 e o saldo é 0");
  });

  test("operacional não vê o estoque de demanda que não é dela", async () => {
    const created = await demands.createDemand(maria, { title: "Kit sigiloso do estoque qqq", clientId, categoryId, assigneeId: maria.id, dueDate: addDays(today, 1) });
    assert.ok(created.ok);
    if (!created.ok) return;
    assert.equal(await stock.demandStock(tainara, created.id), null);
    assert.equal((await stock.registerDemandOutputs(tainara, created.id, [], { counterpart: "x" })).ok, false);
  });
});

describe("alertas que viram demanda", () => {
  test("abaixo do mínimo, validade próxima e equipamento atrasado abrem demanda uma vez; resolvida a demanda, o alerta volta", async () => {
    const low = await newItem("Copos teste alerta", { minQuantity: 100 });
    const cafe = await newItem("Café teste alerta", { category: "product", unit: "pct", tracksExpiry: true });
    assert.ok((await stock.addMovement(maria, cafe, { kind: "in", quantity: 5, counterpart: "Cliente", lot: "AL1", expiresOn: addDays(today, 10) })).ok);
    const eq1 = await newItem("Mesa teste alerta", { category: "equipment" });
    assert.ok((await stock.addStockUnit(maria, eq1, "Mesa teste 1")).ok);
    const [unit] = (await stock.getStockItem(maria, eq1))!.units;
    await db.update(s.stockUnits).set({ status: "in_use", holder: "Promotor X", dueBack: addDays(today, -2) }).where(eq(s.stockUnits.id, unit.id));

    const first = await stock.generateStockAlerts(today);
    assert.ok(first.created >= 3);
    const alerts = await db.select().from(s.stockAlerts);
    const mine = (kind: string, key: string) => alerts.filter((a) => a.kind === kind && a.refKey.startsWith(key));
    assert.equal(mine("low", low).length, 1);
    assert.equal(mine("expiry", cafe).length, 1);
    assert.equal(mine("overdue", unit.id).length, 1);
    const [demand] = await db.select().from(s.demands).where(eq(s.demands.id, mine("low", low)[0].demandId));
    assert.match(demand.title, /^Pedir reposição ao cliente: Copos teste alerta/);
    assert.equal(demand.assigneeId, maria.id, "vai para o gestor");
    assert.equal(demand.origin, "system");

    const [a, b] = await Promise.all([stock.generateStockAlerts(today), stock.generateStockAlerts(today)]);
    assert.equal(a.created + b.created, 0, "rodar de novo (inclusive em paralelo) não duplica");
    assert.equal((await stock.generateStockAlerts(addDays(today, 1))).created, 0, "demanda ainda aberta: não abre outra no dia seguinte");

    // Reposto acima do mínimo: sem alerta novo. Caiu de novo com a demanda já concluída: abre outra.
    assert.ok((await demands.changeStatus(maria, demand.id, "done", { minutes: 5 })).ok);
    assert.equal((await stock.generateStockAlerts(addDays(today, 2))).created, 1, "continua abaixo do mínimo e a demanda foi fechada");
    assert.equal((await db.select().from(s.stockAlerts)).filter((x) => x.kind === "low" && x.refKey === low).length, 2);
  });

  test("contagem mensal: uma demanda por contratante por mês, com um item de checklist por material", async () => {
    const alerts = (await db.select().from(s.stockAlerts)).filter((a) => a.kind === "inventory" && a.refKey === `${clientId}|${today.slice(0, 7)}`);
    assert.equal(alerts.length, 1);
    const d = (await demands.getDemand(maria, alerts[0].demandId))!;
    assert.match(d.title, /^Inventário do estoque — Regis/);
    assert.ok(d.checklist.length >= 5 && d.checklist.every((c) => c.required && !c.stockItemId && c.text.startsWith("Contar: ")));
    assert.ok((await demands.deleteDemand(maria, d.id, "teste de idempotência")).ok);
    await stock.generateStockAlerts(today);
    assert.equal((await db.select().from(s.stockAlerts)).filter((a) => a.kind === "inventory" && a.refKey === `${clientId}|${today.slice(0, 7)}`).length, 1, "nem apagando a demanda o inventário do mês é recriado");
    assert.ok((await stock.setInventoryDay(eduardo, 0)).ok);
    assert.equal(await stock.inventoryDay(), 0);
    assert.equal((await stock.setInventoryDay(eduardo, 31)).ok, false);
    assert.ok((await stock.setInventoryDay(eduardo, 1)).ok);
  });
});
