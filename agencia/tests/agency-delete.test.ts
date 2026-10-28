/** Exclusão de agência: some tudo dela, nada das outras. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { SessionUser } from "../src/server/auth";
import { deleteAgency } from "../src/server/agency-delete";

let db: DB;
let mcx: SessionUser;

/** Linhas por agência em todas as tabelas com agency_id. */
async function countsByAgency(): Promise<Map<string, number>> {
  const tables = (await db.execute(sql`select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'agency_id'`)) as unknown as { rows: { t: string }[] };
  const total = new Map<string, number>();
  for (const { t } of tables.rows) {
    const r = (await db.execute(sql.raw(`select agency_id::text as a, count(*)::int as n from "${t}" group by 1`))) as unknown as { rows: { a: string; n: number }[] };
    for (const x of r.rows) total.set(x.a, (total.get(x.a) ?? 0) + x.n);
  }
  return total;
}

describe("excluir agência", () => {
  before(async () => {
    db = await memDb();
    const [u] = await db.select().from(s.users).where(eq(s.users.platform, true)).limit(1);
    mcx = { ...u, platform: true, platformRole: "owner", agencyStatus: "active" } as unknown as SessionUser;
  });

  test("pede o nome exato e só a equipe MCX", async () => {
    const [af] = await db.select().from(s.agencies).where(eq(s.agencies.kind, "client")).limit(1);
    const wrong = await deleteAgency(mcx, af.id, "outro nome");
    assert.equal(wrong.ok, false);
    const notPlatform = await deleteAgency({ ...mcx, platform: false }, af.id, af.name);
    assert.equal(notPlatform.ok, false);
    const platformAgency = await deleteAgency(mcx, mcx.agencyId, "MCX");
    assert.equal(platformAgency.ok, false);
  });

  test("apaga tudo da agência e mantém as outras", async () => {
    const before = await countsByAgency();
    const clients = await db.select().from(s.agencies).where(eq(s.agencies.kind, "client"));
    // A agência com mais registros (visitas, fotos, degustações, financeiro da demonstração).
    const target = clients.sort((a, b) => (before.get(b.id) ?? 0) - (before.get(a.id) ?? 0))[0];
    assert.ok((before.get(target.id) ?? 0) > 50, "a demonstração deveria ter dados na agência");

    const r = await deleteAgency(mcx, target.id, `  ${target.name.toUpperCase()} `);
    assert.equal(r.ok, true, r.ok ? "" : r.error);

    const after = await countsByAgency();
    assert.equal(after.get(target.id) ?? 0, 0);
    const [gone] = await db.select().from(s.agencies).where(eq(s.agencies.id, target.id));
    assert.equal(gone, undefined);
    for (const c of clients) if (c.id !== target.id) assert.equal(after.get(c.id), before.get(c.id), `agência ${c.name} não pode mudar`);
    // Tabelas sem agency_id ligadas às lojas da agência também foram limpas.
    const orphan = (await db.execute(sql`select count(*)::int as n from store_brands sb left join stores st on st.id = sb.store_id where st.id is null`)) as unknown as { rows: { n: number }[] };
    assert.equal(orphan.rows[0].n, 0);
  });
});
