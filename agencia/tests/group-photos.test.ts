/** Grupo recebe só as fotos do depois (até 10); as do antes ficam no relatório. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { groupPhotos, groupSendHint } from "../src/app/app/_lib/group-photos";

const ph = (kind: string, min: number) => ({ id: `${kind}${min}`, kind, takenAt: `2026-11-17T10:${String(min).padStart(2, "0")}:00.000Z` });

describe("fotos no grupo do WhatsApp", () => {
  test("só as do depois vão; as do antes ficam no relatório", () => {
    const r = groupPhotos([ph("before", 1), ph("after", 2), ph("after", 3)]);
    assert.deepEqual(r.sent.map((p) => p.kind), ["after", "after"]);
    assert.equal(r.hasBefore, true);
  });

  test("20 antes + 20 depois: vão as 10 primeiras do depois, na ordem tirada", () => {
    const photos = [...Array.from({ length: 20 }, (_, i) => ph("after", 59 - i)), ...Array.from({ length: 20 }, (_, i) => ph("before", i))];
    const r = groupPhotos(photos);
    assert.equal(r.sent.length, 10);
    assert.ok(r.sent.every((p) => p.kind === "after"));
    assert.equal(r.sent[0].takenAt, ph("after", 40).takenAt);
    assert.equal(r.sent[9].takenAt, ph("after", 49).takenAt);
  });

  test("sem foto do antes não há aviso; ruptura e validade não vão", () => {
    const r = groupPhotos([ph("rupture", 1), ph("validity", 2), ph("after", 3)]);
    assert.equal(r.sent.length, 1);
    assert.equal(r.hasBefore, false);
  });

  test("texto para o promotor", () => {
    assert.equal(groupSendHint(10, 8, true), "Vão 10 fotos do DEPOIS para o grupo. As outras 8 do depois e as do antes ficam no relatório.");
    assert.equal(groupSendHint(4, 0, true), "Vão 4 fotos do DEPOIS para o grupo. As do antes ficam no relatório.");
    assert.equal(groupSendHint(10, 3, false), "Vão 10 fotos do DEPOIS para o grupo. As outras 3 do depois ficam no relatório.");
    assert.equal(groupSendHint(1, 0, false), "Vão 1 foto do DEPOIS para o grupo.");
  });

  test("9 quando o PDF vai anexado", () => {
    assert.equal(groupPhotos(Array.from({ length: 12 }, (_, i) => ph("after", i)), 9).sent.length, 9);
  });
});

test("só fotos em pé: as tiradas na horizontal não vão para o grupo", async () => {
  const { groupLimit, isLandscape } = await import("../src/app/app/_lib/group-photos");
  const { mergeSettings } = await import("../src/lib/settings");
  assert.equal(isLandscape(1600, 1200), true);
  assert.equal(isLandscape(1200, 1600), false);
  assert.equal(isLandscape(1000, 1000), false);
  // 7 do depois; a 2ª e a 5ª na horizontal. Limite 4: vão a 1ª, 3ª, 4ª e 6ª; ficam 3 no relatório.
  const lying = new Set([ph("after", 2).id, ph("after", 5).id]);
  const r = groupPhotos(Array.from({ length: 7 }, (_, i) => ph("after", i + 1)), groupLimit(4), (p) => lying.has(p.id));
  assert.deepEqual(r.sent.map((p) => p.id), [1, 3, 4, 6].map((i) => ph("after", i).id));
  assert.equal(r.afterLeft, 3);
  assert.equal(r.skipped, 2);
  // Todas na horizontal: nenhuma vai, todas ficam no relatório.
  const none = groupPhotos([ph("after", 1), ph("after", 2)], 10, () => true);
  assert.equal(none.sent.length, 0);
  assert.equal(none.afterLeft, 2);
  assert.equal(groupPhotos([ph("after", 1)]).skipped, 0);
  assert.equal(mergeSettings({}).groupPortraitOnly, false);
  assert.equal(mergeSettings({ groupPortraitOnly: true }).groupPortraitOnly, true);
});

test("limite da agência: 4 fotos no grupo, o resto no relatório", async () => {
  const { groupLimit, groupReportNote } = await import("../src/app/app/_lib/group-photos");
  const { mergeSettings } = await import("../src/lib/settings");
  assert.equal(groupLimit(4), 4);
  assert.equal(groupLimit(undefined), 10);
  assert.equal(groupLimit(0), 1);
  assert.equal(groupLimit(99), 10);
  const r = groupPhotos([ph("before", 0), ...Array.from({ length: 7 }, (_, i) => ph("after", i + 1))], groupLimit(4));
  assert.equal(r.sent.length, 4);
  assert.deepEqual(r.sent.map((p) => p.takenAt), [1, 2, 3, 4].map((i) => ph("after", i).takenAt));
  assert.equal(r.afterLeft, 3);
  assert.equal(groupReportNote(true, 3), "📷 As fotos do ANTES e as demais do DEPOIS estão no relatório completo.");
  assert.equal(groupReportNote(false, 3), "📷 As demais fotos do DEPOIS estão no relatório completo.");
  assert.equal(groupReportNote(true, 0), "📷 As fotos do ANTES estão no relatório completo.");
  assert.equal(groupReportNote(false, 0), null);
  assert.equal(mergeSettings({}).groupPhotoMax, 10);
  assert.equal(mergeSettings({ groupPhotoMax: 4 }).groupPhotoMax, 4);
  assert.equal(mergeSettings({ groupPhotoMax: 50 }).groupPhotoMax, 10);
});
