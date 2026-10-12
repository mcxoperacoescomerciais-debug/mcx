/**
 * Relatórios independentes: mapa operacional, execução por marca e pendências
 * de visitas não realizadas — sempre a partir dos dados reais e no escopo.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { addDays, todayIso } from "../src/lib/dates";
import { parseCoords } from "../src/lib/rules";

let db: DB;
let auth: typeof import("../src/server/auth");
let map: typeof import("../src/server/map");
let brand: typeof import("../src/server/brand-execution");
let issues: typeof import("../src/server/issues");
let ops: typeof import("../src/server/operations");

async function scopeOf(username: string): Promise<Scope> {
  const [u] = await db.select().from(s.users).where(eq(s.users.username, username));
  return auth.scopeForUser(u);
}
const day = (date = todayIso()) => ({ date, brand: null, chain: null, store: null, promoter: null, city: null, status: null });

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  map = await import("../src/server/map");
  brand = await import("../src/server/brand-execution");
  issues = await import("../src/server/issues");
  ops = await import("../src/server/operations");
});

describe("relatórios", () => {
  test("coordenadas digitadas: formatos aceitos e inválidos", () => {
    assert.deepEqual(parseCoords("-19.9245, -43.9352"), { lat: -19.9245, lng: -43.9352 });
    assert.deepEqual(parseCoords("-19,9245", "-43,9352"), { lat: -19.9245, lng: -43.9352 });
    assert.equal(parseCoords(""), null);
    assert.equal(parseCoords("abc"), "invalid");
    assert.equal(parseCoords("0, 0"), "invalid");
    assert.equal(parseCoords("-95, 10"), "invalid");
  });

  test("mapa: loja sem coordenadas vai para a lista, nunca para um ponto inventado", async () => {
    const r = await map.mapData(await scopeOf("admin"), day());
    const missing = r.stores.filter((x) => x.lat == null);
    assert.ok(missing.some((x) => x.name === "Epa Santa Efigênia"));
    assert.ok(r.stores.filter((x) => x.lat != null).every((x) => Math.abs(x.lat!) <= 90));
    // A situação no mapa é a mesma do painel do dia.
    const board = await ops.getDayBoard(await scopeOf("admin"), day());
    for (const st of board.stops) {
      const m = r.stores.find((x) => x.id === st.storeId);
      assert.ok(m && m.stops.some((x) => x.bucket === st.bucket), `${st.storeName} no mapa`);
    }
    // Localização registrada é um ponto com horário, com distância até a loja.
    const reg = r.stores.flatMap((x) => x.stops).find((x) => x.registered);
    if (reg) assert.ok(reg.registered!.at && reg.registered!.distanceM !== undefined);
  });

  test("mapa: gestor restrito à Bravo só vê lojas da Bravo", async () => {
    const r = await map.mapData(await scopeOf("bravo"), day());
    const bravoStores = await db.select({ storeId: s.storeBrands.storeId }).from(s.storeBrands).innerJoin(s.brands, eq(s.brands.id, s.storeBrands.brandId)).where(eq(s.brands.code, "BRAVO"));
    const allowed = new Set(bravoStores.map((x) => x.storeId));
    assert.ok(r.stores.length > 0 && r.stores.every((x) => allowed.has(x.id)));
  });

  test("execução por marca: previsto, concluído e lojas atendidas batem com os registros", async () => {
    const scope = await scopeOf("gestor");
    const [b] = await db.select().from(s.brands).where(eq(s.brands.code, "BRAVO"));
    const from = addDays(todayIso(), -6);
    const r = await brand.brandExecution(scope, { ...day(), from, to: todayIso(), kind: null, q: "", page: 1, brand: b.id });
    assert.ok(r.planned > 0);
    assert.equal(r.completed, r.attendances.filter((a) => a.status === "completed").length);
    assert.ok(r.attendances.every((a) => a.brandId === b.id), "só atendimentos da marca");
    assert.ok(r.storesServed <= r.completed);
  });

  test("pendências: programação passada sem visita vira 'visita não realizada', uma vez só", async () => {
    const scope = await scopeOf("gestor");
    const from = addDays(todayIso(), -6);
    const list = await issues.listIssues(scope, { from, to: addDays(todayIso(), -1), brand: null, store: null, promoter: null, chain: null, city: null });
    const missed = list.filter((i) => i.kind === "visit_missed");
    const keys = new Set(missed.map((i) => i.key));
    assert.equal(keys.size, missed.length, "sem duplicidade");
    for (const m of missed) {
      const scheduleId = m.key.split(":")[1];
      const visits = await db.select().from(s.visits).where(eq(s.visits.scheduleId, scheduleId));
      assert.ok(visits.every((v) => v.status === "cancelled"), "não tem visita válida");
    }
  });
});
