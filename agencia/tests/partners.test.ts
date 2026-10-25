/** Importação "Atendimentos via parceiros": parceiro na loja × marca, sem duplicar e só na agência certa. */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";

let db: DB;
let etros: Scope;
let af: Scope;
let imp: typeof import("../src/server/import");

const row = (o: Record<string, string>) => ({ rede: "", loja: "", cidade: "", marca: "", promotor: "", frequencia: "", parceiro: "", responsavel: "", contato: "", ...o });

before(async () => {
  db = await memDb();
  const auth = await import("../src/server/auth");
  imp = await import("../src/server/import");
  const user = async (username: string) => auth.scopeForUser((await db.select().from(s.users).where(eq(s.users.username, username)))[0]);
  etros = await user("etros");
  af = await user("admin");
});

describe("atendimentos via parceiros", () => {
  test("importa loja × marca com parceiro, atribuição do promotor e avisos; reimportar não duplica", async () => {
    const afBrandsBefore = (await db.select().from(s.brands).where(eq(s.brands.agencyId, af.agencyId))).length;
    const rows = [
      row({ rede: "ABC", loja: "ABC LOJA 08", cidade: "Formiga", marca: "Sanol Dog", promotor: "carla", frequencia: "1", parceiro: "Maranata Merchandising", responsavel: "Geovane", contato: "35 99741-0423" }),
      row({ rede: "ABC", loja: "ABC LOJA 08", cidade: "Formiga", marca: "Total Embalagens", promotor: "S/promotor", frequencia: "2", parceiro: "Maranata Merchandising", responsavel: "Geovane" }),
      row({ rede: "BAHAMAS", loja: "BAHAMAS LOJA 62", cidade: "Uberlândia", marca: "BOB", frequencia: "MENSAL", responsavel: "Wellington", contato: "32 99160-1750" }),
      row({ rede: "BAHAMAS", loja: "BAHAMAS LOJA 62", cidade: "Uberlândia", marca: "BOB", frequencia: "MENSAL", responsavel: "Wellington" }),
      row({ rede: "ABC", loja: "ABC LOJA 20", cidade: "Lagoa da Prata", marca: "Sanol Dog", promotor: "etros.thaina", frequencia: "1", parceiro: "Maranata Merchandising", responsavel: "Geovane" }),
      row({ rede: "Várias", loja: "", cidade: "Itaúna", marca: "Vários", responsavel: "Juninho" }),
    ];
    const dry = await imp.runImport(etros, "parceiros", rows, true);
    assert.equal(dry.created, 4);
    assert.equal(dry.errors.length, 2, JSON.stringify(dry.errors));
    assert.equal((await db.select().from(s.partners)).length, 0, "validação não grava");

    const r = await imp.runImport(etros, "parceiros", rows, false);
    assert.equal(r.created, 4, JSON.stringify(r));
    assert.match(r.errors.find((e) => e.line === 5)!.message, /Duplicado/);
    assert.match(r.errors.find((e) => e.line === 7)!.message, /incompleto/);
    assert.ok(r.notes!.some((n) => n.line === 6 && /etros\.thaina/.test(n.message)), "promotor sem usuário vira aviso");

    const partners = await db.select().from(s.partners).where(eq(s.partners.agencyId, etros.agencyId));
    assert.deepEqual(partners.map((p) => p.name).sort(), ["Maranata Merchandising", "Wellington"]);
    const links = await db
      .select({ store: s.stores.name, brand: s.brands.name, partner: s.partners.name, times: s.storeBrands.visitsPerPeriod, period: s.storeBrands.period, agency: s.stores.agencyId })
      .from(s.storeBrands)
      .innerJoin(s.stores, eq(s.stores.id, s.storeBrands.storeId))
      .innerJoin(s.brands, eq(s.brands.id, s.storeBrands.brandId))
      .innerJoin(s.partners, eq(s.partners.id, s.storeBrands.partnerId));
    assert.equal(links.length, 4);
    assert.ok(links.every((l) => l.agency === etros.agencyId), "tudo na Etros");
    assert.deepEqual(links.find((l) => l.brand === "BOB"), { store: "BAHAMAS LOJA 62", brand: "BOB", partner: "Wellington", times: 1, period: "month", agency: etros.agencyId });
    const [carla] = await db.select().from(s.users).where(eq(s.users.username, "carla"));
    const targets = await db.select().from(s.visitTargets).where(eq(s.visitTargets.promoterId, carla.id));
    assert.ok(targets.some((t) => t.perWeek === 1 && t.period === "week"), "atribuição do promotor com a frequência");
    const brands = await db.select().from(s.brands).where(and(eq(s.brands.agencyId, etros.agencyId), eq(s.brands.code, "SANOL_DOG")));
    assert.equal(brands.length, 1, "marca criada sem SKUs, identificador a partir do nome");
    assert.equal((await db.select().from(s.products).where(eq(s.products.brandId, brands[0].id))).length, 0);

    const again = await imp.runImport(etros, "parceiros", rows, false);
    assert.equal(again.created, 0);
    assert.equal(again.updated, 4);
    assert.equal((await db.select().from(s.storeBrands).innerJoin(s.stores, eq(s.stores.id, s.storeBrands.storeId)).where(eq(s.stores.agencyId, etros.agencyId))).filter((x) => x.store_brands.partnerId).length, 4, "sem duplicar");
    assert.equal((await db.select().from(s.brands).where(eq(s.brands.agencyId, af.agencyId))).length, afBrandsBefore, "outra agência intocada");
  });
});
