/**
 * Carteira com meta semanal (ETROS): o promotor escolhe o dia; o que vale é
 * cumprir as visitas da semana em cada marca de cada loja.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import type { AttendanceInput, VisitInput } from "../src/lib/sync-types";
import { todayIso } from "../src/lib/dates";
import { expectedByToday, targetStatus, weekEnd, weekStart, weekTotals } from "../src/lib/portfolio";

let db: DB;
let auth: typeof import("../src/server/auth");
let promoter: typeof import("../src/server/promoter");
let portfolio: typeof import("../src/server/portfolio");

async function scopeOf(username: string): Promise<Scope> {
  const [u] = await db.select().from(s.users).where(eq(s.users.username, username));
  return auth.scopeForUser(u);
}

const photo = (kind: "before" | "after") => ({ id: randomUUID(), kind, ruptureId: null, occurrenceId: null, validityId: null, damageId: null, source: "camera" as const, takenAt: new Date().toISOString() });

function visit(storeId: string, attendances: AttendanceInput[], over: Partial<VisitInput> = {}): VisitInput {
  const now = new Date().toISOString();
  return { id: randomUUID(), scheduleId: null, storeId, visitDate: todayIso(), origin: "portfolio", extraReason: null, status: "in_progress", closeReason: null, startedAt: now, finishedAt: null, geo: null, notes: null, attendances, ...over };
}

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  promoter = await import("../src/server/promoter");
  portfolio = await import("../src/server/portfolio");
});

describe("carteira com meta semanal", () => {
  test("semana de segunda a domingo e ritmo esperado", () => {
    assert.equal(weekStart("2026-10-14"), "2026-10-12"); // quarta → segunda
    assert.equal(weekStart("2026-10-18"), "2026-10-12"); // domingo → mesma semana
    assert.equal(weekEnd("2026-10-12"), "2026-10-18");
    assert.equal(expectedByToday(2, "2026-10-12"), 0); // segunda: nada atrasado ainda
    assert.equal(expectedByToday(2, "2026-10-15"), 1); // quinta: 1 de 2
    assert.equal(expectedByToday(2, "2026-10-18"), 2); // domingo: tudo
    assert.equal(targetStatus(2, 0, "2026-10-15"), "behind");
    assert.equal(targetStatus(2, 1, "2026-10-15"), "on_track");
    assert.equal(targetStatus(2, 3, "2026-10-15"), "done");
    // Visita a mais numa loja não compensa a falta em outra.
    assert.deepEqual(weekTotals([{ perWeek: 2, done: 4 }, { perWeek: 1, done: 0 }], "2026-10-18"), { target: 3, done: 4, counted: 2, expected: 3 });
  });

  test("ETROS: promotora recebe a carteira (e não um roteiro) no app", async () => {
    const carla = await scopeOf("carla");
    assert.equal(carla.settings.defaultWorkMode, "portfolio");
    const boot = await promoter.buildBootstrap(carla);
    assert.equal(boot.workMode, "portfolio");
    assert.equal(boot.portfolio?.weekStart, weekStart(todayIso()));
    assert.deepEqual(boot.portfolio?.targets.map((t) => t.perWeek).sort(), [1, 2]);
    assert.ok(boot.portfolio?.targets.every((t) => t.doneAttendanceIds.length === 0));
    // AF segue no roteiro.
    const joao = await promoter.buildBootstrap(await scopeOf("joao"));
    assert.equal(joao.workMode, "route");
    assert.equal(joao.portfolio, null);
  });

  test("visita da carteira entra sem justificativa e conta na meta da semana", async () => {
    const carla = await scopeOf("carla");
    const boot = await promoter.buildBootstrap(carla);
    const target = boot.portfolio!.targets.find((t) => t.perWeek === 2)!;
    const products = boot.products.filter((p) => p.brandId === target.brandId);
    const now = new Date().toISOString();
    const att: AttendanceInput = {
      id: randomUUID(),
      brandId: target.brandId,
      status: "completed",
      startedAt: now,
      finishedAt: now,
      activitiesDone: [],
      notes: null,
      exceptionItems: [],
      exceptionReason: null,
      exceptionNote: null,
      cancelReason: null,
      photos: [photo("before"), photo("after")],
      deletedPhotoIds: [],
      stock: products.map((p) => ({ productId: p.id, state: "quantity" as const, quantity: 4, unit: "un" as const, note: null, recordedAt: now })),
      clearedStockProductIds: [],
      unregistered: [],
      deletedUnregisteredIds: [],
      ruptures: [],
      deletedRuptureIds: [],
      validities: [],
      deletedValidityIds: [],
      damages: [],
      deletedDamageIds: [],
      occurrences: [],
      deletedOccurrenceIds: [],
    };
    const [res] = await promoter.applySync(carla, [visit(target.storeId, [att])]);
    assert.ok(res.ok, JSON.stringify(res));
    const [row] = await db.select().from(s.visits).where(eq(s.visits.storeId, target.storeId));
    assert.equal(row.origin, "portfolio");
    assert.equal(row.extraReason, null);

    const after = await promoter.buildBootstrap(carla);
    assert.deepEqual(after.portfolio!.targets.find((t) => t.storeId === target.storeId)!.doneAttendanceIds, [att.id]);

    const week = await portfolio.portfolioWeek(await scopeOf("etros"), { date: todayIso(), promoter: null, brand: null, store: null, city: null });
    const r = week.rows.find((x) => x.storeId === target.storeId)!;
    assert.equal(r.done, 1);
    assert.equal(week.totals.target, 3);
    assert.equal(week.totals.counted, 1);
  });

  test("promotor de roteiro não abre visita de carteira", async () => {
    const lucas = await scopeOf("lucas");
    const boot = await promoter.buildBootstrap(lucas);
    const [res] = await promoter.applySync(lucas, [visit(boot.stores[0].id, [])]);
    assert.equal(res.ok, false);
  });

  test("gestor cadastra meta; ela autoriza loja e marca ao promotor", async () => {
    const etros = await scopeOf("etros");
    const [carla] = await db.select().from(s.users).where(eq(s.users.username, "carla"));
    const [target] = await db.select().from(s.visitTargets).where(eq(s.visitTargets.promoterId, carla.id)).limit(1);
    const upd = await portfolio.saveTarget(etros, { promoterId: carla.id, storeId: target.storeId, brandId: target.brandId, perWeek: 3 });
    assert.ok(upd.ok);
    const [again] = await db.select().from(s.visitTargets).where(eq(s.visitTargets.id, target.id));
    assert.equal(again.perWeek, 3, "mesma combinação atualiza, não duplica");
    const bad = await portfolio.saveTarget(etros, { promoterId: carla.id, storeId: target.storeId, brandId: target.brandId, perWeek: 0 });
    assert.equal(bad.ok, false);
    // Gestor da AF não mexe em meta da ETROS.
    const af = await scopeOf("admin");
    const cross = await portfolio.saveTarget(af, { promoterId: carla.id, storeId: target.storeId, brandId: target.brandId, perWeek: 2 });
    assert.equal(cross.ok, false);
  });
});
