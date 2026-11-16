/**
 * Link do relatório completo na mensagem que o promotor manda no grupo da
 * indústria: o código nasce no celular ao finalizar, chega com o atendimento e
 * abre o PDF sem login (/r/<código>). Antes de chegar, o link ainda não abre.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import type { AttendanceInput, VisitInput } from "../src/lib/sync-types";
import { todayIso } from "../src/lib/dates";
import { visitReportText } from "../src/app/app/_lib/visit-report";
import type { LocalVisit } from "../src/app/app/_lib/local-store";
import type { BootstrapBrand, BootstrapProduct, BootstrapStore } from "../src/lib/sync-types";

let db: DB;
let lucas: Scope;
let brandId: string;
let storeId: string;
let promoter: typeof import("../src/server/promoter");
let alerts: typeof import("../src/server/whatsapp-alert");

function attendance(over: Partial<AttendanceInput>): AttendanceInput {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    brandId,
    status: "completed",
    startedAt: now,
    finishedAt: now,
    activitiesDone: [],
    answers: [],
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
    validities: [],
    deletedValidityIds: [],
    damages: [],
    deletedDamageIds: [],
    occurrences: [],
    deletedOccurrenceIds: [],
    ...over,
  };
}

function visit(att: AttendanceInput): VisitInput {
  return {
    id: randomUUID(),
    storeId,
    scheduleId: null,
    visitDate: todayIso(),
    origin: "extra",
    extraReason: "Teste do link do relatório",
    status: "completed",
    closeReason: null,
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    finishedAt: new Date().toISOString(),
    geo: { status: "captured", lat: -20.1, lng: -44.9, accuracy: 15 },
    notes: null,
    attendances: [att],
  };
}

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  promoter = await import("../src/server/promoter");
  alerts = await import("../src/server/whatsapp-alert");
  const [u] = await db.select().from(s.users).where(eq(s.users.username, "lucas"));
  lucas = await auth.scopeForUser(u);
  const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super BH Pio XII"));
  storeId = store.id;
  const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.code, "BRAVO"), eq(s.brands.agencyId, lucas.agencyId)));
  brandId = brand.id;
  await db.update(s.brands).set({ questions: [], requireStock: false, minBeforePhotos: 0, minAfterPhotos: 0 }).where(eq(s.brands.id, brandId));
});

describe("link do relatório na mensagem do grupo", () => {
  test("o texto termina com o link do relatório completo", () => {
    const v = { id: "v1", storeId: "s1", visitDate: "2026-11-16", notes: "", attendances: { a1: { id: "a1", brandId: "b1", status: "completed", ruptures: {}, validities: {} } } } as unknown as LocalVisit;
    const ctx = {
      agency: "AF",
      promoter: "Tales",
      store: { id: "s1", name: "ABC Paraná", city: "Divinópolis" } as BootstrapStore,
      brandById: new Map([["b1", { id: "b1", name: "Suinco" } as BootstrapBrand]]),
      productById: new Map<string, BootstrapProduct>(),
      attendanceId: "a1",
    };
    const text = visitReportText(v, { ...ctx, reportUrl: "https://mcx-campo.onrender.com/r/abc" });
    assert.ok(text.trimEnd().endsWith("Relatório completo (com fotos):* https://mcx-campo.onrender.com/r/abc"));
    assert.doesNotMatch(visitReportText(v, ctx), /Relatório completo/);
  });

  test("antes de o atendimento chegar o link não abre; depois abre o atendimento certo", async () => {
    const linkId = randomUUID();
    assert.equal(await alerts.resolveAlertLink(linkId), null);
    const att = attendance({ reportLinkId: linkId });
    const [r] = await promoter.applySync(lucas, [visit(att)]);
    assert.ok(r.attendances[0].ok, JSON.stringify(r));
    assert.deepEqual(await alerts.resolveAlertLink(linkId), { agencyId: lucas.agencyId, attendanceId: att.id });
  });

  test("o mesmo código não serve a dois atendimentos; atendimento sem código continua sem link", async () => {
    const linkId = randomUUID();
    const first = attendance({ reportLinkId: linkId });
    await promoter.applySync(lucas, [visit(first)]);
    const second = attendance({ reportLinkId: linkId });
    const [r] = await promoter.applySync(lucas, [visit(second)]);
    assert.ok(r.attendances[0].ok, JSON.stringify(r));
    assert.equal((await alerts.resolveAlertLink(linkId))?.attendanceId, first.id);
    const plain = attendance({});
    await promoter.applySync(lucas, [visit(plain)]);
    const [row] = await db.select({ link: s.attendances.reportLinkId }).from(s.attendances).where(eq(s.attendances.id, plain.id));
    assert.equal(row.link, null);
  });

  test("atendimento em andamento não grava o código", async () => {
    const att = attendance({ status: "in_progress", finishedAt: null, reportLinkId: randomUUID() });
    const v = { ...visit(att), status: "in_progress" as const, finishedAt: null };
    await promoter.applySync(lucas, [v]);
    const [row] = await db.select({ link: s.attendances.reportLinkId }).from(s.attendances).where(eq(s.attendances.id, att.id));
    assert.equal(row.link, null);
  });
});
