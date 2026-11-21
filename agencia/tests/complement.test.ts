/** Complemento de visita: marca que faltou numa visita já encerrada no dia. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { brandsInOtherVisits, currentStoreVisit, remainingStoreBrands, sameDayStoreVisits } from "../src/app/app/_lib/complement";
import type { LocalVisit } from "../src/app/app/_lib/local-store";

const visit = (id: string, over: Partial<LocalVisit>, brands: string[] = []): LocalVisit =>
  ({
    id,
    storeId: "loja",
    visitDate: "2026-11-21",
    status: "completed",
    startedAt: "2026-11-21T10:44:00.000Z",
    attendances: Object.fromEntries(brands.map((b) => [`${id}-${b}`, { id: `${id}-${b}`, brandId: b, status: "completed" }])),
    ...over,
  }) as unknown as LocalVisit;

describe("complemento de visita", () => {
  const store = ["suinco", "avivar", "ygloo"];

  test("visita extraordinária só com uma marca: as outras marcas da loja ficam disponíveis", () => {
    const day = sameDayStoreVisits([visit("v1", {}, ["suinco"])], "loja", "2026-11-21");
    assert.deepEqual(remainingStoreBrands(store, day), ["avivar", "ygloo"]);
  });

  test("marca atendida no complemento não fica disponível de novo nem se repete na primeira visita", () => {
    const all = [visit("v1", {}, ["suinco"]), visit("v2", { startedAt: "2026-11-21T12:00:00.000Z" }, ["avivar"])];
    const day = sameDayStoreVisits(all, "loja", "2026-11-21");
    assert.deepEqual(remainingStoreBrands(store, day), ["ygloo"]);
    assert.deepEqual([...brandsInOtherVisits("v1", day)], ["avivar"]);
    assert.deepEqual([...brandsInOtherVisits("v2", day)], ["suinco"]);
  });

  test("visita cancelada, de outra loja ou de outro dia não conta", () => {
    const all = [
      visit("v1", { status: "cancelled" }, ["suinco"]),
      visit("v2", { storeId: "outra" }, ["avivar"]),
      visit("v3", { visitDate: "2026-11-20" }, ["ygloo"]),
    ];
    const day = sameDayStoreVisits(all, "loja", "2026-11-21");
    assert.equal(day.length, 0);
    assert.deepEqual(remainingStoreBrands(store, day), store);
  });

  test("lista de lojas abre a visita em andamento; sem ela, a mais recente do dia", () => {
    const first = visit("v1", {}, ["suinco"]);
    const second = visit("v2", { startedAt: "2026-11-21T12:00:00.000Z" }, ["avivar"]);
    assert.equal(currentStoreVisit([first, second])?.id, "v2");
    assert.equal(currentStoreVisit([{ ...first, status: "in_progress" } as LocalVisit, second])?.id, "v1");
    assert.equal(currentStoreVisit([]), undefined);
  });
});
