/** Início da operação: some o histórico de campo antes da data, só daquela agência; cadastros e o que vem depois ficam. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { SessionUser } from "../src/server/auth";
import { clearFieldHistory, fieldHistoryCounts } from "../src/server/field-reset";

let db: DB;
let mcx: SessionUser;

const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

describe("início da operação", () => {
  before(async () => {
    db = await memDb();
    const [u] = await db.select().from(s.users).where(eq(s.users.platform, true)).limit(1);
    mcx = { ...u, platform: true, platformRole: "owner", agencyStatus: "active" } as unknown as SessionUser;
  });

  test("apaga visitas, atendimentos e programação antes da data; o resto fica", async () => {
    // Agência com mais visitas na demonstração.
    const [top] = await db
      .select({ id: s.visits.agencyId, n: sql<number>`count(*)::int` })
      .from(s.visits)
      .groupBy(s.visits.agencyId)
      .orderBy(sql`count(*) desc`)
      .limit(1);
    const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, top.id));
    const dates = (await db.select({ d: sql<string>`${s.visits.visitDate}::text` }).from(s.visits).where(eq(s.visits.agencyId, agency.id))).map((r) => r.d).sort();
    const cut = dates[Math.floor(dates.length / 2)];
    assert.ok(dates[0] < cut, "precisa de visitas antes do corte");

    const count = (t: typeof s.visits | typeof s.schedules, agencyId: string, col: "before" | "after") => {
      const dateCol = t === s.visits ? s.visits.visitDate : s.schedules.date;
      return n(db.select({ n: sql<number>`count(*)::int` }).from(t).where(and(eq(t.agencyId, agencyId), col === "before" ? lt(dateCol, cut) : gte(dateCol, cut))));
    };
    const visitsAfter = await count(s.visits, agency.id, "after");
    const schedulesAfter = await count(s.schedules, agency.id, "after");
    const otherVisits = await n(db.select({ n: sql<number>`count(*)::int` }).from(s.visits).where(ne(s.visits.agencyId, agency.id)));
    const stores = await n(db.select({ n: sql<number>`count(*)::int` }).from(s.stores).where(eq(s.stores.agencyId, agency.id)));
    const targets = await n(db.select({ n: sql<number>`count(*)::int` }).from(s.visitTargets).where(eq(s.visitTargets.agencyId, agency.id)));

    const preview = await fieldHistoryCounts(agency.id, cut);
    assert.equal(preview.visits, await count(s.visits, agency.id, "before"));
    assert.ok(preview.attendances > 0);

    assert.equal((await clearFieldHistory(mcx, agency.id, cut, "outro nome")).ok, false);
    assert.equal((await clearFieldHistory({ ...mcx, platform: false }, agency.id, cut, agency.name)).ok, false);
    const r = await clearFieldHistory(mcx, agency.id, cut, agency.name);
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    assert.equal(await count(s.visits, agency.id, "before"), 0);
    assert.equal(await count(s.schedules, agency.id, "before"), 0);
    assert.equal(await count(s.visits, agency.id, "after"), visitsAfter);
    assert.equal(await count(s.schedules, agency.id, "after"), schedulesAfter);
    assert.equal(await n(db.select({ n: sql<number>`count(*)::int` }).from(s.visits).where(ne(s.visits.agencyId, agency.id))), otherVisits);
    assert.equal(await n(db.select({ n: sql<number>`count(*)::int` }).from(s.stores).where(eq(s.stores.agencyId, agency.id))), stores);
    assert.equal(await n(db.select({ n: sql<number>`count(*)::int` }).from(s.visitTargets).where(eq(s.visitTargets.agencyId, agency.id))), targets);
    // Nenhum atendimento ficou sem visita.
    const orphans = await n(
      db.select({ n: sql<number>`count(*)::int` }).from(s.attendances).where(sql`not exists (select 1 from visits v where v.id = ${s.attendances.visitId})`),
    );
    assert.equal(orphans, 0);
    assert.equal((await fieldHistoryCounts(agency.id, cut)).total, 0);
    // A data fica nas configurações: metas e sistemática contam dela em diante.
    const [after] = await db.select().from(s.agencies).where(eq(s.agencies.id, agency.id));
    assert.equal((after.settings as { operationStart?: string }).operationStart, cut);
  });
});
