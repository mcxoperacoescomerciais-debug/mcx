/**
 * Leitura das planilhas de MIX enviadas pela SUINCO (ex.: "MIX ABC VAREJO -
 * PLUS e CASH.xlsx", "MIX BH VAREJO.xlsx").
 *
 * Formato esperado (o mesmo das planilhas atuais):
 * - Uma aba por formato de loja ("VAREJO", "PLUS", "CASH", "BH Varejo"...).
 *   Cabeçalho com "Código ABC" (código da rede), "Código SUINCO",
 *   "Descrição" e, opcionalmente, uma coluna de observação de manipulação.
 * - Aba "vigente": tabela de preços por código SUINCO ("ID do Item",
 *   "Preço1").
 *
 * Localiza as colunas pelo texto do cabeçalho (não pela posição), então
 * tolera colunas a mais ou em outra ordem.
 */
import ExcelJS from "exceljs";

import type { StoreFormat } from "../../lib/domain";
export type { StoreFormat };

export interface MixItem {
  seq: number;
  chainCode: string | null;
  suincoCode: string;
  description: string;
  note: string | null;
}

export interface ParsedMixWorkbook {
  mixes: { sheet: string; format: StoreFormat; items: MixItem[] }[];
  prices: Map<string, number>;
  warnings: string[];
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return String(v.result);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function formatFromSheetName(name: string): StoreFormat {
  const n = norm(name);
  if (n.includes("cash")) return "cash";
  if (n.includes("plus")) return "plus";
  return "varejo";
}

export async function parseMixWorkbook(data: ArrayBuffer | Buffer): Promise<ParsedMixWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const result: ParsedMixWorkbook = { mixes: [], prices: new Map(), warnings: [] };

  for (const ws of wb.worksheets) {
    // Procura a linha de cabeçalho nas 10 primeiras linhas.
    let headerRow = -1;
    const cols: Record<string, number> = {};
    for (let r = 1; r <= Math.min(10, ws.rowCount) && headerRow < 0; r++) {
      const row = ws.getRow(r);
      row.eachCell((cell, c) => {
        const t = norm(cellText(cell.value));
        if (t.includes("codigo") && t.includes("suinco")) cols.suinco = c;
        else if (t.includes("codigo")) cols.chain = c;
        else if (t.startsWith("descri")) cols.desc = c;
        else if (t === "id do item") cols.priceId = c;
        else if (t === "preco1") cols.price = c;
      });
      if ((cols.suinco && cols.desc) || (cols.priceId && cols.price)) headerRow = r;
    }

    if (cols.priceId && cols.price) {
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const id = cellText(row.getCell(cols.priceId).value).trim();
        const price = Number(cellText(row.getCell(cols.price).value));
        if (id && Number.isFinite(price) && price > 0) result.prices.set(id, Math.round(price * 100) / 100);
      }
      continue;
    }
    if (!cols.suinco || !cols.desc) {
      result.warnings.push(`Aba "${ws.name}" ignorada: cabeçalho com "Código SUINCO" e "Descrição" não encontrado.`);
      continue;
    }

    const items: MixItem[] = [];
    const seen = new Set<string>();
    const noteCol = cols.desc + 1;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const suincoCode = cellText(row.getCell(cols.suinco).value).trim();
      const description = cellText(row.getCell(cols.desc).value).replace(/\s+/g, " ").trim();
      if (!suincoCode || !description || norm(description).startsWith("descri")) continue;
      if (seen.has(suincoCode)) {
        result.warnings.push(`Aba "${ws.name}": código SUINCO ${suincoCode} repetido (mantida a primeira linha).`);
        continue;
      }
      seen.add(suincoCode);
      const chainCode = cols.chain ? cellText(row.getCell(cols.chain).value).trim() || null : null;
      const note = cellText(row.getCell(noteCol).value).replace(/\s+/g, " ").trim() || null;
      items.push({ seq: items.length + 1, chainCode, suincoCode, description, note });
    }
    result.mixes.push({ sheet: ws.name, format: formatFromSheetName(ws.name), items });
  }
  return result;
}

/** "PICANHA SUINA TEMPERADA RESF" → "Picanha Suina Temperada Resf" (mantém unidades como "2,5 KG" → "2,5 kg"). */
export function prettyProductName(description: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "pra", "tp"]);
  return description
    .toLowerCase()
    .split(" ")
    .map((w, i) => {
      if (/^\d/.test(w)) return w;
      if (/^(kg|g|ml|un)$/.test(w)) return w;
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ")
    .replace(/(\d)\s?kg\b/gi, "$1kg")
    .replace(/(\d)\s?g\b/gi, "$1g");
}

/** Categoria aproximada a partir da descrição — editável depois no cadastro. */
export function guessCategory(description: string): string {
  const d = norm(description);
  if (/temperad|picanha|alcatra|barriga|fraldinha|sobrepaleta|lombo|costel|mignon|pernil|bisteca|panceta/.test(d) && !/curado|fat/.test(d)) return "Cortes temperados";
  if (/bacon|papada|defumad|torresmo/.test(d)) return "Defumados";
  if (/linguica|calabresa|embutido|paio|salsicha|petisco/.test(d)) return "Embutidos";
  if (/salgad|mascara|orelha|rabo|pe /.test(d) || d.startsWith("pe ")) return "Salgados";
  if (/presunto|apresuntado|mortadela|salame|copa|lombo curado|blanquet/.test(d)) return "Frios e fatiados";
  return "Outros";
}
