/** Datas do painel viram data de verdade no Excel (filtro por ano e mês). */
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { excelDate } from "../src/lib/excel-dates";
import { buildWorkbook } from "../src/server/xlsx";

test("texto de data vira data; o resto fica texto", () => {
  assert.equal(excelDate("26/11/2026")?.value.toISOString(), "2026-11-26T00:00:00.000Z");
  assert.equal(excelDate("26/11/2026")?.numFmt, "dd/mm/yyyy");
  assert.equal(excelDate("24/11/2026, 14:05")?.value.toISOString(), "2026-11-24T14:05:00.000Z");
  assert.equal(excelDate("24/11/2026 14:05")?.numFmt, "dd/mm/yyyy hh:mm");
  for (const t of ["31/02/2026", "24/11/2026 25:00", "26/11", "26/11/2026 a 30/11/2026", "Lote 01/01/2027", "—", ""]) assert.equal(excelDate(t), null, t);
});

test("a planilha grava a coluna de validade como data", async () => {
  const buf = await buildWorkbook([{ name: "Validades", columns: [{ header: "Loja", key: "a" }, { header: "Validade", key: "b" }, { header: "Visita", key: "c" }], rows: [{ a: "ABC LJ 77", b: "26/11/2026", c: "24/11/2026, 09:30" }, { a: "BH 101", b: "—", c: "" }] }], { agency: "Teste", title: "t" });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const validade = ws.getCell("B2");
  assert.ok(validade.value instanceof Date);
  assert.equal((validade.value as Date).toISOString().slice(0, 10), "2026-11-26");
  assert.equal(validade.numFmt, "dd/mm/yyyy");
  assert.equal(ws.getCell("C2").numFmt, "dd/mm/yyyy hh:mm");
  assert.equal(ws.getCell("A2").value, "ABC LJ 77");
  assert.equal(ws.getCell("B3").value, "—");
});
