/** Início da operação: metas da semana só cobram os dias a partir dele. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { operationFrom, targetFromStart } from "../src/lib/portfolio";

// Semana de 16/11/2026 (segunda) a 22/11/2026 (domingo); operação começa terça 17/11.
const W = { from: "2026-11-16", to: "2026-11-22" };
const START = "2026-11-17";

describe("início da operação nas metas", () => {
  test("sem início ou início antes da janela: meta cheia", () => {
    assert.equal(operationFrom(W.from, null), W.from);
    assert.equal(operationFrom(W.from, "2026-11-01"), W.from);
    const r = targetFromStart({ perWeek: 2, period: "week", weekdays: [1, 4] }, W.from, W.to, null, "2026-11-19");
    assert.deepEqual(r && { from: r.from, goal: r.goal }, { from: W.from, goal: 2 });
  });

  test("Seg/Qui com início na terça: a segunda não conta (meta 1, só a quinta)", () => {
    const r = targetFromStart({ perWeek: 2, period: "week", weekdays: [1, 4] }, W.from, W.to, START, "2026-11-17");
    assert.equal(r?.from, START);
    assert.equal(r?.goal, 1);
    assert.equal(r?.expected, 0);
    const sun = targetFromStart({ perWeek: 2, period: "week", weekdays: [1, 4] }, W.from, W.to, START, W.to);
    assert.equal(sun?.expected, 1);
  });

  test("só segunda marcada e início na terça: nada a cobrar nesta semana", () => {
    assert.equal(targetFromStart({ perWeek: 1, period: "week", weekdays: [1] }, W.from, W.to, START, "2026-11-18"), null);
  });

  test("hoje (antes do início) não cobra nada; semana inteira antes do início some", () => {
    const r = targetFromStart({ perWeek: 3, period: "week", weekdays: [] }, W.from, W.to, START, "2026-11-16");
    assert.equal(r?.expected, 0);
    assert.equal(r?.goal, 3); // 3 × 6/7 = 2,57 → 3
    assert.equal(targetFromStart({ perWeek: 2, period: "week", weekdays: [] }, "2026-11-09", "2026-11-15", START, "2026-11-15"), null);
  });
});
