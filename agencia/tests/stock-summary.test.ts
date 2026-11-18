/** Etapa de estoque com três botões: nada é obrigatório, ruptura não esconde o estoque, um preço por produto. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { productPrice, stockSummary } from "../src/app/app/_lib/stock-summary";
import { attendanceMissing } from "../src/lib/rules";
import { stockInput } from "../src/lib/sync-types";

const P = "11111111-1111-4111-8111-111111111111";
const val = (id: string, location: string, quantity: number, unit: string, price: number | null = null) => ({ id, productId: P, location, quantity, unit, price });

describe("estoque: três botões por produto", () => {
  test("produto sem toque não bloqueia a finalização, mesmo em marca com estoque obrigatório", () => {
    const missing = attendanceMissing({
      brand: { minBeforePhotos: 0, minAfterPhotos: 0, requireStock: true, rupturePhotoRequired: false },
      beforePhotos: 0,
      afterPhotos: 0,
      trackedProductIds: [P, "22222222-2222-4222-8222-222222222222"],
      stock: {},
      damages: [],
      exceptionItems: [],
      exceptionReason: null,
      exceptionNote: null,
      allowExceptions: false,
    } as Parameters<typeof attendanceMissing>[0]);
    assert.deepEqual(missing.filter((m) => m.kind === "stock"), []);
  });

  test("sem toque: nenhum botão preenchido", () => {
    assert.deepEqual(stockSummary({ stock: {}, ruptures: {}, validities: {} }, P), { rupture: false, sales: null, stock: null });
  });

  test("área de vendas informada aparece com quantidade e unidade", () => {
    const a = { stock: { [P]: { state: "quantity", quantity: 12, unit: "cx" } }, ruptures: {}, validities: {} };
    assert.deepEqual(stockSummary(a, P), { rupture: false, sales: "12 CX", stock: null });
  });

  test("ruptura esconde a área de vendas, mas o estoque informado continua", () => {
    const a = {
      stock: { [P]: { state: "zero", quantity: 0, unit: "un" } },
      ruptures: { r1: { productId: P } },
      validities: { v1: val("v1", "stock", 3, "cx"), v2: val("v2", "stock", 2, "cx"), v3: val("v3", "stock", 4, "un") },
    };
    assert.deepEqual(stockSummary(a, P), { rupture: true, sales: null, stock: "5 CX + 4 UN" });
  });

  test("validade da área de vendas não entra no resumo do estoque", () => {
    const a = { stock: { [P]: { state: "quantity", quantity: 8, unit: "un" } }, ruptures: {}, validities: { v1: val("v1", "sales_floor", 8, "un") } };
    assert.equal(stockSummary(a, P).stock, null);
  });

  test("um preço por produto: o da contagem; senão, o de uma validade", () => {
    assert.equal(productPrice({ stock: { [P]: { state: "quantity", quantity: 1, price: 12.9 } }, ruptures: {}, validities: { v1: val("v1", "stock", 1, "un", 10) } }, P), 12.9);
    assert.equal(productPrice({ stock: {}, ruptures: {}, validities: { v1: val("v1", "stock", 1, "un", 10) } }, P), 10);
    assert.equal(productPrice({ stock: { [P]: { state: "zero", quantity: 0 } }, ruptures: {}, validities: {} }, P), null);
  });

  test("sincronização aceita o preço na contagem e continua aceitando celular antigo (sem preço)", () => {
    const base = { productId: P, state: "quantity", quantity: 3, unit: "un", note: null, recordedAt: "2026-11-18T12:00:00.000Z" };
    assert.equal(stockInput.parse({ ...base, price: 19.9 }).price, 19.9);
    assert.equal(stockInput.parse(base).price, undefined);
  });
});
