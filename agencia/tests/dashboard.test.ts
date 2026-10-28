/** Indicadores (ruptura por rede/loja/SKU, datas críticas, lojas não atendidas) e dados de demonstração. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, like } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { addDays, todayIso } from "../src/lib/dates";

let db: DB;
let etros: Scope;
let af: Scope;

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  etros = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, "etros")))[0]);
  af = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, "admin")))[0]);
});

describe("indicadores e demonstração", () => {
  test("gera a demonstração só na agência, os indicadores batem e apagar remove tudo", async () => {
    const demo = await import("../src/server/demo-operation");
    const { dashboardData } = await import("../src/server/dashboard");
    const afStores = (await db.select().from(s.stores).where(eq(s.stores.agencyId, af.agencyId))).length;
    const r = await demo.seedOperationDemo(etros);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal((await demo.seedOperationDemo(etros)).ok, false, "não duplica");
    const st = await demo.operationDemoStatus(etros);
    assert.equal(st.stores, 8);
    assert.ok(st.promoter);

    const f = { from: addDays(todayIso(), -13), to: todayIso(), brand: null, chain: null, store: null, promoter: null, city: null };
    const d = await dashboardData(etros, f);
    assert.ok(d.totals.checks > 0, "SKUs verificados");
    assert.ok(d.totals.ruptures > 0, "rupturas");
    assert.equal(d.totals.ruptureIndex, Math.round((d.totals.ruptures / d.totals.checks) * 1000) / 10);
    assert.equal(d.byChain.reduce((n, c) => n + c.ruptures, 0), d.totals.ruptures, "rede soma o total");
    assert.ok(d.byChain.some((c) => c.name === "ABC VAREJO"));
    assert.ok(d.totals.storesPlanned > 0 && d.totals.storesDone > 0);
    assert.equal(d.totals.storesMissed, d.missed.length);
    assert.ok(d.totals.salesFloor + d.totals.stockroom >= d.totals.ruptures * 0.5);

    assert.equal((await db.select().from(s.stores).where(eq(s.stores.agencyId, af.agencyId))).length, afStores, "outra agência intocada");

    const del = await demo.deleteOperationDemo(etros);
    assert.ok(del.ok, JSON.stringify(del));
    assert.equal((await db.select().from(s.stores).where(and(eq(s.stores.agencyId, etros.agencyId), like(s.stores.code, "DEMO-%")))).length, 0);
    assert.equal((await demo.operationDemoStatus(etros)).promoter, null);
  });

  test("módulos da agência escondem Degustações e Financeiro", async () => {
    const { hiddenPanels, mergeSettings } = await import("../src/lib/settings");
    assert.deepEqual(hiddenPanels(mergeSettings({})), []);
    assert.deepEqual(hiddenPanels(mergeSettings({ modules: { tastings: false, finance: false } })), ["degustacoes", "financeiro"]);
    assert.equal(mergeSettings({ overviewStyle: "executive" }).overviewStyle, "executive");
  });
});
