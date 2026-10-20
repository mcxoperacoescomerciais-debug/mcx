/** Calculadora de degustação: preço mínimo, preço com margem e margem por cidade. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { blankCity, calcTasting, normalizeCity } from "../src/lib/tasting-calc";

describe("calculadora de degustação", () => {
  test("preço mínimo e sugerido por ação, e margem real com o preço da marca", () => {
    const city = { ...blankCity("Divinópolis"), actions: 10, tasterFee: 150, transport: 20, meal: 25, consumables: 15, supervision: 100, offeredPrice: 400 };
    const r = calcTasting({ taxPct: 16, marginPct: 20 }, [city]);
    const c = r.cities[0];
    assert.equal(c.perActionCost, 210);
    assert.equal(c.directCost, 2200);
    assert.equal(c.costPerAction, 220);
    assert.equal(c.breakEvenPerAction, 261.9, "220 ÷ (1 − 16%)");
    assert.equal(c.suggestedPerAction, 343.75, "220 ÷ (1 − 16% − 20%)");
    // Com R$ 400 por ação: 4.000 × 84% − 2.200 = 1.160 (29%).
    assert.equal(c.offered!.result, 1160);
    assert.equal(c.offered!.margin, 29);
  });

  test("várias cidades: deslocamento pesa na cidade longe; preço único mostra quem sustenta quem", () => {
    const perto = { ...blankCity("Divinópolis"), actions: 8, tasterFee: 150, meal: 20 };
    const longe = { ...blankCity("Uberaba"), actions: 2, tasterFee: 150, meal: 20, freightKm: 600, freightKml: 5, lodging: 300 };
    const r = calcTasting({ taxPct: 16, marginPct: 20 }, [perto, longe]);
    const [a, b] = r.cities;
    assert.ok(b.suggestedPerAction > a.suggestedPerAction * 2, "a cidade distante precisa de preço bem maior");
    const u = r.totals.uniqueByCity;
    assert.ok(u[0].result > 0 && u[1].result < 0, "com preço único, Divinópolis cobre o prejuízo de Uberaba");
    assert.ok(Math.abs(u[0].result + u[1].result - r.totals.directCost * 0.2 / 0.64) < 1, "no total, a margem desejada");
  });

  test("transporte e frete pelo km: km ÷ km/l × combustível; transporte × ações, frete × viagens", () => {
    const c = { ...blankCity("Itaúna"), actions: 5, transportKm: 60, transportKml: 12, freightKm: 40, freightKml: 8, freightTrips: 1, transport: 999, freight: 999 };
    const r = calcTasting({ taxPct: 0, marginPct: 0, fuelPrice: 6 }, [c]).cities[0];
    assert.equal(r.transportPerAction, 30, "60 km ÷ 12 km/l = 5 L × R$ 6");
    assert.equal(r.transportTotal, 150, "× 5 ações");
    assert.equal(r.freightPerTrip, 30, "40 ÷ 8 = 5 L × R$ 6");
    assert.equal(r.freightTotal, 30, "uma viagem só");
    assert.equal(r.directCost, 180);
    // Sem km, vale o valor digitado.
    const manual = calcTasting({ taxPct: 0, marginPct: 0, fuelPrice: 6 }, [{ ...c, transportKm: 0, freightKm: 0, transport: 10, freight: 50, freightTrips: 2 }]).cities[0];
    assert.equal(manual.transportTotal, 50);
    assert.equal(manual.freightTotal, 100);
  });

  test("orçamento salvo no modelo antigo é convertido", () => {
    const old = { city: "X", actions: 4, tasters: 2, tasterFee: 100, tasterTransport: 15, km: 100, costPerKm: 1.5, trips: 2, freight: 20, offeredPrice: null };
    const c = normalizeCity(old);
    assert.equal(c.transport, 30, "15 por degustadora × 2");
    assert.equal(c.transportKm, 0);
    assert.equal(c.freight, 320, "20 + 100 km × 1,50 × 2 viagens");
    assert.equal(c.freightTrips, 1);
  });

  test("percentuais somando 100% ou mais são inválidos", () => {
    const r = calcTasting({ taxPct: 80, marginPct: 30 }, [{ ...blankCity("X"), tasterFee: 100 }]);
    assert.equal(r.invalid, true);
  });
});
