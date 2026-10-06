/**
 * Testes das regras de negócio puras (rodam sem banco nem servidor):
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, daysBetween, parseExpiryDigits, plausibilityWarning, maskExpiryDigits, isNearExpiry } from "../src/lib/validity";
import { searchProducts } from "../src/lib/product-search";
import { parseFilters, resolveRange } from "../src/lib/filters";
import { prettyProductName, guessCategory, formatFromSheetName } from "../src/server/import/mix-workbook";

const VISIT = "2026-09-29";

test("validade digitada como DDMM infere o ano", () => {
  assert.deepEqual(parseExpiryDigits("0510", VISIT), { ok: true, iso: "2026-10-05", inferredYear: true });
  // Janeiro digitado em dezembro = janeiro do ano seguinte.
  assert.deepEqual(parseExpiryDigits("0501", "2026-12-20"), { ok: true, iso: "2027-01-05", inferredYear: true });
  // Vencido há poucos dias continua no ano corrente (pega produto vencido de verdade).
  assert.deepEqual(parseExpiryDigits("2509", VISIT), { ok: true, iso: "2026-09-25", inferredYear: true });
});

test("validade com ano de 2 ou 4 dígitos", () => {
  assert.equal((parseExpiryDigits("161026", VISIT) as { iso: string }).iso, "2026-10-16");
  assert.equal((parseExpiryDigits("05122026", VISIT) as { iso: string }).iso, "2026-12-05");
});

test("data impossível nunca é aceita (ex.: 28/20/26 dos relatórios de WhatsApp)", () => {
  assert.deepEqual(parseExpiryDigits("282026", VISIT), { ok: false, reason: "invalid" });
  assert.deepEqual(parseExpiryDigits("3102", VISIT), { ok: false, reason: "invalid" });
  assert.deepEqual(parseExpiryDigits("2902", "2026-01-10"), { ok: false, reason: "invalid" }); // 2026 e 2027 não são bissextos
  assert.deepEqual(parseExpiryDigits("05", VISIT), { ok: false, reason: "incomplete" });
});

test("ano digitado errado (07/12/2016) gera aviso com correção sugerida", () => {
  const w = plausibilityWarning("2016-12-07", "2026-09-30");
  assert.ok(w);
  assert.equal(w.suggestionIso, "2026-12-07");
  assert.equal(plausibilityWarning("2026-10-20", VISIT), null);
  assert.ok(plausibilityWarning("2030-01-01", VISIT)); // > 2 anos
});

test("classificação por faixas padrão", () => {
  assert.equal(classify(-1), "expired");
  assert.equal(classify(0), "critical");
  assert.equal(classify(3), "critical");
  assert.equal(classify(4), "high");
  assert.equal(classify(7), "high");
  assert.equal(classify(8), "attention");
  assert.equal(classify(15), "attention");
  assert.equal(classify(16), "monitor");
  assert.equal(classify(30), "monitor");
  assert.equal(classify(31), "normal");
  assert.equal(isNearExpiry("normal"), false);
  assert.equal(isNearExpiry("expired"), false);
  assert.equal(isNearExpiry("critical"), true);
});

test("faixas configuráveis pelo gestor", () => {
  const bands = { critical: 2, high: 5, attention: 10, monitor: 20 };
  assert.equal(classify(3, bands), "high");
  assert.equal(classify(21, bands), "normal");
});

test("dias para vencer (exemplo do enunciado: visita 05/10, validade 20/10 = 15 dias)", () => {
  assert.equal(daysBetween("2026-10-05", "2026-10-20"), 15);
  assert.equal(daysBetween("2026-10-05", "2026-10-05"), 0);
});

test("máscara de validade", () => {
  assert.equal(maskExpiryDigits("0510"), "05/10");
  assert.equal(maskExpiryDigits("051026"), "05/10/26");
});

const PRODUCTS = [
  { id: "1", name: "Linguica Embutido Misto Cozido e Defumado 2,5kg", code: "30106", aliases: ["embutido misto"] },
  { id: "2", name: "Bacon de Paleta em Cubos 250g", code: "30056", aliases: [] },
  { id: "3", name: "Picanha Suina Temperada Resf", code: "10710", aliases: ["picanha"] },
  { id: "4", name: "Pé Suíno Salgado Porcionado", code: "4001", aliases: ["pe salgado"] },
];

test("busca tolerante a abreviação e acento", () => {
  assert.equal(searchProducts(PRODUCTS, "ling emb mis")[0].id, "1");
  assert.equal(searchProducts(PRODUCTS, "bac cub")[0].id, "2");
  assert.equal(searchProducts(PRODUCTS, "pe salg")[0].id, "4");
  assert.equal(searchProducts(PRODUCTS, "suino")[0].id, "4");
});

test("busca pelo código SUINCO e pelo código da rede (etiqueta da gôndola)", () => {
  assert.equal(searchProducts(PRODUCTS, "10710")[0].id, "3");
  assert.equal(searchProducts(PRODUCTS, "10119", new Set(), { "3": "10119" })[0].id, "3");
  assert.equal(searchProducts(PRODUCTS, "101", new Set(), { "3": "10119" })[0].id, "3");
});

test("período 'mês anterior' e comparação com período equivalente", () => {
  const r = resolveRange(parseFilters({ periodo: "mes-anterior" }), "2026-10-05");
  assert.equal(r.from, "2026-09-01");
  assert.equal(r.to, "2026-09-30");
  assert.equal(r.prevTo, "2026-08-31");
  const r7 = resolveRange(parseFilters({}), "2026-10-05");
  assert.equal(r7.from, "2026-09-29");
  assert.equal(r7.prevFrom, "2026-09-22");
});

test("planilha de mix: nomes, categorias e formatos", () => {
  assert.equal(prettyProductName("LINGUICA TIPO CALABRESA 2,5 KG"), "Linguica Tipo Calabresa 2,5kg");
  assert.equal(guessCategory("PICANHA SUINA TEMPERADA RESF"), "Cortes temperados");
  assert.equal(guessCategory("BACON EM MANTA"), "Defumados");
  assert.equal(formatFromSheetName("CASH"), "cash");
  assert.equal(formatFromSheetName("BH Varejo"), "varejo");
});
