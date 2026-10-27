/** Tempo de trabalho do promotor: em loja, entre lojas, início e fim do dia. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtClock, fmtMinutes, workSummary } from "../src/lib/work-time";

// 10:00 em São Paulo = 13:00 UTC.
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-03:00`);
const v = (date: string, a: string, b: string | null) => ({ promoterId: "p", date, startedAt: at(date, a), finishedAt: b ? at(date, b) : null, status: b ? "completed" : "in_progress" });

test("jornada, tempo em loja e deslocamento por dia, com média, mínimo e máximo", () => {
  const r = workSummary(
    [
      v("2026-10-20", "08:00", "09:00"), // 60 min
      v("2026-10-20", "09:30", "10:00"), // 30 min, 30 min de deslocamento
      v("2026-10-20", "11:00", "12:30"), // 90 min, 60 min de deslocamento
      v("2026-10-21", "07:30", "08:10"), // 40 min
    ],
    "2026-10-27",
  );
  const d20 = r.days.find((d) => d.date === "2026-10-20")!;
  assert.equal(d20.firstStart, 8 * 60);
  assert.equal(d20.lastEnd, 12 * 60 + 30);
  assert.equal(d20.shiftMinutes, 270, "08:00 às 12:30");
  assert.equal(d20.storeMinutes, 180);
  assert.equal(d20.travelMinutes, 90);
  assert.equal(d20.avgTravel, 45);
  assert.deepEqual(r.store, { avg: 55, min: 30, max: 90, n: 4 });
  assert.deepEqual(r.travel, { avg: 45, min: 30, max: 60, n: 2 });
  assert.deepEqual(r.start, { avg: 465, min: 450, max: 480, n: 2 }, "média 07:45");
  assert.equal(r.shiftMinutes, 270 + 40);
});

test("visita esquecida aberta de outro dia não entra nas horas; a de hoje conta até agora", () => {
  const r = workSummary([v("2026-10-26", "09:00", null)], "2026-10-27");
  assert.equal(r.openForgotten, 1);
  assert.equal(r.storeMinutes, 0);
  const now = at("2026-10-27", "10:30");
  const today = workSummary([v("2026-10-27", "10:00", null)], "2026-10-27", now);
  assert.equal(today.storeMinutes, 30);
  assert.equal(today.openForgotten, 0);
});

test("formatos", () => {
  assert.equal(fmtMinutes(40), "40 min");
  assert.equal(fmtMinutes(135), "2h15");
  assert.equal(fmtMinutes(120), "2h");
  assert.equal(fmtClock(465), "07:45");
  assert.equal(fmtMinutes(null), "—");
});
