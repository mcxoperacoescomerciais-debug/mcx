/**
 * Relatório mensal de atendimentos (formato Etros) e Sistemática: semanas do
 * mês, previstas pela programação, feriado conta como válida, acumulado e
 * planilha com as abas esperadas.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { todayIso } from "../src/lib/dates";
import { sectorOf } from "../src/lib/sectors-mg";

let db: DB;
let gestor: Scope;
let brandId: string;
let mr: typeof import("../src/server/monthly-report");

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  mr = await import("../src/server/monthly-report");
  const [u] = await db.select().from(s.users).where(eq(s.users.username, "admin"));
  gestor = await auth.scopeForUser(u);
  const [b] = await db.select().from(s.brands).where(and(eq(s.brands.code, "BRAVO"), eq(s.brands.agencyId, gestor.agencyId)));
  brandId = b.id;
});

describe("relatório mensal e sistemática", () => {
  test("semanas de segunda a domingo, cortadas no mês", () => {
    const w = mr.monthWeeks("2026-10");
    assert.equal(w[0].from, "2026-10-01");
    assert.equal(w[0].to, "2026-10-04");
    assert.equal(w[0].label, "SEMANA 1 (01–04/10)");
    assert.equal(w[1].from, "2026-10-05");
    assert.equal(w.at(-1)!.to, "2026-10-31");
    assert.equal(mr.monthWeeks("2026-12").at(-1)!.to, "2026-12-31");
    // Novembro/26 começa num domingo: o dia 1 entra na 1ª semana (01–08).
    assert.equal(mr.monthWeeks("2026-11")[0].label, "SEMANA 1 (01–08/11)");
  });

  test("setor = mesorregião do IBGE", () => {
    assert.equal(sectorOf("Uberlândia", "MG"), "TRIÂNGULO MINEIRO E ALTO PARANAÍBA");
    assert.equal(sectorOf("contagem"), "METROPOLITANA DE BELO HORIZONTE");
    assert.equal(sectorOf("São Paulo", "SP"), null);
  });

  test("programação do mês vira previstas; feriado sem atendimento conta como válida", async () => {
    const today = todayIso();
    const month = today.slice(0, 7);
    const base = await mr.monthlyReport(gestor, { brandId, month, chain: null, promoter: null });
    assert.ok(base);
    const rows = base!.weeks.flatMap((w) => w.rows);
    const scheduledToday = rows.filter((r) => r.agenda === `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(2, 4)}`);
    assert.ok(scheduledToday.length > 0, "a programação de hoje entra como prevista");

    const holidayScope = { ...gestor, settings: { ...gestor.settings, holidays: [today], visitValue: 28 } };
    const r = (await mr.monthlyReport(holidayScope, { brandId, month, chain: null, promoter: null }))!;
    const todayRows = r.weeks.flatMap((w) => w.rows).filter((x) => x.agenda === scheduledToday[0].agenda && x.status === "Não realizada");
    assert.ok(todayRows.every((x) => x.holiday && x.done === "FERIADO"));
    const total = r.accumulated.reduce((n, a) => n + a.month.validas, 0);
    assert.ok(total >= todayRows.length);

    const buf = await mr.monthlyWorkbook(r, "AF Merchandising");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const names = wb.worksheets.map((w) => w.name);
    assert.equal(names.filter((n) => n.startsWith("Semana ")).length, r.weeks.length);
    assert.ok(names.includes("Acumulado mês") && names.includes("Sistemática") && names.includes("Por estab."));
    const acc = wb.getWorksheet("Acumulado mês")!;
    assert.equal(acc.getCell(2, 2).value, 28);
    assert.equal(acc.getRow(4).getCell(1).value, "PDV");
  });

  test("várias marcas numa planilha só, com a marca em cada linha", async () => {
    const month = todayIso().slice(0, 7);
    const brands = await db.select().from(s.brands).where(eq(s.brands.agencyId, gestor.agencyId));
    const list = (await Promise.all(brands.slice(0, 2).map((b) => mr.monthlyReport(gestor, { brandId: b.id, month, chain: null, promoter: null })))).filter((x) => x !== null);
    assert.equal(list.length, 2);
    const r = mr.combineReports(list)!;
    assert.equal(r.brandCount, 2);
    assert.equal(r.accumulated.length, list[0].accumulated.length + list[1].accumulated.length);
    assert.equal(new Set(r.accumulated.map((a) => a.store.id)).size, r.accumulated.length);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await mr.monthlyWorkbook(r, "AF")) as never);
    const est = wb.getWorksheet("Por estab.")!;
    const clients = new Set<string>();
    est.eachRow((row, n) => {
      if (n > 1 && row.getCell(2).value) clients.add(String(row.getCell(1).value));
    });
    for (const b of list) if (b.accumulated.length) assert.ok(clients.has(b.brand.name));
    assert.equal(mr.combineReports([list[0]]), list[0]);
  });

  test("sistemática lista atribuições e lojas sem promotor (OPEN)", async () => {
    const rows = await mr.systematicList(gestor, { brand: brandId, chain: null, promoter: null, city: null }, todayIso().slice(0, 7));
    assert.ok(rows.length > 0);
    for (const r of rows) assert.equal(r.days.length, 6);
    const open = rows.filter((r) => r.promoter === "OPEN");
    assert.ok(open.every((r) => r.monthly === null));
  });

  test("carga liga a Sistemática na ETROS uma vez só", async () => {
    const { etrosSystematic } = await import("../scripts/setup-data");
    await etrosSystematic();
    const [etros] = (await db.select().from(s.agencies)).filter((a) => a.name.toUpperCase().startsWith("ETROS"));
    assert.equal((etros.settings as { modules: { sistematica: boolean } }).modules.sistematica, true);
    // Desligada depois pela equipe MCX: a carga não liga de novo.
    await db.update(s.agencies).set({ settings: { ...(etros.settings as object), modules: { sistematica: false } } as never }).where(eq(s.agencies.id, etros.id));
    await etrosSystematic();
    const [again] = await db.select().from(s.agencies).where(eq(s.agencies.id, etros.id));
    assert.equal((again.settings as { modules: { sistematica: boolean } }).modules.sistematica, false);
  });
});
