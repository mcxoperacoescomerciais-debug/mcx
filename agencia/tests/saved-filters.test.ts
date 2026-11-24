/** Filtros salvos por tela do painel. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtersToRestore, pickFilters, savedFiltersKey } from "../src/lib/saved-filters";

test("pega só os filtros preenchidos (sem página, aba ou exportação)", () => {
  const p = new URLSearchParams("brand=a,b&page=3&aba=x&q=leite&status=&from=2026-11-01");
  assert.deepEqual(pickFilters(p), { from: "2026-11-01", brand: "a,b", q: "leite" });
});

test("no mesmo dia volta tudo; no outro dia as datas ficam de fora", () => {
  const saved = { day: "2026-11-24", values: { brand: "a", from: "2026-11-01", to: "2026-11-24", date: "2026-11-20", q: "x" } };
  assert.deepEqual(filtersToRestore(saved, "2026-11-24"), saved.values);
  assert.deepEqual(filtersToRestore(saved, "2026-11-25"), { brand: "a", q: "x" });
});

test("salvo inválido ou vazio não restaura nada", () => {
  assert.deepEqual(filtersToRestore(null, "2026-11-24"), {});
  assert.deepEqual(filtersToRestore({ day: "2026-11-24", values: { page: "2", brand: "" } as Record<string, string> }, "2026-11-24"), {});
  assert.deepEqual(filtersToRestore("lixo" as never, "2026-11-24"), {});
});

test("chave separa agência e tela", () => {
  assert.notEqual(savedFiltersKey("ag1", "/painel/fotos"), savedFiltersKey("ag2", "/painel/fotos"));
  assert.notEqual(savedFiltersKey("ag1", "/painel/fotos"), savedFiltersKey("ag1", "/painel/rupturas"));
});
