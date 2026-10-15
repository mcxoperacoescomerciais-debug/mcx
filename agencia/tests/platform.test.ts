/**
 * Multiagência: AF e ETROS no mesmo sistema sem nunca misturar dados, e a
 * equipe MCX enxergando cada agência (uma por vez) e a soma das duas.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope, SessionUser } from "../src/server/auth";
import type { VisitInput } from "../src/lib/sync-types";
import { todayIso } from "../src/lib/dates";
import { DEMO_PASSWORD } from "../src/server/db/seed";

let db: DB;
let auth: typeof import("../src/server/auth");
let ops: typeof import("../src/server/operations");
let promoter: typeof import("../src/server/promoter");
let platform: typeof import("../src/server/platform");
let admin: typeof import("../src/server/admin");

const agency: Record<string, string> = {};
let mcx: SessionUser;

async function userRow(username: string) {
  const [u] = await db.select().from(s.users).where(eq(s.users.username, username));
  return u;
}
async function scopeOf(username: string): Promise<Scope> {
  return auth.scopeForUser(await userRow(username));
}

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  ops = await import("../src/server/operations");
  promoter = await import("../src/server/promoter");
  platform = await import("../src/server/platform");
  admin = await import("../src/server/admin");
  for (const a of await db.select().from(s.agencies)) agency[a.slug] = a.id;
  const u = await userRow("mcx");
  mcx = { id: u.id, agencyId: u.agencyId, role: u.role, platform: u.platform, platformRole: "owner", permissions: null, name: u.name, username: u.username, mustChangePassword: false };
});

const f = () => ({ date: todayIso(), brand: null, chain: null, store: null, promoter: null, city: null });

describe("multiagência (MCX)", () => {
  test("cada agência só enxerga os próprios cadastros e programação", async () => {
    const af = await scopeOf("admin");
    const etros = await scopeOf("etros");
    const [afOpts, etOpts] = await Promise.all([ops.filterOptions(af), ops.filterOptions(etros)]);
    assert.deepEqual(etOpts.brands.map((b) => b.name), ["Doce Sabor"]);
    assert.ok(!afOpts.brands.some((b) => b.name === "Doce Sabor"), "AF não vê a marca da ETROS");
    assert.ok(etOpts.promoters.every((p) => p.name === "Carla Mendes"), "ETROS só vê a própria promotora");
    // Loja com o MESMO nome nas duas agências: são registros independentes.
    const sameName = etOpts.stores[0].name;
    const afSame = afOpts.stores.find((x) => x.name === sameName);
    assert.ok(afSame && afSame.id !== etOpts.stores[0].id);
    const etBoard = await ops.getDayBoard(etros, f());
    assert.ok(etBoard.stops.every((st) => etOpts.stores.some((x) => x.id === st.storeId)));
  });

  test("usuário de uma agência não monta escopo de outra", async () => {
    const etrosAdmin = await userRow("etros");
    await assert.rejects(() => auth.scopeForUser(etrosAdmin, agency.af));
  });

  test("promotora da ETROS não registra visita em loja da AF", async () => {
    const carla = await scopeOf("carla");
    const boot = await promoter.buildBootstrap(carla);
    assert.equal(boot.agency.name, "ETROS");
    assert.ok(boot.stores.length > 0 && boot.brands.every((b) => b.name === "Doce Sabor"));
    const [afStore] = await db.select().from(s.stores).where(eq(s.stores.agencyId, agency.af)).limit(1);
    const now = new Date().toISOString();
    const visit: VisitInput = {
      id: randomUUID(),
      scheduleId: null,
      storeId: afStore.id,
      visitDate: todayIso(),
      origin: "extra",
      extraReason: "Teste de isolamento",
      status: "in_progress",
      closeReason: null,
      startedAt: now,
      finishedAt: null,
      geo: { status: "denied", lat: null, lng: null, accuracy: null },
      notes: null,
      attendances: [],
    };
    const [res] = await promoter.applySync(carla, [visit]);
    assert.equal(res.ok, false, "loja de outra agência é recusada");
  });

  test("equipe MCX entra em cada agência e vê só os dados dela", async () => {
    const inAf = await auth.scopeForUser(mcx, agency.af);
    const inEtros = await auth.scopeForUser(mcx, agency.etros);
    assert.equal(inAf.agencyName, "AF Merchandising");
    assert.equal(inEtros.agencyName, "ETROS");
    assert.ok(inAf.platform && inAf.brandIds === null);
    const [a, e] = await Promise.all([ops.filterOptions(inAf), ops.filterOptions(inEtros)]);
    assert.ok(!a.brands.some((b) => e.brands.some((x) => x.id === b.id)), "nenhuma marca em comum");
    assert.ok(inAf.agencyLogoUrl?.startsWith(`/api/logo/${agency.af}`), "AF tem logo");
  });

  test("visão macro soma agência por agência com as regras do painel", async () => {
    const rows = await platform.macroOverview(mcx, todayIso());
    assert.deepEqual(rows.map((r) => r.agency.name).sort(), ["AF Merchandising", "ETROS"]);
    for (const r of rows) {
      const scope = await auth.scopeForUser(mcx, r.agency.id);
      const board = await ops.getDayBoard(scope, f());
      assert.deepEqual(r.kpis, board.kpis, `KPIs de ${r.agency.name} batem com o painel da agência`);
    }
    assert.ok(!(await platform.listAgencies()).some((a) => a.name === "MCX"), "plataforma não aparece como agência");
  });

  test("agência suspensa: ninguém dela entra; reativar devolve o acesso", async () => {
    const off = await platform.updateAgency(mcx, agency.etros, { name: "ETROS", status: "suspended" });
    assert.ok(off.ok);
    const r = await auth.login("etros", DEMO_PASSWORD);
    assert.equal(r.ok, false);
    assert.match(!r.ok ? r.error : "", /suspenso/);
    const on = await platform.updateAgency(mcx, agency.etros, { name: "ETROS", status: "active" });
    assert.ok(on.ok);
  });

  test("criar agência: login único no sistema e primeiro admin com troca de senha", async () => {
    const dup = await platform.createAgency(mcx, { name: "Nova", adminName: "Fulano", adminUsername: "admin", adminPassword: "senha-forte-1" });
    assert.equal(dup.ok, false, "usuário já usado pela AF");
    const ok = await platform.createAgency(mcx, { name: "Nova Agência", adminName: "Fulano", adminUsername: "nova.admin", adminPassword: "senha-forte-1" });
    assert.ok(ok.ok && ok.id);
    const u = await userRow("nova.admin");
    assert.equal(u.agencyId, ok.id);
    assert.equal(u.mustChangePassword, true);
    assert.equal(u.platform, false);
    // Admin da agência não cria nem edita fora dela.
    const novaScope = await auth.scopeForUser(u);
    const etrosAdmin = await userRow("etros");
    const edit = await admin.saveUser(novaScope, { id: etrosAdmin.id, role: "admin", name: "x", username: "etros", email: null, phone: null, internalCode: null, employment: null, region: null, managerId: null, status: "inactive", allBrands: true, teamOnly: false, brandIds: [], storeIds: [], password: null });
    assert.equal(edit.ok, false, "não altera usuário de outra agência");
    const notMcx = await platform.createAgency({ ...mcx, platform: false }, { name: "X", adminName: "X", adminUsername: "xx.admin", adminPassword: "senha-forte-1" });
    assert.equal(notMcx.ok, false, "só a equipe MCX cria agências");
  });
});
