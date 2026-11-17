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
