/** Fase 2: tempo, atividade, rotinas idempotentes, modelos de checklist e relatórios. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { addDays, formatMinutes, monthEnd, todayIso, weekStart } from "../src/lib/dates";
import { median, occurrencesBetween, occursOn, routineTitle } from "../src/lib/routines";
import type { Actor } from "../src/server/demands";

let db: DB;
let demands: typeof import("../src/server/demands");
let time: typeof import("../src/server/time");
let routines: typeof import("../src/server/routines");
let templates: typeof import("../src/server/templates");
let reports: typeof import("../src/server/reports");
let eduardo: Actor, maria: Actor, tainara: Actor;
let clientId: string, categoryId: string, typeId: string;
const today = todayIso();

before(async () => {
  db = await memDb();
  demands = await import("../src/server/demands");
  time = await import("../src/server/time");
  routines = await import("../src/server/routines");
  templates = await import("../src/server/templates");
  reports = await import("../src/server/reports");
  const users = await db.select().from(s.users);
  const actor = (name: string): Actor => {
    const u = users.find((x) => x.username === name)!;
    return { id: u.id, role: u.role };
  };
  eduardo = actor("eduardo");
  maria = actor("maria");
  tainara = actor("tainara");
  clientId = (await db.select().from(s.clients)).find((c) => c.name === "Helvécio")!.id;
  const category = (await db.select().from(s.categories)).find((c) => c.name === "Pedidos")!;
  categoryId = category.id;
  typeId = (await db.select().from(s.demandTypes)).find((t) => t.categoryId === categoryId && t.name === "Digitar pedido")!.id;
});

const create = async (title: string, assigneeId = tainara.id, extra: object = {}) => {
  const r = await demands.createDemand(maria, { title, clientId, categoryId, typeId, assigneeId, dueDate: addDays(today, 1), ...extra });
  assert.ok(r.ok, JSON.stringify(r));
  return r.ok ? r.id : "";
};

describe("tempo por demanda", () => {
  test("concluir exige “quanto tempo levou”", async () => {
    const id = await create("Pedido sem tempo f2a");
    assert.equal((await demands.changeStatus(tainara, id, "done")).ok, false);
    assert.equal((await demands.changeStatus(tainara, id, "done", { minutes: 0 })).ok, false);
    assert.equal((await demands.changeStatus(tainara, id, "done", { minutes: 2.5 })).ok, false);
    assert.ok((await demands.changeStatus(tainara, id, "done", { minutes: 15 })).ok);
    const t = await time.demandTime(tainara, id);
    assert.equal(t.total, 15);
    assert.equal(t.entries[0].source, "completion");
  });

  test("o total informado desconta o que já foi apontado (não conta duas vezes)", async () => {
    const id = await create("Pedido com lançamento f2b");
    assert.ok((await time.addManualEntry(tainara, id, { day: today, minutes: 20 })).ok);
    assert.ok((await demands.changeStatus(tainara, id, "done", { minutes: 30 })).ok);
    assert.equal((await time.demandTime(tainara, id)).total, 30);
    const other = await create("Pedido total menor f2c");
    assert.ok((await time.addManualEntry(tainara, other, { day: today, minutes: 40 })).ok);
    assert.ok((await demands.changeStatus(tainara, other, "done", { minutes: 10 })).ok);
    assert.equal((await time.demandTime(tainara, other)).total, 40, "o já apontado não é apagado");
  });

  test("cronômetro: só um ativo por pessoa; iniciar outro para o anterior", async () => {
    const a = await create("Cronômetro A f2d");
    const b = await create("Cronômetro B f2e");
    assert.ok((await time.startTimer(tainara, a)).ok);
    const second = await time.startTimer(tainara, b);
    assert.ok(second.ok && /anterior foi parado/.test(second.message ?? ""));
    assert.equal((await db.select().from(s.timers).where(eq(s.timers.userId, tainara.id))).length, 1);
    assert.equal((await time.demandTime(tainara, a)).entries[0].source, "timer");
    assert.ok((await time.stopTimer(tainara)).ok);
    assert.equal((await time.stopTimer(tainara)).ok, false);
    assert.equal(time.timerMinutes(new Date(Date.now() - 90_000)), 2);
    assert.equal(time.timerMinutes(new Date(Date.now() - 30 * 3_600_000)), time.MAX_TIMER_MINUTES, "cronômetro esquecido tem teto");
  });

  test("lançamento manual: validações, correção com auditoria e só o dono do lançamento (ou gestor) altera", async () => {
    const id = await create("Lançamento manual f2f");
    assert.equal((await time.addManualEntry(tainara, id, { day: addDays(today, 1), minutes: 10 })).ok, false, "futuro");
    assert.equal((await time.addManualEntry(tainara, id, { day: today, minutes: -5 })).ok, false);
    assert.ok((await time.addManualEntry(tainara, id, { day: today, minutes: 25 })).ok);
    const [entry] = (await time.demandTime(tainara, id)).entries;
    const other = await create("Demanda da Maria f2g", maria.id);
    assert.ok((await time.addManualEntry(maria, other, { day: today, minutes: 10 })).ok);
    const [mariaEntry] = (await time.demandTime(maria, other)).entries;
    assert.equal((await time.updateEntry(tainara, mariaEntry.id, 99)).ok, false, "operacional não mexe no tempo de outra pessoa");
    assert.ok((await time.updateEntry(maria, entry.id, 30)).ok, "gestor corrige");
    const logs = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entityId, entry.id), eq(s.auditLogs.action, "updated")));
    assert.deepEqual(logs[0].before, { minutes: 25 });
  });

  test("operacional não vê horas de outra pessoa", async () => {
    const id = await create("Tempo misto f2h");
    await time.addManualEntry(tainara, id, { day: today, minutes: 10 });
    await time.addManualEntry(maria, id, { day: today, minutes: 50 });
    assert.equal((await time.demandTime(tainara, id)).total, 10);
    assert.equal((await time.demandTime(maria, id)).total, 60);
    assert.equal(await time.dayOf(tainara, maria.id, today), null);
    assert.ok(await time.dayOf(tainara, tainara.id, today));
    assert.ok(await time.dayOf(maria, tainara.id, today));
    assert.deepEqual(await time.teamDay(tainara, today), []);
    assert.deepEqual(await time.entriesBetween(tainara, today, today), []);
    assert.equal(await reports.monthReport(tainara, today.slice(0, 7)), null);
    assert.equal((await reports.dashboard(tainara, today.slice(0, 7))).revenue, null);
  });
});

describe("tempo no sistema (sinal de atividade)", () => {
  test("soma 1 min por sinal, ignora sinais repetidos em menos de 45 s", async () => {
    const base = new Date(`${today}T15:00:00Z`);
    await time.heartbeat(eduardo.id, base);
    await time.heartbeat(eduardo.id, new Date(base.getTime() + 10_000));
    await time.heartbeat(eduardo.id, new Date(base.getTime() + 60_000));
    await time.heartbeat(eduardo.id, new Date(base.getTime() + 120_000));
    const [row] = await db.select().from(s.activityDays).where(and(eq(s.activityDays.userId, eduardo.id), eq(s.activityDays.day, todayIso(base))));
    assert.equal(row.minutes, 3);
    assert.equal(row.firstAt.getTime(), base.getTime());
    assert.equal(row.lastAt.getTime(), base.getTime() + 120_000);
  });

  test("a tabela guarda só minutos e horários (nenhum conteúdo)", () => {
    assert.deepEqual(Object.keys(s.activityDays).filter((k) => !k.startsWith("_") && k !== "enableRLS").sort(), ["day", "firstAt", "lastAt", "minutes", "userId"]);
  });

  test("retenção de 12 meses", async () => {
    const old = `${Number(today.slice(0, 4)) - 2}-01-15`;
    await db.insert(s.activityDays).values({ userId: eduardo.id, day: old, minutes: 5, firstAt: new Date(), lastAt: new Date() });
    await time.pruneActivity(today);
    assert.equal((await db.select().from(s.activityDays).where(eq(s.activityDays.day, old))).length, 0);
  });
});

describe("rotinas", () => {
  test("recorrência: semanal, mensal (mês curto) e a cada N dias", () => {
    const weekly = { frequency: "weekly" as const, weekdays: [1, 5], monthDay: null, intervalDays: null, startDate: "2026-11-01" };
    assert.deepEqual(occurrencesBetween(weekly, "2026-11-16", "2026-11-22"), ["2026-11-16", "2026-11-20"]);
    const monthly = { frequency: "monthly" as const, weekdays: [], monthDay: 31, intervalDays: null, startDate: "2026-01-01" };
    assert.equal(occursOn(monthly, "2026-02-28"), true);
    assert.equal(occursOn(monthly, "2026-03-30"), false);
    assert.equal(occursOn(monthly, "2026-03-31"), true);
    const interval = { frequency: "interval" as const, weekdays: [], monthDay: null, intervalDays: 15, startDate: "2026-11-01" };
    assert.deepEqual(occurrencesBetween(interval, "2026-11-01", "2026-12-05"), ["2026-11-01", "2026-11-16", "2026-12-01"]);
    assert.equal(occursOn(interval, "2026-10-17"), false, "antes do início");
    assert.equal(routineTitle("Fechamento mensal Barão", "monthly", "2026-12-01"), "Fechamento mensal Barão — dez/2026");
  });

  test("o cron não duplica ao rodar duas vezes; a demanda nasce com tipo, prazo e checklist", async () => {
    const tpl = await templates.saveTemplate(maria, null, { name: "Fechamento teste", status: "published", items: [{ text: "Conferir planilha", required: true }, { text: "Enviar ao cliente" }] });
    assert.ok(tpl.ok);
    const saved = await routines.saveRoutine(maria, null, { name: "Fechamento teste Barão", clientId, categoryId, typeId, assigneeId: tainara.id, frequency: "interval", intervalDays: 1, startDate: today, dueOffsetDays: 2, templateId: tpl.ok ? tpl.id : null });
    assert.ok(saved.ok, JSON.stringify(saved));
    const first = await routines.generateRoutines(today);
    assert.equal(first.created, 1);
    const second = await routines.generateRoutines(today);
    assert.equal(second.created, 0);
    const third = await Promise.all([routines.generateRoutines(today), routines.generateRoutines(today)]);
    assert.equal(third[0].created + third[1].created, 0);
    const [routine] = await db.select().from(s.routines).where(eq(s.routines.name, "Fechamento teste Barão"));
    const generated = await db.select().from(s.demands).where(eq(s.demands.routineId, routine.id));
    assert.equal(generated.length, 1);
    assert.equal(generated[0].origin, "routine");
    assert.equal(generated[0].typeId, typeId);
    assert.equal(generated[0].dueDate, addDays(today, 2));
    assert.equal(generated[0].assigneeId, tainara.id);
    const items = await db.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.demandId, generated[0].id));
    assert.equal(items.length, 2);
    // amanhã gera a próxima; pausada não gera
    assert.equal((await routines.generateRoutines(addDays(today, 1))).created, 1);
    await db.update(s.routines).set({ active: false }).where(eq(s.routines.id, routine.id));
    assert.equal((await routines.generateRoutines(addDays(today, 2))).created, 0);
  });

  test("só gestor e dono cadastram rotinas; validações", async () => {
    const base = { name: "Rotina x", clientId, categoryId, assigneeId: tainara.id, startDate: today };
    assert.equal((await routines.saveRoutine(tainara, null, { ...base, frequency: "monthly", monthDay: 1 })).ok, false);
    assert.equal((await routines.saveRoutine(maria, null, { ...base, frequency: "weekly", weekdays: [] })).ok, false);
    assert.equal((await routines.saveRoutine(maria, null, { ...base, frequency: "monthly", monthDay: 40 })).ok, false);
    assert.deepEqual(await routines.listRoutines(tainara), []);
  });

  test("a rota do cron exige segredo", () => {
    const src = readFileSync("src/app/api/cron/rotinas/route.ts", "utf8");
    assert.match(src, /CRON_SECRET/);
    assert.match(src, /timingSafeEqual/);
    assert.match(src, /if \(!authorized\(request\)\) return Response\.json\(\{ ok: false \}, \{ status: 401 \}\)/);
  });
});

describe("modelos de checklist", () => {
  test("modelos iniciais são rascunhos com itens “a validar” e não publicam assim", async () => {
    const all = await templates.listTemplates(maria);
    const kit = all.find((t) => t.name.startsWith("Kit de degustação"))!;
    assert.equal(kit.status, "draft");
    const full = await templates.getTemplate(maria, kit.id);
    assert.ok(full!.items.every((i) => i.toValidate));
    assert.ok(full!.items.some((i) => i.text === "Colheres"));
    const publish = await templates.saveTemplate(maria, kit.id, { name: full!.name, status: "published", doubleCheck: true, items: full!.items });
    assert.equal(publish.ok, false);
    // operacional não vê rascunho nem cria modelo
    assert.equal((await templates.listTemplates(tainara)).some((t) => t.id === kit.id), false);
    assert.equal(await templates.getTemplate(tainara, kit.id), null);
    assert.equal((await templates.saveTemplate(tainara, null, { name: "Meu modelo", items: [] })).ok, false);
  });

  test("aplicar multiplica por ação; versão nova não muda demanda antiga; obrigatório bloqueia a conclusão", async () => {
    const created = await templates.saveTemplate(maria, null, { name: "Kit teste", status: "published", doubleCheck: true, items: [{ section: "Descartáveis", text: "Colheres", quantity: 50, unit: "un", perAction: true, required: true }, { section: "Equipamentos", text: "Garrafa térmica", quantity: 1, unit: "un", required: true }] });
    assert.ok(created.ok);
    const tplId = created.ok ? created.id : "";
    const id = await create("Degustação Itaúna f2i");
    assert.ok((await templates.applyTemplate(tainara, id, tplId, 3)).ok);
    let d = await demands.getDemand(tainara, id);
    const spoons = d!.checklist.find((c) => c.text === "Colheres")!;
    const flask = d!.checklist.find((c) => c.text === "Garrafa térmica")!;
    assert.equal(spoons.quantity, 150);
    assert.equal(flask.quantity, 1);
    assert.equal(d!.templateVersion, 1);
    assert.equal(d!.actionsCount, 3);

    // nova versão do modelo não mexe na demanda
    const v2 = await templates.saveTemplate(maria, tplId, { name: "Kit teste", status: "published", doubleCheck: true, items: [{ text: "Colheres", quantity: 80, unit: "un", perAction: true }] });
    assert.ok(v2.ok && /versão 2/.test(v2.message ?? ""));
    d = await demands.getDemand(tainara, id);
    assert.equal(d!.checklist.length, 2);
    assert.equal(d!.templateVersion, 1);

    // obrigatório sem marcar bloqueia
    const blocked = await demands.changeStatus(tainara, id, "done", { minutes: 30 });
    assert.equal(blocked.ok, false);
    assert.match(blocked.ok ? "" : blocked.error, /obrigatório/);
    assert.equal((await templates.verifyItem(tainara, spoons.id, true)).ok, false, "conferir só depois de separar");
    assert.ok((await demands.toggleChecklistItem(tainara, spoons.id, true)).ok);
    assert.ok((await templates.verifyItem(maria, spoons.id, true)).ok);
    assert.equal((await templates.setItemNotApplicable(tainara, flask.id, "")).ok, false, "motivo obrigatório");
    assert.ok((await templates.setItemNotApplicable(tainara, flask.id, "A loja tem garrafa")).ok);
    assert.ok((await demands.changeStatus(tainara, id, "done", { minutes: 30 })).ok);
  });

  test("“Faltou algo” → um clique coloca o item na próxima versão do modelo", async () => {
    const created = await templates.saveTemplate(maria, null, { name: "Kit colheres", status: "published", items: [{ text: "Café", quantity: 4, unit: "pct" }] });
    const tplId = created.ok ? created.id : "";
    const id = await create("Degustação Divinópolis f2j");
    await templates.applyTemplate(tainara, id, tplId, 1);
    assert.equal((await templates.reportMiss(tainara, id, { item: "Colheres" })).ok, false, "só depois de concluir");
    await demands.changeStatus(tainara, id, "done", { minutes: 45 });
    assert.ok((await templates.reportMiss(tainara, id, { item: "Colheres", quantity: "150 un", impact: "Compramos na cidade" })).ok);
    const [miss] = await templates.demandMisses(id);
    assert.equal((await templates.addMissToTemplate(tainara, miss.id)).ok, false, "operacional não altera modelo");
    assert.ok((await templates.addMissToTemplate(maria, miss.id)).ok);
    const tpl = await templates.getTemplate(maria, tplId);
    assert.equal(tpl!.version, 2);
    assert.ok(tpl!.items.some((i) => i.text === "Colheres" && i.required));
    assert.equal(tpl!.misses.length, 1);
    assert.equal(tpl!.uses.length, 1);
    const report = await templates.missesReport(maria);
    assert.ok(report.some((r) => r.item === "colheres" && r.n === 1));
    // salvar o checklist de uma demanda como modelo novo (rascunho)
    const asTpl = await templates.saveAsTemplate(maria, id, "Kit a partir da demanda");
    assert.ok(asTpl.ok);
    assert.equal((await templates.saveAsTemplate(tainara, id, "Não pode")).ok, false);
  });
});

describe("relatórios", () => {
  test("cálculos: ranking por contratante, média/mediana por tipo, capacidade e sinal de contratação", () => {
    const e = (minutes: number, clientId: string, demandId: string, typeId: string | null, day = "2026-11-18", userId = "u1", status = "done") => ({ minutes, day, userId, demandId, clientId, clientName: clientId.toUpperCase(), categoryName: "Pedidos", typeId, status });
    const entries = [e(30, "a", "d1", "t1"), e(30, "a", "d1", "t1"), e(20, "a", "d2", "t1"), e(100, "b", "d3", "t1"), e(15, "b", "d4", null, "2026-11-18", "u2", "doing")];
    assert.deepEqual(reports.hoursByClient(entries).map((c) => [c.clientId, c.minutes]), [["b", 115], ["a", 80]]);
    const stats = reports.statsByType(entries, new Map([["t1", "Digitar pedido"]]));
    const typed = stats.find((x) => x.type === "Digitar pedido")!;
    assert.deepEqual([typed.minutes, typed.count, typed.average, typed.median], [180, 3, 60, 60]);
    assert.equal(stats.find((x) => x.type === "Sem tipo")!.count, 0, "demanda aberta não entra na média");
    assert.equal(median([5, 1, 9, 3]), 4);
    assert.equal(formatMinutes(95), "1h35");
    assert.equal(weekStart("2026-11-20"), "2026-11-16");
    assert.equal(monthEnd("2026-02-10"), "2026-02-28");

    const cap = reports.capacityByWeek([e(40 * 60 * 0.9, "a", "d1", null, "2026-11-17")], [{ id: "u1", name: "A", weeklyHours: 40 }], ["2026-11-16"]);
    assert.equal(cap[0].persons[0].percent, 90);
    assert.equal(cap[0].teamPercent, 90);
    assert.equal(reports.hiringSignal([{ teamPercent: 85 }, { teamPercent: 90 }, { teamPercent: 81 }]), false);
    assert.equal(reports.hiringSignal([{ teamPercent: 85 }, { teamPercent: 90 }, { teamPercent: 81 }, { teamPercent: 95 }]), true);
    assert.equal(reports.hiringSignal([{ teamPercent: 85 }, { teamPercent: 70 }, { teamPercent: 81 }, { teamPercent: 95 }, { teamPercent: 90 }]), false);

    const rev = reports.hoursRevenue(entries, new Map([["u1", 3000], ["u2", null]]), [{ id: "a", name: "A", monthlyValueCents: 100_000 }, { id: "b", name: "B", monthlyValueCents: null }]);
    const a = rev.rows.find((r) => r.clientId === "a")!;
    assert.deepEqual([a.costCents, a.resultCents, a.margin], [4000, 96_000, 96]);
    assert.equal(rev.rows.find((r) => r.clientId === "b")!.resultCents, null);
    assert.equal(rev.missingCost, true);
  });

  test("relatório do mês e painel com dados reais; custo e valor só para dono e gestor", async () => {
    const month = today.slice(0, 7);
    const r = await reports.monthReport(maria, month);
    assert.ok(r && r.totalMinutes > 0);
    assert.ok(r!.byClient.some((c) => c.clientId === clientId));
    assert.ok(r!.byType.some((t) => t.type === "Digitar pedido" && t.count > 0));
    assert.ok(r!.revenue);
    const dash = await reports.dashboard(maria, month);
    assert.ok(dash.done > 0);
    assert.ok(dash.routinesToday >= 1);
    const mine = await reports.dashboard(tainara, month);
    assert.equal(mine.byClient, null);
    assert.ok(mine.byAssignee.every((x) => x.id === tainara.id));
  });
});
