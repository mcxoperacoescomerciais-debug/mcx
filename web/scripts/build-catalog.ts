/**
 * Converte as planilhas de MIX da SUINCO no catálogo usado pelo banco de
 * demonstração (src/server/db/catalog-suinco.json).
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/build-catalog.ts "<MIX BH.xlsx>" "<MIX ABC.xlsx>"
 *
 * Em produção não é preciso: o upload é feito pelo painel (Administração ›
 * Importar planilha).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseMixWorkbook } from "../src/server/import/mix-workbook";

async function main() {
  const [bhFile, abcFile] = process.argv.slice(2);
  const out: Record<string, unknown> = {};
  for (const [network, file] of [["Super BH", bhFile], ["Super ABC", abcFile]] as const) {
    const parsed = await parseMixWorkbook(readFileSync(file));
    for (const w of parsed.warnings) console.warn(`[${network}] ${w}`);
    const codes = new Set(parsed.mixes.flatMap((m) => m.items.map((i) => i.suincoCode)));
    out[network] = {
      mixes: parsed.mixes.map((m) => ({ format: m.format, items: m.items })),
      prices: Object.fromEntries([...parsed.prices].filter(([code]) => codes.has(code))),
    };
    console.log(network, parsed.mixes.map((m) => `${m.sheet}→${m.format}: ${m.items.length}`).join(", "));
  }
  writeFileSync("src/server/db/catalog-suinco.json", JSON.stringify(out, null, 1));
}
main();
