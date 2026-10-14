/**
 * Mix por formato de loja (ex.: ABC VAREJO/PLUS/CASH): o promotor escolhe o
 * formato no primeiro atendimento e a loja fica com a lista daquele mix.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import type { VisitInput } from "../src/lib/sync-types";
import { todayIso } from "../src/lib/dates";
import { parseWeekdays } from "../src/server/import-extra";

let db: DB;
let auth: typeof import("../src/server/auth");
let promoter: typeof import("../src/server/promoter");

async function scopeOf(username: string): Promise<Scope> {
  const [u] = await db.select().from(s.users).where(eq(s.users.username, username));
  return auth.scopeForUser(u);
}

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  promoter = await import("../src/server/promoter");
});

describe("mix por formato de loja", () => {
  test("dias da planilha viram dias da semana", () => {
    assert.deepEqual(parseWeekdays("SEG/QUI"), [1, 4]);
    assert.deepEqual(parseWeekdays("SEG/QUA/SEX"), [1, 3, 5]);
    assert.deepEqual(parseWeekdays("QUARTA"), [3]);
    assert.deepEqual(parseWeekdays("SEMANAL"), []);
  });

  test("promotor escolhe o formato na 1ª visita; vale para as próximas e não é trocado por outro aparelho", async () => {
    const lucas = await scopeOf("lucas");
    const boot = await promoter.buildBootstrap(lucas);
    const store = boot.stores.find((x) => x.chainId && x.brandIds.length)!;
    const brandId = store.brandIds[0];
    const products = boot.products.filter((p) => p.brandId === brandId).map((p) => p.id);
    const [a, b] = await db
      .insert(s.productMixes)
      .values([
        { agencyId: lucas.agencyId, chainId: store.chainId!, brandId, name: "VAREJO", productIds: products.slice(0, 1) },
        { agencyId: lucas.agencyId, chainId: store.chainId!, brandId, name: "PLUS", productIds: products.slice(0, 2) },
      ])
      .returning();
    const before = await promoter.buildBootstrap(lucas);
    assert.deepEqual(before.mixes.filter((m) => m.chainId === store.chainId).map((m) => m.name).sort(), ["PLUS", "VAREJO"]);
    assert.equal(before.storeMixes[store.id]?.[brandId], undefined, "ainda não escolhido");

    const visitId = randomUUID();
    const visit = (mixId: string): VisitInput => ({
      id: visitId, storeId: store.id, scheduleId: null, visitDate: todayIso(), origin: "extra", extraReason: "Teste do formato",
      status: "in_progress", closeReason: null, startedAt: new Date().toISOString(), finishedAt: null, geo: null, notes: null,
      mixChoices: [{ brandId, mixId }], attendances: [],
    });
    const [r1] = await promoter.applySync(lucas, [visit(b.id)]);
    assert.ok(r1.ok, JSON.stringify(r1));
    const after = await promoter.buildBootstrap(lucas);
    assert.equal(after.storeMixes[store.id][brandId], b.id);
    const list = await db.select().from(s.storeProducts).where(eq(s.storeProducts.storeId, store.id));
    assert.deepEqual(list.filter((x) => products.includes(x.productId)).map((x) => x.productId).sort(), products.slice(0, 2).sort());

    // Escolha diferente chegando depois (outro aparelho, reenvio): a primeira fica.
    const [r2] = await promoter.applySync(lucas, [visit(a.id)]);
    assert.ok(r2.ok, JSON.stringify(r2));
    const [kept] = await db.select().from(s.storeMixes).where(inArray(s.storeMixes.storeId, [store.id]));
    assert.equal(kept.mixId, b.id);
  });
});
