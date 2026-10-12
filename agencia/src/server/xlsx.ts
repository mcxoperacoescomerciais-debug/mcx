/**
 * Exportação Excel (XLSX) com cabeçalho formatado, filtros automáticos e
 * colunas dimensionadas. Os dados vêm SEMPRE das mesmas consultas com escopo
 * usadas na tela — exportar nunca mostra mais do que o usuário pode ver.
 */
import "server-only";
import ExcelJS from "exceljs";

export interface SheetSpec {
  name: string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, unknown>[];
  note?: string;
}

export async function buildWorkbook(sheets: SheetSpec[], meta: { agency: string; title: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${meta.agency} · MCX`;
  wb.created = new Date();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 4), style: c.numFmt ? { numFmt: c.numFmt } : {} }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C323A" } };
    head.alignment = { vertical: "middle" };
    head.height = 20;
    for (const r of spec.rows) ws.addRow(r);
    if (spec.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
    if (spec.note) {
      ws.addRow([]);
      ws.addRow([spec.note]).font = { italic: true, color: { argb: "FF687175" } };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export function csvResponse(spec: SheetSpec, filename: string): Response {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [spec.columns.map((c) => esc(c.header)).join(";"), ...spec.rows.map((r) => spec.columns.map((c) => esc(r[c.key])).join(";"))];
  // BOM para o Excel abrir acentos corretamente; ";" é o separador do Excel em português.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
