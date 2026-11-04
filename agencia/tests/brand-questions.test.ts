/**
 * Perguntas de situação da marca (ex.: Ygloo — "O freezer está funcionando
 * normalmente?"): finalização exige resposta (e descrição no "Não"), a resposta
 * vai para o banco, para o aviso no WhatsApp da marca e para o relatório da marca.
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
import { attendanceMissing } from "../src/lib/rules";
import { pendingQuestions } from "../src/lib/domain";
import { todayIso } from "../src/lib/dates";

const Q = "O freezer está funcionando normalmente?";
let db: DB;
let lucas: Scope;
let brandId: string;
let storeId: string;
let promoter: typeof import("../src/server/promoter");

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

/** Visita extra com um atendimento; `close` encerra (o promotor só pode ter uma aberta). */
function visit(att: AttendanceInput, close = true, id: string = randomUUID()): VisitInput {
  return {
    id,
    storeId,
    scheduleId: null,
    visitDate: todayIso(),
    origin: "extra",
    extraReason: "Teste das perguntas da marca",
    status: close ? "completed" : "in_progress",
    closeReason: null,
    startedAt: new Date(Date.now() - 3600_000).toISOString(),
    finishedAt: close ? new Date().toISOString() : null,
    geo: { status: "captured", lat: -20.1, lng: -44.9, accuracy: 15 },
    notes: null,
    attendances: [att],
  };
}

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  promoter = await import("../src/server/promoter");
  const [u] = await db.select().from(s.users).where(eq(s.users.username, "lucas"));
  lucas = await auth.scopeForUser(u);
  const [store] = await db.select().from(s.stores).where(eq(s.stores.name, "Super BH Pio XII"));
  storeId = store.id;
  const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.code, "BRAVO"), eq(s.brands.agencyId, lucas.agencyId)));
  brandId = brand.id;
  // Marca com a pergunta do freezer e sem outras exigências, para isolar a regra.
  await db.update(s.brands).set({ questions: [Q], requireStock: false, minBeforePhotos: 0, minAfterPhotos: 0 }).where(eq(s.brands.id, brandId));
});

describe("perguntas de situação da marca", () => {
  test("regra: sem resposta ou com problema sem descrição não finaliza", () => {
    assert.deepEqual(pendingQuestions([Q], []), [Q]);
    assert.deepEqual(pendingQuestions([Q], [{ question: Q, ok: false, note: "ok" }]), [Q]);
    assert.deepEqual(pendingQuestions([Q], [{ question: Q, ok: false, note: "Freezer desligado" }]), []);
    assert.deepEqual(pendingQuestions([Q], [{ question: Q, ok: true, note: null }]), []);
    const base = { brand: { minBeforePhotos: 0, minAfterPhotos: 0, requireStock: false, rupturePhotoRequired: false }, beforePhotos: 0, afterPhotos: 0, trackedProductIds: [], stock: {}, damages: [], exceptionItems: [], exceptionReason: null, exceptionNote: null, allowExceptions: false };
    assert.equal(attendanceMissing({ ...base, questions: { items: [Q], answers: [] } })[0]?.kind, "questions");
  });

  test("o app recebe as perguntas da marca", async () => {
    const boot = await promoter.buildBootstrap(lucas);
    assert.deepEqual(boot.brands.find((b) => b.id === brandId)?.questions, [Q]);
  });

  test("servidor não finaliza sem resposta; com problema descrito grava e monta o aviso", async () => {
    const visitId = randomUUID();
    const semResposta = attendance({});
    const [r1] = await promoter.applySync(lucas, [visit(semResposta, false, visitId)]);
    assert.match(r1.attendances[0].error ?? "", /freezer/i);

    // O promotor responde e reenvia o mesmo atendimento, encerrando a visita.
    const att = { ...semResposta, answers: [{ question: Q, ok: false, note: "Freezer desligado, sorvete derretendo" }] };
    const [r2] = await promoter.applySync(lucas, [visit(att, true, visitId)]);
    assert.ok(r2.attendances[0].ok, JSON.stringify(r2));
    const [row] = await db.select({ status: s.attendances.status, answers: s.attendances.answers }).from(s.attendances).where(eq(s.attendances.id, att.id));
    assert.equal(row.status, "completed");
    assert.deepEqual(row.answers, [{ question: Q, ok: false, note: "Freezer desligado, sorvete derretendo" }]);

    const { buildQuestionMessage } = await import("../src/server/whatsapp-alert");
    const msg = await buildQuestionMessage(lucas, att.id, "00000000-0000-0000-0000-000000000000");
    assert.ok(msg);
    assert.ok(msg!.text.includes(Q));
    assert.ok(msg!.text.includes("Freezer desligado, sorvete derretendo"));
    assert.ok(msg!.text.includes("/r/00000000-0000-0000-0000-000000000000"));
  });

  test("resposta Sim não gera aviso e entra no relatório da marca", async () => {
    const att = attendance({ answers: [{ question: Q, ok: true, note: "texto ignorado" }] });
    const [r] = await promoter.applySync(lucas, [visit(att)]);
    assert.ok(r.attendances[0].ok, JSON.stringify(r));
    const { buildQuestionMessage } = await import("../src/server/whatsapp-alert");
    assert.equal(await buildQuestionMessage(lucas, att.id, "00000000-0000-0000-0000-000000000000"), null);

    const { brandReport } = await import("../src/server/reports");
    const today = todayIso();
    const rep = await brandReport(lucas, { brand: brandId, from: today, to: today } as never);
    assert.deepEqual(rep.questionSummary, [{ question: Q, ok: 1, problems: 1 }]);
    assert.ok(rep.answers.some((x) => !x.ok && x.note === "Freezer desligado, sorvete derretendo"));
    assert.ok(rep.answers.some((x) => x.ok && x.note === null));
  });

  test("carga da Ygloo: cria uma vez na AF e não recria", async () => {
    const { yglooBrand } = await import("../scripts/setup-data");
    await yglooBrand();
    await yglooBrand();
    const rows = await db.select().from(s.brands).where(eq(s.brands.code, "YGLOO"));
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].questions, [Q]);
    assert.deepEqual(rows[0].activities, ["Freezer limpo e organizado"]);
    const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, rows[0].agencyId));
    assert.equal(agency.name, "AF Merchandising");
  });
});
