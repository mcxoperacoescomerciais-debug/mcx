/** Tempo médio por marca (promotor e equipe) a partir do início e fim de cada atendimento. */
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { addDays, todayIso } from "../src/lib/dates";

let db: DB;
let admin: Scope;
let joao: Scope;

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  admin = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, "admin")))[0]);
  joao = await auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, "joao")))[0]);
});

test("média, mínimo e máximo por marca batem com os atendimentos concluídos; filtro por promotor", async () => {
  const { brandTimes } = await import("../src/server/brand-time");
  const from = addDays(todayIso(), -13);
  const all = await brandTimes(admin, { from, to: todayIso() });
  assert.ok(all.length > 0);
  for (const b of all) {
    assert.equal(b.n, b.rows.length);
    assert.equal(b.avg, Math.round(b.rows.reduce((t, r) => t + r.minutes, 0) / b.rows.length));
    assert.equal(b.min, Math.min(...b.rows.map((r) => r.minutes)));
    assert.ok(b.rows.every((r) => r.minutes >= 0 && r.minutes <= 480));
  }
  const mine = await brandTimes(admin, { from, to: todayIso(), promoterId: joao.userId });
  assert.ok(mine.every((b) => b.rows.every((r) => r.promoterId === joao.userId)));
  const one = all[0];
  const only = await brandTimes(admin, { from, to: todayIso(), brandIds: [one.brandId] });
  assert.deepEqual(only.map((b) => b.brandId), [one.brandId]);
});
