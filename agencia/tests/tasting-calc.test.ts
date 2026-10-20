/** Calculadora de degustação: preço mínimo, preço com margem e margem por cidade. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { blankCity, calcTasting } from "../src/lib/tasting-calc";

describe("calculadora de degustação", () => {
  test("preço mínimo e sugerido por ação, e margem real com o preço da marca", () => {
    const city = { ...blankCity("Divinópolis"), actions: 10, tasterFee: 150, tasterTransport: 20, meal: 25, consumables: 15, km: 0, supervision: 100, offeredPrice: 400 };
    const r = calcTasting({ taxPct: 6, adminPct: 10, marginPct: 20 }, [city]);
    const c = r.cities[0];
    assert.equal(c.perActionCost, 210);
    assert.equal(c.directCost, 2200);
    assert.equal(c.costPerAction, 220);
    assert.equal(c.breakEvenPerAction, 261.9, "220 ÷ (1 − 6% − 10%)");
    assert.equal(c.suggestedPerAction, 343.75, "220 ÷ (1 − 6% − 10% − 20%)");
    // Com R$ 400 por ação: 4.000 × 84% − 2.200 = 1.160 (29%).
    assert.equal(c.offered!.result, 1160);
    assert.equal(c.offered!.margin, 29);
  });

  test("várias cidades: deslocamento pesa na cidade longe; preço único mostra quem sustenta quem", () => {
    const perto = { ...blankCity("Divinópolis"), actions: 8, tasterFee: 150, meal: 20 };
    const longe = { ...blankCity("Uberaba"), actions: 2, tasterFee: 150, meal: 20, km: 600, costPerKm: 1.2, lodging: 300 };
    const r = calcTasting({ taxPct: 6, adminPct: 10, marginPct: 20 }, [perto, longe]);
    const [a, b] = r.cities;
    assert.ok(b.suggestedPerAction > a.suggestedPerAction * 2, "a cidade distante precisa de preço bem maior");
    const u = r.totals.uniqueByCity;
    assert.ok(u[0].result > 0 && u[1].result < 0, "com preço único, Divinópolis cobre o prejuízo de Uberaba");
    assert.ok(Math.abs(u[0].result + u[1].result - r.totals.directCost * 0.2 / 0.64) < 1, "no total, a margem desejada");
  });

  test("percentuais somando 100% ou mais são inválidos", () => {
    const r = calcTasting({ taxPct: 50, adminPct: 30, marginPct: 30 }, [{ ...blankCity("X"), tasterFee: 100 }]);
    assert.equal(r.invalid, true);
  });
});
