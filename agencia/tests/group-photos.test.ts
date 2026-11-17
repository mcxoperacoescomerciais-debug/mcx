/** Grupo recebe as 10 primeiras fotos do antes/depois; o excedente fica só no relatório. */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { groupPhotos, groupPhotosNote } from "../src/app/app/_lib/group-photos";

const ph = (kind: string, min: number) => ({ id: `${kind}${min}`, kind, takenAt: `2026-11-17T10:${String(min).padStart(2, "0")}:00.000Z` });

describe("fotos no grupo do WhatsApp", () => {
  test("até 10 vão todas", () => {
    const r = groupPhotos([ph("before", 1), ph("after", 2), ph("after", 3)]);
    assert.equal(r.sent.length, 3);
    assert.equal(r.left, 0);
    assert.equal(groupPhotosNote(3, 3), null);
  });

  test("18 fotos: vão as 10 primeiras tiradas, 8 ficam no relatório", () => {
    const photos = [...Array.from({ length: 15 }, (_, i) => ph("after", 20 + i)), ph("before", 1), ph("before", 2), ph("before", 3)];
    const r = groupPhotos(photos);
    assert.equal(r.total, 18);
    assert.equal(r.left, 8);
    assert.deepEqual(r.sent.slice(0, 3).map((p) => p.kind), ["before", "before", "before"]);
    assert.equal(r.sent.at(-1)!.takenAt, ph("after", 26).takenAt);
    assert.match(groupPhotosNote(10, 18)!, /10 de 18 .* outras 8/);
  });

  test("ruptura, validade e avaria não entram na conta do antes/depois", () => {
    const r = groupPhotos([ph("rupture", 1), ph("validity", 2), ph("after", 3)]);
    assert.equal(r.total, 1);
  });

  test("limite menor quando o PDF vai anexado", () => {
    const r = groupPhotos(Array.from({ length: 12 }, (_, i) => ph("after", i)), 9);
    assert.equal(r.sent.length, 9);
    assert.equal(r.left, 3);
  });
});
