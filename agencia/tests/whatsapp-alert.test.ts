/** Alerta no WhatsApp: validade próxima e avaria na mesma mensagem. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, isNull } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import { buildAlertMessage } from "../src/server/whatsapp-alert";
import { mergeSettings } from "../src/lib/settings";

let db: DB;

describe("alerta de validade e avaria", () => {
  before(async () => {
    db = await memDb();
  });

  test("atendimento com avaria entra no alerta, mesmo sem validade próxima", async () => {
    const [att] = await db.select({ id: s.attendances.id, agencyId: s.attendances.agencyId, brandId: s.attendances.brandId }).from(s.attendances).limit(1);
    const [product] = await db.select({ id: s.products.id }).from(s.products).where(eq(s.products.brandId, att.brandId)).limit(1);
    await db.insert(s.damages).values({ id: crypto.randomUUID(), agencyId: att.agencyId, attendanceId: att.id, productId: product.id, kind: "damaged_package", quantity: 3, unit: "un", recordedAt: new Date() });
    const [d] = await db.select({ attendanceId: s.damages.attendanceId, agencyId: s.damages.agencyId }).from(s.damages).where(isNull(s.damages.deletedAt)).limit(1);
    // Sem nenhuma validade: só a avaria precisa bastar.
    await db.delete(s.validities).where(eq(s.validities.attendanceId, d.attendanceId));
    const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, d.agencyId));
    const msg = await buildAlertMessage({ agencyId: d.agencyId, agencyName: agency.name, settings: mergeSettings(agency.settings) }, d.attendanceId, "00000000-0000-0000-0000-000000000000");
    assert.ok(msg, "deveria montar a mensagem");
    assert.match(msg!.text, /\*Avaria – /);
    assert.match(msg!.text, /\*Avarias \(\d+\):\*/);
    assert.ok(msg!.items >= 1);
  });

  test("atendimento sem validade na regra e sem avaria não gera alerta", async () => {
    const [a] = await db.select({ id: s.attendances.id, agencyId: s.attendances.agencyId }).from(s.attendances).limit(1);
    await db.delete(s.validities).where(eq(s.validities.attendanceId, a.id));
    await db.delete(s.damages).where(eq(s.damages.attendanceId, a.id));
    const [agency] = await db.select().from(s.agencies).where(eq(s.agencies.id, a.agencyId));
    const msg = await buildAlertMessage({ agencyId: a.agencyId, agencyName: agency.name, settings: mergeSettings(agency.settings) }, a.id, "00000000-0000-0000-0000-000000000000");
    assert.equal(msg, null);
  });
});
