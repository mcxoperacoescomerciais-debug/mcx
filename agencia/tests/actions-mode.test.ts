/**
 * Modo ações (agências de degustação e ativação): regras puras, a demonstração
 * carregada num banco em memória (respeita todas as restrições do banco), o painel,
 * o relatório para a marca e o resultado enviado pelo app da promotora.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope, SessionUser } from "../src/server/auth";
import type { AttendanceInput, VisitInput } from "../src/lib/sync-types";
import { conversion, outcomeComplete, photosComplete, readOutcome, termsFor } from "../src/lib/actions";
import { attendanceMissing } from "../src/lib/rules";
import { hiddenPanels, mergeSettings } from "../src/lib/settings";
import { countedRevenue, statusLabelFor, voidStatus } from "../src/lib/tasting";
import { todayIso } from "../src/lib/dates";

describe("modo ações · regras", () => {
  test("resultado da ação: leitura, conversão e completo", () => {
    assert.deepEqual(readOutcome({ approached: 120.4, samples: 98, unitsSold: 14, acceptance: 9 }), { approached: 120, samples: 98, unitsSold: 14, acceptance: 5 });
    assert.deepEqual(readOutcome({ approached: -3, samples: "x", unitsSold: null, acceptance: 0 }), { approached: null, samples: null, unitsSold: null, acceptance: null });
    assert.equal(readOutcome(null), null);
    assert.equal(conversion(15, 100), 0.15);
    assert.equal(conversion(3, 0), null);
    assert.equal(outcomeComplete({ approached: 10, samples: 8, unitsSold: 0, acceptance: 4 }), true);
    assert.equal(outcomeComplete({ approached: 10, samples: null, unitsSold: 0, acceptance: 4 }), false);
    assert.equal(photosComplete(["before", "after", "closing"]), true);
    assert.equal(photosComplete(["before", "after"]), false);
  });

  test("finalizar a ação exige foto do encerramento e o resultado; promotoria não muda", () => {
    const brand = { minBeforePhotos: 1, minAfterPhotos: 1 } as never;
    const base = { brand, beforePhotos: 1, afterPhotos: 1, trackedProductIds: [], stock: {}, damages: [], exceptionItems: [], exceptionReason: null, exceptionNote: null, allowExceptions: false };
    assert.deepEqual(attendanceMissing(base).map((m) => m.kind), []);
    assert.deepEqual(attendanceMissing({ ...base, action: { closingPhotos: 0, outcomeComplete: false } }).map((m) => m.kind), ["closing_photo", "action_result"]);
    assert.deepEqual(attendanceMissing({ ...base, action: { closingPhotos: 1, outcomeComplete: true } }).map((m) => m.kind), []);
  });

  test("recurso ações vem desligado; agência atual não muda; sem ações o painel de ações some", () => {
    const st = mergeSettings({});
    assert.equal(st.modules.actions, false);
    assert.equal(st.demo, false);
    assert.ok(hiddenPanels(st).includes("acoes"));
    assert.ok(!hiddenPanels(mergeSettings({ modules: { actions: true } })).includes("acoes"));
    assert.equal(termsFor(true).promoter, "Promotora");
    assert.equal(termsFor(false).store, "Loja");
  });

  test("não realizada conta como cancelada no financeiro", () => {
    assert.equal(voidStatus("not_done"), true);
    assert.equal(countedRevenue("not_done", 400, null), 0);
    assert.equal(countedRevenue("not_done", 400, 150), 150);
    assert.equal(countedRevenue("completed", 400, null), 400);
    assert.equal(statusLabelFor(true).completed, "Realizada");
    assert.equal(statusLabelFor(false).completed, "Concluída");
  });
});

describe("modo ações · demonstração no banco", () => {
  let db: DB;
  let mcx: SessionUser;
  let agencyId: string;
  let scope: Scope;
  let auth: typeof import("../src/server/auth");

  before(async () => {
    db = await memDb();
    auth = await import("../src/server/auth");
    const [u] = await db.select().from(s.users).where(eq(s.users.platform, true)).limit(1);
    mcx = { ...u, platform: true, platformRole: "owner", agencyStatus: "active" } as unknown as SessionUser;
    const [etros] = await db.select().from(s.agencies).where(eq(s.agencies.slug, "etros"));
    agencyId = etros.id;
  });

  test("carrega a agência fictícia, mantém o administrador e liga o modo ações", async () => {
    const { seedActionsDemo } = await import("../src/server/actions-demo");
    const admins = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.agencyId, agencyId), eq(s.users.role, "admin")));
    assert.ok(admins.length);
    const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, agencyId));
    assert.equal((await seedActionsDemo({ ...mcx, platform: false }, agencyId, agency.name)).ok, false);
    assert.equal((await seedActionsDemo(mcx, agencyId, "outro nome")).ok, false);
    const r = await seedActionsDemo(mcx, agencyId, agency.name);
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const keptAdmins = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.agencyId, agencyId), eq(s.users.role, "admin")));
    assert.deepEqual(keptAdmins.map((x) => x.id).sort(), admins.map((x) => x.id).sort());
    const brands = await db.select().from(s.brands).where(eq(s.brands.agencyId, agencyId));
    assert.deepEqual(brands.map((b) => b.code).sort(), ["CAFE", "TROPISABOR", "VALEBONITO"]);
    const stores = await db.select().from(s.stores).where(eq(s.stores.agencyId, agencyId));
    assert.equal(stores.length, 18);
    assert.deepEqual([...new Set(stores.map((x) => x.city))].sort(), ["Araguari", "Uberaba", "Uberlândia"]);
    const promoters = await db.select().from(s.users).where(and(eq(s.users.agencyId, agencyId), eq(s.users.role, "promoter")));
    assert.equal(promoters.length, 9);
    const closing = (await db.select({ id: s.photos.id }).from(s.photos).where(and(eq(s.photos.agencyId, agencyId), eq(s.photos.kind, "closing")))).length;
    assert.ok(closing > 50, `fotos de encerramento: ${closing}`);
    const settings = mergeSettings(((await db.select().from(s.agencies).where(eq(s.agencies.id, agencyId)))[0]).settings);
    assert.equal(settings.modules.actions, true);
    assert.equal(settings.modules.stock, false);
    assert.equal(settings.modules.damage, false);
    assert.equal(settings.demo, true);
    // Outra agência não foi tocada.
    const [af] = await db.select().from(s.agencies).where(eq(s.agencies.slug, "af"));
    if (af) assert.ok((await db.select().from(s.brands).where(eq(s.brands.agencyId, af.id))).length > 0);
    scope = (await auth.agencySystemScope(agencyId))!;
  });

  test("painel: números plausíveis de operação, resultado e qualidade", async () => {
    const { loadActions, summarize } = await import("../src/server/actions-data");
    const today = todayIso();
    const list = await loadActions(scope, { from: "2026-01-01", to: "2027-12-31" });
    const sum = summarize(list, today);
    assert.ok(list.length > 120, `ações: ${list.length}`);
    assert.ok(sum.operation.realized > 80);
    assert.ok(sum.operation.cancelRate! > 0.02 && sum.operation.cancelRate! < 0.25, `cancelamento ${sum.operation.cancelRate}`);
    assert.ok(sum.operation.onTime! > 0.7 && sum.operation.onTime! < 1);
    assert.ok(sum.result.conversion! > 0.06 && sum.result.conversion! < 0.3, `conversão ${sum.result.conversion}`);
    assert.ok(sum.quality.photosComplete! > 0.8);
    assert.ok(sum.quality.occurrences.length >= 3);
    assert.equal(sum.byBrand.length, 3);
    assert.equal(sum.byCity.length, 3);
    assert.equal(sum.ranking.length, 9);
    assert.ok(sum.finance.revenue > 0 && sum.finance.margin! > 0 && sum.finance.margin! < 0.8);
    assert.ok(sum.finance.perApproach! > 0);
    // Filtro por promotora e por cidade.
    const ana = sum.ranking[0];
    const one = await loadActions(scope, { from: "2026-01-01", to: "2027-12-31", city: "Araguari" });
    assert.ok(one.every((a) => a.city === "Araguari"));
    assert.ok(ana.actions > 0);
  });

  test("relatório para a marca em PDF, com galeria de fotos", async () => {
    const { loadActions, summarize } = await import("../src/server/actions-data");
    const { renderBrandReport, REPORT_BLOCKS } = await import("../src/server/pdf/brand-report-pdf");
    const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.agencyId, agencyId), eq(s.brands.code, "CAFE")));
    const actions = await loadActions(scope, { from: "2026-01-01", to: todayIso(), brand: brand.id }, { withPhotos: true });
    const pdf = await renderBrandReport({
      agency: { name: "Agência de teste", logo: null },
      brandName: brand.name,
      from: "2026-01-01",
      to: todayIso(),
      campaign: null,
      intro: "Resultado das ações.",
      blocks: new Set(REPORT_BLOCKS.map((b) => b.key)),
      actions,
      summary: summarize(actions),
      demo: true,
    });
    assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
    assert.ok(pdf.length > 50_000, `PDF ${pdf.length} bytes`);
  });

  test("app da promotora: resultado e foto do encerramento chegam ao servidor", async () => {
    const promoter = await import("../src/server/promoter");
    const [u] = await db.select().from(s.users).where(and(eq(s.users.agencyId, agencyId), eq(s.users.role, "promoter"))).limit(1);
    const ps = await auth.scopeForUser(u);
    const [link] = await db.select({ storeId: s.userStores.storeId }).from(s.userStores).where(eq(s.userStores.userId, u.id)).limit(1);
    const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.agencyId, agencyId), eq(s.brands.code, "TROPISABOR")));
    // Visitas abertas de testes anteriores não atrapalham: fecha qualquer uma da promotora.
    await db.update(s.visits).set({ status: "completed", finishedAt: new Date() }).where(and(eq(s.visits.promoterId, u.id), eq(s.visits.status, "in_progress")));
    const now = new Date().toISOString();
    const ph = (kind: "before" | "after" | "closing") => ({ id: randomUUID(), kind, ruptureId: null, occurrenceId: null, validityId: null, damageId: null, source: "camera" as const, takenAt: now });
    const att: AttendanceInput = {
      id: randomUUID(),
      brandId: brand.id,
      status: "in_progress",
      startedAt: now,
      finishedAt: null,
      activitiesDone: [],
      answers: [],
      notes: "Clientes gostaram do sabor manga.",
      exceptionItems: [],
      exceptionReason: null,
      exceptionNote: null,
      cancelReason: null,
      photos: [ph("before"), ph("after"), ph("closing")],
      deletedPhotoIds: [],
      stock: [],
      clearedStockProductIds: [],
      unregistered: [],
      deletedUnregisteredIds: [],
      ruptures: [],
      deletedRuptureIds: [],
      validities: [],
      deletedValidityIds: [],
      damages: [],
      deletedDamageIds: [],
      occurrences: [{ id: randomUUID(), category: "late", note: "Trânsito", recordedAt: now }],
      deletedOccurrenceIds: [],
      actionResult: { approached: 130, samples: 110, unitsSold: 21, acceptance: 5 },
    };
    const visit: VisitInput = {
      id: randomUUID(),
      storeId: link.storeId,
      scheduleId: null,
      visitDate: todayIso(),
      origin: "extra",
      extraReason: "Ação extra pedida pela marca",
      status: "in_progress",
      closeReason: null,
      startedAt: new Date(Date.now() - 3600_000).toISOString(),
      finishedAt: null,
      geo: { status: "captured", lat: -18.92, lng: -48.28, accuracy: 10 },
      notes: null,
      attendances: [att],
    };
    const [res] = await promoter.applySync(ps, [visit]);
    assert.ok(!("error" in res && res.error), JSON.stringify(res).slice(0, 300));
    const [saved] = await db.select().from(s.attendances).where(eq(s.attendances.id, att.id));
    assert.deepEqual(saved.actionResult, { approached: 130, samples: 110, unitsSold: 21, acceptance: 5 });
    const kinds = (await db.select({ kind: s.photos.kind }).from(s.photos).where(eq(s.photos.attendanceId, att.id))).map((p) => p.kind).sort();
    assert.deepEqual(kinds, ["after", "before", "closing"]);
    const boot = await promoter.buildBootstrap(ps);
    assert.equal(boot.settings.features?.actions, true);
    assert.equal(boot.settings.features?.stock, false);
  });
});
