/** Regras de negócio puras (rodam no celular e no servidor). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceMissing, isRelevantDivergence, matchesQuery, openAttendances, pct, pendingBrandsForClose, productNameKey, stopBucket, storedQuantity, suggestsRupture, validateStock } from "../src/lib/rules";
import { mergeSettings, DEFAULT_SETTINGS } from "../src/lib/settings";
import { addDays, isIsoDate, todayIso, weekdayOf } from "../src/lib/dates";
import { parseFilters } from "../src/lib/filters";

test("produto: grafias diferentes geram a mesma chave de duplicidade", () => {
  assert.equal(productNameKey("Café Tradicional 500 g"), productNameKey("CAFE TRADICIONAL 500G"));
  assert.equal(productNameKey("Café Tradicional 500 g"), productNameKey("cafe  tradicional 500gr"));
  assert.equal(productNameKey("Linguiça 2,5 kg"), productNameKey("LINGUICA 2,5KG"));
  assert.notEqual(productNameKey("Café Tradicional 500 g"), productNameKey("Café Tradicional 250 g"));
});

test("busca tolerante: prefixos sem acento", () => {
  assert.ok(matchesQuery("Café Bravo Tradicional 500 g", "caf trad"));
  assert.ok(!matchesQuery("Café Bravo Tradicional 500 g", "extraforte"));
});

test("estoque: vazio nunca vira zero; estados coerentes", () => {
  assert.equal(validateStock("quantity", null), "Informe a quantidade encontrada.");
  assert.match(validateStock("quantity", 0) ?? "", /Estoque zero/);
  assert.equal(validateStock("quantity", 12), null);
  assert.equal(validateStock("zero", 0), null);
  assert.ok(validateStock("not_found", 3));
  assert.equal(storedQuantity("zero", null), 0);
  assert.equal(storedQuantity("not_found", 5), null);
  assert.equal(storedQuantity("not_applicable", null), null);
  assert.ok(suggestsRupture("zero") && suggestsRupture("not_found"));
  assert.ok(!suggestsRupture("quantity") && !suggestsRupture(undefined));
});

test("divergência entre levantamentos sucessivos", () => {
  assert.ok(isRelevantDivergence(10, 20, 50));
  assert.ok(!isRelevantDivergence(10, 14, 50));
  assert.ok(isRelevantDivergence(0, 12, 50));
  assert.ok(!isRelevantDivergence(null, 12, 50));
});

const brand = { minBeforePhotos: 1, minAfterPhotos: 1, requireStock: true, rupturePhotoRequired: false };
const base = {
  brand,
  beforePhotos: 1,
  afterPhotos: 1,
  trackedProductIds: ["p1", "p2"],
  stock: { p1: "quantity" as const, p2: "zero" as const },
  damages: [],
  exceptionItems: [],
  exceptionReason: null,
  exceptionNote: null,
  allowExceptions: true,
};

test("atendimento completo pode ser finalizado", () => {
  assert.deepEqual(attendanceMissing(base), []);
});

test("cenário 2: sem foto do depois a finalização é bloqueada e explica o que falta", () => {
  const m = attendanceMissing({ ...base, afterPhotos: 0 });
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, "after_photo");
  assert.match(m[0].message, /DEPOIS/);
});

test("estoque pendente bloqueia; exceção justificada libera e fica registrada", () => {
  const pending = attendanceMissing({ ...base, stock: { p1: "quantity" } });
  assert.equal(pending[0].kind, "stock");
  const excused = attendanceMissing({ ...base, stock: { p1: "quantity" }, exceptionItems: ["stock"], exceptionReason: "area_inaccessible", exceptionNote: "Câmara fria fechada" });
  assert.deepEqual(excused, []);
  const noReason = attendanceMissing({ ...base, afterPhotos: 0, exceptionItems: ["after_photo"], exceptionReason: null, exceptionNote: "x" });
  assert.ok(noReason.some((x) => x.kind === "exception_reason"));
  const disabled = attendanceMissing({ ...base, afterPhotos: 0, exceptionItems: ["after_photo"], exceptionReason: "other", exceptionNote: "justificado", allowExceptions: false });
  assert.ok(disabled.some((x) => x.kind === "after_photo"));
});

test("modo SUINCO: ruptura não exige foto; avaria sempre exige (sem exceção)", () => {
  assert.deepEqual(attendanceMissing({ ...base, brand: { ...brand, rupturePhotoRequired: true } }), []);
  const m = attendanceMissing({ ...base, damages: [{ productId: "p2", photos: 0 }] });
  assert.equal(m[0].kind, "damage_photo");
  assert.equal(m[0].excusable, false);
  assert.deepEqual(attendanceMissing({ ...base, damages: [{ productId: "p2", photos: 1 }] }), []);
});

test("encerramento da visita: marcas pendentes e atendimentos abertos", () => {
  const i = { plannedBrandIds: ["a", "b", "c"], attendanceStatus: { a: "completed", b: "in_progress" } };
  assert.deepEqual(pendingBrandsForClose(i), ["b", "c"]);
  assert.deepEqual(openAttendances(i), ["b"]);
  assert.deepEqual(pendingBrandsForClose({ plannedBrandIds: ["a"], attendanceStatus: { a: "cancelled" } }), []);
});

test("cada loja programada cai em exatamente um grupo", () => {
  const settings = { lateToleranceMin: 60, dayEndsAt: "20:00" };
  const today = "2026-10-10";
  const s = (over: Partial<Parameters<typeof stopBucket>[0]>) => stopBucket({ date: today, plannedStart: "08:00", visit: null, today, nowMinutes: 10 * 60, settings, ...over });
  assert.equal(s({}), "late");
  assert.equal(s({ nowMinutes: 8 * 60 + 30 }), "pending");
  assert.equal(s({ plannedStart: null }), "pending");
  assert.equal(s({ nowMinutes: 21 * 60 }), "missed");
  assert.equal(s({ date: "2026-10-09" }), "missed");
  assert.equal(s({ date: "2026-10-11" }), "pending");
  assert.equal(s({ visit: { status: "in_progress", hasException: false } }), "in_progress");
  assert.equal(s({ visit: { status: "completed", hasException: false } }), "completed");
  assert.equal(s({ visit: { status: "completed", hasException: true } }), "exception");
  assert.equal(s({ visit: { status: "closed_incomplete", hasException: false } }), "exception");
  assert.equal(s({ visit: { status: "cancelled", hasException: false } }), "late");
});

test("percentual sem denominador não é inventado", () => {
  assert.equal(pct(1, 0), null);
  assert.equal(pct(1, 4), 25);
});

test("configurações: padrões seguros e limites", () => {
  assert.deepEqual(mergeSettings(null), DEFAULT_SETTINGS);
  const m = mergeSettings({ lateToleranceMin: 99999, dayEndsAt: "xx", requireApproval: true });
  assert.equal(m.lateToleranceMin, 600);
  assert.equal(m.dayEndsAt, DEFAULT_SETTINGS.dayEndsAt);
  assert.equal(m.requireApproval, true);
});

test("datas no fuso de São Paulo e filtros da URL", () => {
  assert.equal(todayIso(new Date("2026-10-11T02:00:00Z")), "2026-10-10");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(weekdayOf("2026-10-11"), 0);
  assert.ok(isIsoDate("2026-02-28") && !isIsoDate("2026-02-30"));
  const f = parseFilters({ from: "2026-10-10", to: "2026-10-01", brand: "nao-e-uuid", page: "-3" });
  assert.equal(f.from, "2026-10-01");
  assert.equal(f.brand, null);
  assert.equal(f.page, 1);
});

// ───────────────────────────── Validade (modo SUINCO) ─────────────────────────────

test("validade: digitação 0510, faixas e alerta (crítico ou grande quantidade)", async () => {
  const { parseExpiryDigits, classify, isAlertItem, DEFAULT_BANDS, plausibilityWarning } = await import("../src/lib/validity");
  assert.deepEqual(parseExpiryDigits("0510", "2026-10-01"), { ok: true, iso: "2026-10-05", inferredYear: true });
  assert.deepEqual(parseExpiryDigits("0501", "2026-12-20"), { ok: true, iso: "2027-01-05", inferredYear: true });
  assert.equal(parseExpiryDigits("3102", "2026-10-01").ok, false);
  assert.equal(classify(-1), "expired");
  assert.equal(classify(3), "critical");
  assert.equal(classify(7), "high");
  assert.equal(classify(31), "normal");
  assert.ok(plausibilityWarning("2016-12-07", "2026-10-01"));
  const rule = { bands: DEFAULT_BANDS, bulkDays: 15, bulkMinQty: 15 };
  assert.ok(isAlertItem(2, 1, rule), "crítico entra");
  assert.ok(isAlertItem(-3, 1, rule), "vencido entra");
  assert.ok(isAlertItem(10, 20, rule), "grande quantidade entra");
  assert.ok(!isAlertItem(10, 15, rule), "15 unidades não é 'acima de 15'");
  assert.ok(!isAlertItem(20, 100, rule), "fora do prazo de grande quantidade");
});
