/**
 * Testes de integração dos fluxos críticos (cenários 1–8 do escopo), contra um
 * Postgres em memória (PGlite) com os dados de demonstração. Exercitam a mesma
 * camada de servidor usada pelas rotas: sync do promotor, escopo, ações do
 * gestor, painel do dia e relatórios.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import type { AttendanceInput, VisitInput } from "../src/lib/sync-types";
import { todayIso } from "../src/lib/dates";

let db: DB;
let auth: typeof import("../src/server/auth");
let promoter: typeof import("../src/server/promoter");
let manager: typeof import("../src/server/manager");
let ops: typeof import("../src/server/operations");
let details: typeof import("../src/server/details");
let schedules: typeof import("../src/server/schedules");
let pdf: typeof import("../src/server/pdf/attendance-pdf");

const scopes: Record<string, Scope> = {};
const ids: Record<string, string> = {};

async function scopeOf(username: string): Promise<Scope> {
  const [u] = await db.select().from(s.users).where(eq(s.users.username, username));
  return auth.scopeForUser(u);
}

async function productsOf(brandId: string, storeId: string) {
  return promoter.trackedProducts(db, storeId, brandId);
}

function attendancePayload(over: Partial<AttendanceInput> & { brandId: string }): AttendanceInput {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    status: "in_progress",
    startedAt: now,
    finishedAt: null,
    activitiesDone: [],
    notes: null,
    exceptionItems: [],
    exceptionReason: null,
    exceptionNote: null,
    cancelReason: null,
    photos: [],
    deletedPhotoIds: [],
    stock: [],
    clearedStockProductIds: [],
    unregistered: [],
    deletedUnregisteredIds: [],
    ruptures: [],
    deletedRuptureIds: [],
    occurrences: [],
    deletedOccurrenceIds: [],
    ...over,
  };
}

function photo(kind: "before" | "after" | "rupture", ruptureId: string | null = null) {
  return { id: randomUUID(), kind, ruptureId, occurrenceId: null, source: "camera" as const, takenAt: new Date().toISOString() };
}

function visitPayload(over: Partial<VisitInput> & { storeId: string; attendances: AttendanceInput[] }): VisitInput {
  return {
    id: randomUUID(),
    scheduleId: null,
    visitDate: todayIso(),
    origin: "scheduled",
    extraReason: null,
    status: "in_progress",
    closeReason: null,
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    finishedAt: null,
    geo: { status: "captured", lat: -20.1, lng: -44.9, accuracy: 15 },
    notes: null,
    ...over,
  };
}

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  promoter = await import("../src/server/promoter");
  manager = await import("../src/server/manager");
  ops = await import("../src/server/operations");
  details = await import("../src/server/details");
  schedules = await import("../src/server/schedules");
  pdf = await import("../src/server/pdf/attendance-pdf");
  for (const u of ["lucas", "ana", "joao", "gestor", "bravo", "admin"]) scopes[u] = await scopeOf(u);
  const brands = await db.select().from(s.brands);
  for (const b of brands) ids[b.code] = b.id;
  const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super BH Pio XII"));
  ids.store = store.id;
  const [sch] = await db
    .select()
    .from(s.schedules)
    .where(and(eq(s.schedules.storeId, store.id), eq(s.schedules.date, todayIso()), eq(s.schedules.status, "active")));
  ids.schedule = sch.id;
});

describe("fluxos críticos", () => {
  test("cenário 1: visita com duas marcas, fotos, estoque e ruptura — tudo vinculado e no painel", async () => {
    const lucas = scopes.lucas;
    // Gestor deixa só duas marcas na programação (com justificativa).
    const upd = await schedules.updateSchedule(scopes.gestor, ids.schedule, { plannedStart: "08:30", brandIds: [ids.BRAVO, ids.FOFINHO] }, "Teste: duas marcas hoje");
    assert.ok(upd.ok, JSON.stringify(upd));

    const bravoProducts = await productsOf(ids.BRAVO, ids.store);
    const fofProducts = await productsOf(ids.FOFINHO, ids.store);
    const ruptureId = randomUUID();
    const now = new Date().toISOString();
    const bravo = attendancePayload({
      brandId: ids.BRAVO,
      status: "completed",
      finishedAt: now,
      photos: [photo("before"), photo("after")],
      stock: bravoProducts.map((p, i) => ({ productId: p, state: i === 0 ? ("zero" as const) : ("quantity" as const), quantity: i === 0 ? 0 : 5 + i, note: null, recordedAt: now })),
      ruptures: [{ id: ruptureId, productId: bravoProducts[0], situation: "shelf_empty", knownStock: 0, note: null, fromStockSuggestion: true, recordedAt: now }],
    });
    const fof = attendancePayload({
      brandId: ids.FOFINHO,
      status: "completed",
      finishedAt: now,
      photos: [photo("before"), photo("after")],
      stock: fofProducts.map((p) => ({ productId: p, state: "quantity" as const, quantity: 3, note: null, recordedAt: now })),
    });
    const visit = visitPayload({ storeId: ids.store, scheduleId: ids.schedule, attendances: [bravo, fof], status: "completed", finishedAt: now });
    const [res] = await promoter.applySync(lucas, [visit]);
    assert.ok(res.ok, JSON.stringify(res));
    ids.visit = visit.id;
    ids.bravoAtt = bravo.id;
    ids.fofAtt = fof.id;
    ids.rupture = ruptureId;

    const atts = await db.select().from(s.attendances).where(eq(s.attendances.visitId, visit.id));
    assert.equal(atts.length, 2);
    assert.ok(atts.every((a) => a.status === "completed"));
    const [v] = await db.select().from(s.visits).where(eq(s.visits.id, visit.id));
    assert.equal(v.status, "completed");
    const [r] = await db.select().from(s.ruptures).where(eq(s.ruptures.id, ruptureId));
    assert.equal(r.attendanceId, bravo.id);
    assert.equal(r.productId, bravoProducts[0]);
    const stockBravo = await db.select().from(s.stockEntries).where(eq(s.stockEntries.attendanceId, bravo.id));
    assert.equal(stockBravo.length, bravoProducts.length);
    assert.equal(stockBravo.find((x) => x.productId === bravoProducts[0])?.quantity, 0);

    const board = await ops.getDayBoard(scopes.gestor, { date: todayIso(), brand: null, chain: null, store: ids.store, promoter: null, city: null });
    const stop = board.stops.find((x) => x.scheduleId === ids.schedule)!;
    assert.equal(stop.bucket, "completed");
    assert.equal(stop.brandsDone, 2);
    assert.equal(board.kpis.ruptureCount, 1);
  });

  test("cenário 2: atendimento sem foto do depois não é finalizado (dados preservados)", async () => {
    const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super ABC Praça"));
    const products = await productsOf(ids.SUINCO, store.id);
    const now = new Date().toISOString();
    const att = attendancePayload({
      brandId: ids.SUINCO,
      status: "completed",
      finishedAt: now,
      photos: [photo("before")],
      stock: products.map((p) => ({ productId: p, state: "quantity" as const, quantity: 2, note: null, recordedAt: now })),
    });
    const [sch] = await db.select().from(s.schedules).where(and(eq(s.schedules.storeId, store.id), eq(s.schedules.date, todayIso()), eq(s.schedules.status, "active")));
    const visit = visitPayload({ storeId: store.id, scheduleId: sch.id, attendances: [att] });
    const [res] = await promoter.applySync(scopes.lucas, [visit]);
    assert.equal(res.ok, false);
    assert.equal(res.attendances[0].code, "invalid");
    assert.match(res.attendances[0].error ?? "", /DEPOIS/);
    const [saved] = await db.select().from(s.attendances).where(eq(s.attendances.id, att.id));
    assert.equal(saved.status, "in_progress");
    const stock = await db.select().from(s.stockEntries).where(eq(s.stockEntries.attendanceId, att.id));
    assert.equal(stock.length, products.length, "o que foi preenchido não se perde");
    ids.praçaVisit = visit.id;
    ids.praçaAtt = att.id;

    // Encerrar a visita com marca em andamento é recusado.
    const close = await promoter.applySync(scopes.lucas, [{ ...visit, status: "completed", finishedAt: now, attendances: [] }]);
    assert.equal(close[0].closeRejected, true);
  });

  test("cenário 3: reenvio após queda de conexão não duplica nada; foto não enviada fica identificada", async () => {
    const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super ABC Praça"));
    const products = await productsOf(ids.FOFINHO, store.id);
    const now = new Date().toISOString();
    const after = photo("after");
    const att = attendancePayload({
      brandId: ids.FOFINHO,
      status: "completed",
      finishedAt: now,
      photos: [photo("before"), after],
      stock: products.map((p) => ({ productId: p, state: "not_found" as const, quantity: null, note: null, recordedAt: now })),
    });
    const [sch] = await db.select().from(s.schedules).where(and(eq(s.schedules.storeId, store.id), eq(s.schedules.date, todayIso())));
    const visit = visitPayload({ id: ids.praçaVisit, storeId: store.id, scheduleId: sch.id, attendances: [att] });
    const first = await promoter.applySync(scopes.lucas, [visit]);
    const second = await promoter.applySync(scopes.lucas, [visit]);
    assert.ok(first[0].attendances[0].ok);
    // No reenvio o atendimento já está concluído no servidor: fica bloqueado, sem duplicar.
    assert.equal(second[0].attendances[0].code, "locked");
    const count = await db.select({ n: sql<number>`count(*)::int` }).from(s.attendances).where(eq(s.attendances.visitId, ids.praçaVisit));
    assert.equal(count[0].n, 2);
    const [{ n: photos }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.photos).where(eq(s.photos.attendanceId, att.id));
    assert.equal(photos, 2);
    const [p] = await db.select().from(s.photos).where(eq(s.photos.id, after.id));
    assert.equal(p.uploadedAt, null, "declarada pelo aparelho, arquivo ainda não chegou");
    const board = await ops.getDayBoard(scopes.gestor, { date: todayIso(), brand: null, chain: null, store: store.id, promoter: null, city: null });
    assert.ok(board.stops[0].attendances.some((a) => a.pendingUploads > 0));
  });

  test("cenário 4: ruptura não é duplicada para o mesmo produto no atendimento", async () => {
    const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super ABC Praça"));
    const products = await productsOf(ids.SUINCO, store.id);
    const now = new Date().toISOString();
    const dup = { productId: products[1], situation: "unconfirmed" as const, knownStock: null, note: null, fromStockSuggestion: true, recordedAt: now };
    const att = attendancePayload({
      id: ids.praçaAtt,
      brandId: ids.SUINCO,
      stock: products.map((p, i) => ({ productId: p, state: i === 1 ? ("zero" as const) : ("quantity" as const), quantity: i === 1 ? 0 : 2, note: null, recordedAt: now })),
      ruptures: [{ id: randomUUID(), ...dup }],
    });
    const visit = visitPayload({ id: ids.praçaVisit, storeId: store.id, scheduleId: null, attendances: [att] });
    const [sch] = await db.select().from(s.schedules).where(and(eq(s.schedules.storeId, store.id), eq(s.schedules.date, todayIso())));
    visit.scheduleId = sch.id;
    await promoter.applySync(scopes.lucas, [visit]);
    // Outro aparelho (ou novo toque) manda ruptura com outro id para o mesmo produto.
    await promoter.applySync(scopes.lucas, [{ ...visit, attendances: [{ ...att, ruptures: [{ id: randomUUID(), ...dup }] }] }]);
    const rows = await db.select().from(s.ruptures).where(and(eq(s.ruptures.attendanceId, ids.praçaAtt), eq(s.ruptures.productId, products[1]), isNull(s.ruptures.deletedAt)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].situation, "unconfirmed", "situação não confirmada não vira ruptura confirmada");
  });

  test("cenário 5: isolamento — outro promotor e outra marca não acessam os registros", async () => {
    // Freelancer tenta gravar na visita do Lucas trocando o id.
    const forged = visitPayload({ id: ids.visit, storeId: ids.store, attendances: [] });
    const [res] = await promoter.applySync(scopes.ana, [forged]);
    assert.equal(res.ok, false);
    assert.equal(res.code, "forbidden");
    // Loja não autorizada.
    const [other] = await db.select().from(s.stores).where(eq(s.stores.name, "Verdemar Sion"));
    const [res2] = await promoter.applySync(scopes.lucas, [visitPayload({ storeId: other.id, origin: "extra", extraReason: "tentativa", attendances: [] })]);
    assert.equal(res2.code, "forbidden");
    // Gestor restrito à Bravo não vê atendimento da Fofinho, só o da Bravo.
    assert.equal(await details.getAttendanceDetail(scopes.bravo, ids.fofAtt), null);
    assert.ok(await details.getAttendanceDetail(scopes.bravo, ids.bravoAtt));
    const v = await details.getVisitDetail(scopes.bravo, ids.visit);
    assert.deepEqual(v!.attendances.map((a) => a.a.brandId), [ids.BRAVO]);
    // Bootstrap da freelancer não contém lojas nem visitas do Lucas.
    const boot = await promoter.buildBootstrap(scopes.ana);
    assert.ok(!boot.stores.some((x) => x.id === ids.store));
    assert.ok(!boot.visits.some((x) => x.id === ids.visit));
  });

  test("cenário 6: indicadores e listas usam os mesmos registros e somam o total", async () => {
    const f = { date: todayIso(), brand: null, chain: null, store: null, promoter: null, city: null };
    const board = await ops.getDayBoard(scopes.gestor, f);
    const sum = Object.values(board.buckets).reduce((a, b) => a + b, 0);
    assert.equal(sum, board.stops.length);
    assert.equal(board.kpis.storesScheduled, board.stops.filter((x) => x.scheduleId).length);
    const byBrand = await ops.getDayBoard(scopes.gestor, { ...f, brand: ids.DONACLARA });
    assert.ok(byBrand.stops.every((st) => st.plannedBrands.some((b) => b.id === ids.DONACLARA)));
    const byPromoter = await ops.getDayBoard(scopes.gestor, { ...f, promoter: scopes.lucas.userId });
    assert.ok(byPromoter.stops.length > 0 && byPromoter.stops.every((st) => st.promoterId === scopes.lucas.userId));
    const restricted = await ops.getDayBoard(scopes.bravo, f);
    assert.ok(restricted.stops.every((st) => st.plannedBrands.every((b) => b.id === ids.BRAVO)));
  });

  test("cenário 7: relatório de loja com várias marcas — cada marca com seus próprios registros", async () => {
    const blocks = await Promise.all([ids.bravoAtt, ids.fofAtt].map((a) => pdf.loadAttendanceBlock(scopes.gestor, a)));
    for (const b of blocks) {
      assert.ok(b);
      assert.ok(b!.d.stockRows.every((r) => r.product.brandId === b!.d.brand.id), "estoque de outra marca não aparece");
      assert.ok(b!.d.ruptures.every((r) => r.rupture.attendanceId === b!.d.attendance.id));
    }
    const out = await pdf.renderAttendancesPdf({ agency: { name: "Teste", logo: null }, title: "Loja", subtitle: "", blocks: blocks.filter((b) => b !== null), footer: "" });
    assert.ok(out.byteLength > 1000);
    assert.equal(Buffer.from(out).subarray(0, 4).toString(), "%PDF");
  });

  test("cenário 8: correção pedida pelo gestor preserva o original e identifica quem alterou", async () => {
    // Promotor não altera atendimento concluído.
    const now = new Date().toISOString();
    const products = await productsOf(ids.FOFINHO, ids.store);
    const edit = attendancePayload({ id: ids.fofAtt, brandId: ids.FOFINHO, status: "completed", finishedAt: now, photos: [photo("before"), photo("after")], stock: products.map((p) => ({ productId: p, state: "quantity" as const, quantity: 99, note: null, recordedAt: now })) });
    const visit = visitPayload({ id: ids.visit, storeId: ids.store, scheduleId: ids.schedule, attendances: [edit], status: "completed", finishedAt: now });
    const locked = await promoter.applySync(scopes.lucas, [visit]);
    assert.equal(locked[0].attendances[0].code, "locked");

    const short = await manager.requestCorrection(scopes.gestor, ids.fofAtt, "curto");
    assert.equal(short.ok, false);
    const req = await manager.requestCorrection(scopes.gestor, ids.fofAtt, "Refazer a foto do depois mostrando a gôndola inteira");
    assert.ok(req.ok);
    const [c] = await db.select().from(s.correctionRequests).where(eq(s.correctionRequests.attendanceId, ids.fofAtt));
    assert.equal(c.status, "open");
    assert.ok((c.snapshot as { stock: unknown[] }).stock.length > 0, "registro original guardado");
    // Bootstrap leva o pedido ao aparelho do promotor.
    const boot = await promoter.buildBootstrap(scopes.lucas);
    assert.equal(boot.visits.find((v) => v.id === ids.visit)?.attendances.find((a) => a.id === ids.fofAtt)?.correction?.id, c.id);

    const fixed = await promoter.applySync(scopes.lucas, [visit]);
    assert.ok(fixed[0].attendances[0].ok, JSON.stringify(fixed));
    const [after] = await db.select().from(s.correctionRequests).where(eq(s.correctionRequests.id, c.id));
    assert.equal(after.status, "answered");
    assert.equal(after.answeredBy, scopes.lucas.userId);
    const [a] = await db.select().from(s.attendances).where(eq(s.attendances.id, ids.fofAtt));
    assert.equal(a.status, "completed");
    const logs = await db.select().from(s.auditLogs).where(and(eq(s.auditLogs.entity, "attendance"), eq(s.auditLogs.entityId, ids.fofAtt)));
    assert.ok(logs.some((l) => l.action === "correction_requested" && l.userId === scopes.gestor.userId));
    assert.ok(logs.some((l) => l.action === "correction_answered" && l.userId === scopes.lucas.userId));
  });

  test("ruptura: status final exige ação; histórico registra responsável", async () => {
    const noAction = await manager.updateRuptureStatus(scopes.gestor, ids.rupture, "resolved", "", null);
    assert.equal(noAction.ok, false);
    const ok = await manager.updateRuptureStatus(scopes.gestor, ids.rupture, "resolved", "Reposição feita pelo comprador", null);
    assert.ok(ok.ok);
    const events = await db.select().from(s.ruptureEvents).where(eq(s.ruptureEvents.ruptureId, ids.rupture));
    assert.ok(events.some((e) => e.toStatus === "resolved" && e.userId === scopes.gestor.userId));
    const outOfScope = await manager.updateRuptureStatus(scopes.bravo, ids.rupture, "analysis", "x", null);
    assert.ok(outOfScope.ok, "gestor da Bravo pode tratar ruptura da Bravo");
  });

  test("uma visita aberta por vez e programação sem duplicidade", async () => {
    // João já tem uma visita em andamento (dados de demonstração).
    const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super BH Formiga"));
    const [sch] = await db.select().from(s.schedules).where(and(eq(s.schedules.storeId, store.id), eq(s.schedules.date, todayIso())));
    const [res] = await promoter.applySync(scopes.joao, [visitPayload({ storeId: store.id, scheduleId: sch.id, attendances: [], startedAt: new Date().toISOString() })]);
    assert.equal(res.code, "conflict");
    // Segunda visita para a mesma programação (outro aparelho) é recusada.
    const [dup] = await promoter.applySync(scopes.lucas, [visitPayload({ storeId: ids.store, scheduleId: ids.schedule, attendances: [] })]);
    assert.equal(dup.code, "conflict");
    // Mesma loja duas vezes no mesmo dia para o mesmo promotor é recusada.
    const again = await schedules.createSchedule(scopes.gestor, { promoterId: scopes.lucas.userId, storeId: ids.store, date: todayIso(), plannedStart: null, brandIds: [], notes: null });
    assert.equal(again.ok, false);
  });

  test("desativar usuário preserva o histórico e encerra o acesso", async () => {
    const admin = await import("../src/server/admin");
    const [ana] = await db.select().from(s.users).where(eq(s.users.username, "ana"));
    const visitsBefore = await db.select({ n: sql<number>`count(*)::int` }).from(s.visits).where(eq(s.visits.promoterId, ana.id));
    const r = await admin.saveUser(scopes.admin, { id: ana.id, role: "promoter", name: ana.name, username: ana.username, email: null, phone: null, internalCode: null, employment: "freelancer", region: null, managerId: ana.managerId, status: "inactive", allBrands: true, teamOnly: false, brandIds: [], storeIds: [], password: null });
    assert.ok(r.ok);
    const [after] = await db.select().from(s.users).where(eq(s.users.id, ana.id));
    assert.equal(after.status, "inactive");
    assert.ok(after.sessionVersion > ana.sessionVersion, "sessões abertas derrubadas");
    const visitsAfter = await db.select({ n: sql<number>`count(*)::int` }).from(s.visits).where(eq(s.visits.promoterId, ana.id));
    assert.equal(visitsAfter[0].n, visitsBefore[0].n);
    const dupProduct = await admin.saveProduct(scopes.admin, { id: null, brandId: ids.BRAVO, name: "CAFE BRAVO TRADICIONAL 500G", sku: "NOVO-1", ean: null, category: null, variant: null, package: null, unit: "pct", status: "active" });
    assert.equal(dupProduct.ok, false, "duplicata por grafia diferente é bloqueada");
  });
});
