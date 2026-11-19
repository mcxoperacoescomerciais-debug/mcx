/**
 * Visita aberta por engano (loja errada) e encerrada pelo promotor: o gestor
 * desfaz no painel, o celular recebe a visita como cancelada (a loja volta a
 * pendente) e o promotor consegue abrir a visita de novo na mesma programação.
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

let db: DB;
let lucas: Scope;
let admin: Scope;
let promoter: typeof import("../src/server/promoter");
let manager: typeof import("../src/server/manager");

function att(brandId: string, over: Partial<AttendanceInput> = {}): AttendanceInput {
  const now = new Date().toISOString();
  return {
    id: randomUUID(), brandId, status: "cancelled", startedAt: now, finishedAt: now, activitiesDone: [], answers: [], notes: null,
    exceptionItems: [], exceptionReason: null, exceptionNote: null, cancelReason: "Loja errada, aberta por engano", photos: [], deletedPhotoIds: [],
    stock: [], clearedStockProductIds: [], unregistered: [], deletedUnregisteredIds: [], ruptures: [], deletedRuptureIds: [], validities: [],
    deletedValidityIds: [], damages: [], deletedDamageIds: [], occurrences: [], deletedOccurrenceIds: [], ...over,
  };
}

function visitOf(storeId: string, scheduleId: string, atts: AttendanceInput[], status: VisitInput["status"] = "closed_incomplete"): VisitInput {
  return {
    id: randomUUID(), storeId, scheduleId, visitDate: todayIso(), origin: "scheduled", extraReason: null, status,
    closeReason: status === "closed_incomplete" ? "Loja errada, aberta por engano" : null,
    startedAt: new Date(Date.now() - 600_000).toISOString(), finishedAt: status === "in_progress" ? null : new Date().toISOString(),
    geo: { status: "captured", lat: -20.1, lng: -44.9, accuracy: 15 }, notes: null, attendances: atts,
  };
}

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  promoter = await import("../src/server/promoter");
  manager = await import("../src/server/manager");
  lucas = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, "lucas")))[0]);
  const managers = await db.select().from(s.users).where(eq(s.users.agencyId, lucas.agencyId));
  const m = managers.find((u) => u.role !== "promoter")!;
  admin = await auth.scopeForUser(m);
});

describe("desfazer visita aberta por engano", () => {
  test("gestor desfaz, o app recebe a visita cancelada e o promotor reabre a loja", async () => {
    const boot = await promoter.buildBootstrap(lucas);
    const sch = boot.schedules.find((x) => x.date === todayIso() && x.brandIds.length);
    assert.ok(sch, "precisa de programação hoje no seed");
    const wrong = visitOf(sch.storeId, sch.id, [att(sch.brandIds[0])]);
    const [r] = await promoter.applySync(lucas, [wrong]);
    assert.ok(r.ok, JSON.stringify(r));

    const res = await manager.undoMistakenVisit(admin, wrong.id, "Promotor abriu a loja errada");
    assert.ok(res.ok, JSON.stringify(res));
    const [row] = await db.select().from(s.visits).where(eq(s.visits.id, wrong.id));
    assert.equal(row.status, "cancelled");

    const again = await promoter.buildBootstrap(lucas);
    assert.equal(again.visits.find((v) => v.id === wrong.id)?.status, "cancelled", "o celular precisa saber que foi desfeita");

    const [reopened] = await promoter.applySync(lucas, [visitOf(sch.storeId, sch.id, [], "in_progress")]);
    assert.ok(reopened.ok, JSON.stringify(reopened));
  });

  test("não desfaz visita com marca concluída nem pelo promotor", async () => {
    const boot = await promoter.buildBootstrap(lucas);
    const open = boot.visits.find((v) => v.status === "in_progress");
    assert.ok(open);
    assert.equal((await manager.undoMistakenVisit(admin, open.id, "teste de bloqueio")).ok, false, "visita aberta não se desfaz pelo painel");
    assert.equal((await manager.undoMistakenVisit(lucas, open.id, "teste de bloqueio")).ok, false, "promotor não tem permissão");
    const [done] = await db.select().from(s.attendances).where(eq(s.attendances.status, "completed")).limit(1);
    if (done) assert.equal((await manager.undoMistakenVisit(admin, done.visitId, "teste de bloqueio")).ok, false);
  });
});
