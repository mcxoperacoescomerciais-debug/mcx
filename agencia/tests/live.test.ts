/** Mapa ao vivo (onde cada promotor está agora) e permissão de foto da galeria. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { galleryAllowedFor } from "../src/lib/settings";

let db: DB;
const scopes: Record<string, Scope> = {};

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  for (const u of ["admin", "lucas", "joao"]) scopes[u] = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, u)))[0]);
});

describe("acompanhamento ao vivo", () => {
  test("promotor com visita aberta aparece na loja; online depende do último sinal do app", async () => {
    const { liveOperations } = await import("../src/server/map");
    await db.update(s.users).set({ lastSeenAt: new Date() }).where(eq(s.users.id, scopes.joao.userId));
    await db.update(s.users).set({ lastSeenAt: new Date(Date.now() - 60 * 60_000) }).where(eq(s.users.id, scopes.lucas.userId));
    const live = await liveOperations(scopes.admin);
    const joao = live.promoters.find((p) => p.promoterId === scopes.joao.userId);
    assert.ok(joao, "João tem programação hoje");
    assert.equal(joao.online, true);
    const lucas = live.promoters.find((p) => p.promoterId === scopes.lucas.userId);
    if (lucas) assert.equal(lucas.online, false, "sinal de 1 h atrás não é online");
    for (const p of live.promoters) {
      if (p.current) {
        assert.equal(p.status, "in_store");
        assert.ok(live.events.some((e) => e.id === `in:${p.current!.visitId}` && e.kind === "checkin"), "a chegada vira aviso");
      }
    }
    assert.ok(live.events.every((e, i, a) => i === 0 || a[i - 1].at >= e.at), "avisos do mais novo para o mais antigo");
  });

  test("o app atualizar marca o promotor como online", async () => {
    const { buildBootstrap } = await import("../src/server/promoter");
    await db.update(s.users).set({ lastSeenAt: null }).where(eq(s.users.id, scopes.lucas.userId));
    await buildBootstrap(scopes.lucas);
    await new Promise((r) => setTimeout(r, 50));
    const [u] = await db.select({ lastSeenAt: s.users.lastSeenAt }).from(s.users).where(eq(s.users.id, scopes.lucas.userId));
    assert.ok(u.lastSeenAt && Date.now() - u.lastSeenAt.getTime() < 60_000);
  });
});

describe("foto da galeria", () => {
  test("regra da agência: marca, ninguém ou só autorizados", async () => {
    assert.equal(galleryAllowedFor("brand", false), true);
    assert.equal(galleryAllowedFor("none", true), false);
    assert.equal(galleryAllowedFor("authorized", false), false);
    assert.equal(galleryAllowedFor("authorized", true), true);
    const { buildBootstrap } = await import("../src/server/promoter");
    const lucas = scopes.lucas;
    const none = await buildBootstrap({ ...lucas, settings: { ...lucas.settings, galleryPolicy: "none" } });
    assert.ok(none.brands.every((b) => !b.allowGallery), "só câmera para todos");
    const auth = await buildBootstrap({ ...lucas, settings: { ...lucas.settings, galleryPolicy: "authorized" } });
    assert.ok(auth.brands.every((b) => !b.allowGallery), "Lucas ainda não autorizado");
    const admin = await import("../src/server/admin");
    assert.ok((await admin.saveGalleryAuthorized(scopes.admin, [lucas.userId])).ok);
    const ok = await buildBootstrap({ ...lucas, settings: { ...lucas.settings, galleryPolicy: "authorized" } });
    const brands = await db.select().from(s.brands);
    for (const b of ok.brands) assert.equal(b.allowGallery, brands.find((x) => x.id === b.id)!.allowGallery, "autorizado: vale a regra da marca");
  });
});

describe("localização do promotor", () => {
  test("sinal do app guarda permissão e posição; quem não liberou aparece na lista para cobrança", async () => {
    const map = await import("../src/server/map");
    await map.promoterHeartbeat(scopes.lucas.userId, { permission: "granted", lat: -19.92, lng: -43.94, accuracy: 12 });
    await map.promoterHeartbeat(scopes.joao.userId, { permission: "denied" });
    const list = await map.geoPermissionList(scopes.admin);
    assert.ok(list.some((p) => p.id === scopes.joao.userId && p.permission === "denied"));
    assert.ok(!list.some((p) => p.id === scopes.lucas.userId), "quem liberou não aparece");
    const live = await map.liveOperations(scopes.admin);
    const lucas = live.promoters.find((p) => p.promoterId === scopes.lucas.userId);
    if (lucas) assert.deepEqual([lucas.position?.lat, lucas.position?.lng], [-19.92, -43.94]);
    // Posição inválida não apaga a anterior.
    await map.promoterHeartbeat(scopes.lucas.userId, { permission: "granted", lat: 0, lng: 0 });
    const [u] = await db.select().from(s.users).where(eq(s.users.id, scopes.lucas.userId));
    assert.equal(u.lastLat, -19.92);
  });

  test("filtro do mapa: só promotores com loja no filtro e totais do dia", async () => {
    const { liveOperations } = await import("../src/server/map");
    const all = await liveOperations(scopes.admin);
    const [brand] = await db.select().from(s.brands).where(eq(s.brands.code, "BRAVO"));
    const one = await liveOperations(scopes.admin, { brand: brand.id });
    assert.ok(one.totals.storesPlanned <= all.totals.storesPlanned);
    assert.ok(one.promoters.length <= all.promoters.length);
    assert.equal(one.totals.inStore, one.promoters.filter((p) => p.current).length);
  });
});

describe("pendência de visita esquecida aberta", () => {
  test("visita de ontem ainda aberta aparece hoje no topo das pendências", async () => {
    const { listIssues } = await import("../src/server/issues");
    const { addDays, todayIso } = await import("../src/lib/dates");
    const [store] = await db.select().from(s.stores).where(eq(s.stores.agencyId, scopes.admin.agencyId)).limit(1);
    const yesterday = addDays(todayIso(), -1);
    // Sem programação ligada: visita extraordinária aberta e esquecida.
    await db.update(s.visits).set({ status: "completed", finishedAt: new Date() }).where(eq(s.visits.promoterId, scopes.lucas.userId));
    const [v] = await db
      .insert(s.visits)
      .values({ id: crypto.randomUUID(), agencyId: scopes.admin.agencyId, promoterId: scopes.lucas.userId, storeId: store.id, visitDate: yesterday, status: "in_progress", origin: "extra", extraReason: "teste", startedAt: new Date(Date.now() - 26 * 3600_000), createdBy: scopes.lucas.userId, updatedBy: scopes.lucas.userId })
      .returning();
    const today = todayIso();
    const issues = await listIssues(scopes.admin, { from: today, to: today, brand: null, chain: null, store: null, promoter: null, city: null });
    const it = issues.find((i) => i.key === `visit_open:${v.id}`);
    assert.ok(it, "aparece mesmo com o filtro só de hoje");
    assert.equal(it.priority, 1);
    assert.match(it.title, /Esqueceu de encerrar/);
  });
});

describe("presença na loja", () => {
  test("check-in longe do endereço vira pendência; sem localização também", async () => {
    const { listIssues } = await import("../src/server/issues");
    const { todayIso } = await import("../src/lib/dates");
    const today = todayIso();
    const [store] = await db.select().from(s.stores).where(eq(s.stores.agencyId, scopes.admin.agencyId)).limit(1);
    await db.update(s.stores).set({ lat: -19.92, lng: -43.94 }).where(eq(s.stores.id, store.id));
    await db.update(s.visits).set({ status: "completed", finishedAt: new Date() }).where(eq(s.visits.promoterId, scopes.joao.userId));
    const mk = (lat: number | null, lng: number | null) => ({ id: crypto.randomUUID(), agencyId: scopes.admin.agencyId, promoterId: scopes.joao.userId, storeId: store.id, visitDate: today, status: "completed" as const, origin: "extra" as const, extraReason: "teste", startedAt: new Date(), finishedAt: new Date(), lat, lng, accuracyM: lat == null ? null : 10, geoStatus: lat == null ? ("denied" as const) : ("captured" as const), createdBy: scopes.joao.userId, updatedBy: scopes.joao.userId });
    const far = mk(-19.95, -43.94);
    const none = mk(null, null);
    const ok = mk(-19.9201, -43.94);
    await db.insert(s.visits).values([far, none, ok]);
    const issues = await listIssues(scopes.admin, { from: today, to: today, brand: null, chain: null, store: null, promoter: null, city: null });
    const f = issues.find((i) => i.key === `checkin_far:${far.id}`);
    assert.ok(f, "check-in a ~3,3 km vira pendência");
    assert.match(f.title, /km da loja/);
    assert.ok(issues.some((i) => i.key === `checkin_no_location:${none.id}`));
    assert.ok(!issues.some((i) => i.key.endsWith(ok.id)), "dentro do raio não gera pendência");
  });
});
