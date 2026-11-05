/**
 * Costa Foods deixa de ser agência e vira a marca "Costa Foods (Avivar)" da AF:
 * produtos, redes, mix e lojas vão sem duplicar; demonstração fica de fora;
 * rodar de novo não muda nada.
 */
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";

let db: DB;
let afId: string;

before(async () => {
  db = await memDb();
  [{ id: afId }] = await db.select({ id: s.agencies.id }).from(s.agencies).where(eq(s.agencies.name, "AF Merchandising"));
  // Agência Costa Foods como ficou em produção: marca AVIVAR, redes, mix, lojas e uma loja de demonstração.
  const [costa] = await db.insert(s.agencies).values({ name: "Costa Foods", slug: "costa-foods" }).returning();
  const [brand] = await db.insert(s.brands).values({ agencyId: costa.id, name: "AVIVAR", code: "AVIVAR", activities: ["Organizar gôndola"] }).returning();
  const prods = await db
    .insert(s.products)
    .values([
      { agencyId: costa.id, brandId: brand.id, name: "Frango temperado 1kg", nameKey: "frango temperado 1kg", sku: "AV-1" },
      { agencyId: costa.id, brandId: brand.id, name: "Coxinha da asa 1kg", nameKey: "coxinha da asa 1kg", sku: "AV-2" },
    ])
    .returning();
  const [superBh] = await db.insert(s.chains).values({ agencyId: costa.id, name: "SUPER BH" }).returning();
  const [bahamas] = await db.insert(s.chains).values({ agencyId: costa.id, name: "Bahamas" }).returning();
  const [mix] = await db.insert(s.productMixes).values({ agencyId: costa.id, chainId: bahamas.id, brandId: brand.id, name: "PADRAO", productIds: [prods[0].id] }).returning();
  const stores = await db
    .insert(s.stores)
    .values([
      // Mesma loja que a AF já tem (rede "Super BH", Itaúna): não duplica.
      { agencyId: costa.id, chainId: superBh.id, name: "Super BH Pio XII", city: "Itaúna" },
      { agencyId: costa.id, chainId: bahamas.id, name: "Bahamas Divinópolis", city: "Divinópolis", address: "Rua A, 10", lat: -20.1, lng: -44.9, geoSource: "address" },
      { agencyId: costa.id, chainId: bahamas.id, name: "Loja exemplo", city: "Divinópolis", code: "DEMO-1" },
    ])
    .returning();
  await db.insert(s.storeBrands).values(stores.map((st) => ({ storeId: st.id, brandId: brand.id })));
  await db.insert(s.storeMixes).values({ storeId: stores[1].id, brandId: brand.id, mixId: mix.id });
  await db.insert(s.storeProducts).values({ storeId: stores[1].id, productId: prods[0].id });
});

describe("Costa Foods vira marca da AF", () => {
  test("leva produtos, redes, mix e lojas sem duplicar; rodar de novo não muda nada", async () => {
    const { costaFoodsToAf, COSTA_BRAND_NAME } = await import("../scripts/setup-data");
    const storesBefore = (await db.select().from(s.stores).where(eq(s.stores.agencyId, afId))).length;
    await costaFoodsToAf();
    await costaFoodsToAf();

    const brands = await db.select().from(s.brands).where(and(eq(s.brands.agencyId, afId), eq(s.brands.code, "AVIVAR")));
    assert.equal(brands.length, 1);
    const brand = brands[0];
    assert.equal(brand.name, COSTA_BRAND_NAME);
    assert.deepEqual(brand.activities, ["Organizar gôndola"]);

    const products = await db.select().from(s.products).where(eq(s.products.brandId, brand.id));
    assert.deepEqual(products.map((p) => p.sku).sort(), ["AV-1", "AV-2"]);

    // Uma loja nova (Bahamas); a do Super BH já existia; a de demonstração ficou de fora.
    const afStores = await db.select().from(s.stores).where(eq(s.stores.agencyId, afId));
    assert.equal(afStores.length, storesBefore + 1);
    const bahamas = afStores.find((st) => st.name === "Bahamas Divinópolis")!;
    assert.equal(bahamas.address, "Rua A, 10");
    assert.ok(!afStores.some((st) => st.code === "DEMO-1"));

    const links = await db.select().from(s.storeBrands).where(eq(s.storeBrands.brandId, brand.id));
    assert.equal(links.length, 2);
    const [chosen] = await db.select().from(s.storeMixes).where(and(eq(s.storeMixes.storeId, bahamas.id), eq(s.storeMixes.brandId, brand.id)));
    const [afMix] = await db.select().from(s.productMixes).where(eq(s.productMixes.id, chosen.mixId));
    const frango = products.find((p) => p.sku === "AV-1")!;
    assert.deepEqual(afMix.productIds, [frango.id]);
    const list = await db.select().from(s.storeProducts).where(and(eq(s.storeProducts.storeId, bahamas.id), inArray(s.storeProducts.productId, products.map((p) => p.id))));
    assert.deepEqual(list.map((r) => r.productId), [frango.id]);

    const chains = await db.select().from(s.chains).where(eq(s.chains.agencyId, afId));
    assert.equal(chains.filter((c) => c.name.toLowerCase() === "bahamas").length, 1);
    assert.equal(chains.filter((c) => c.name.toLowerCase() === "super bh").length, 1);
  });
});
