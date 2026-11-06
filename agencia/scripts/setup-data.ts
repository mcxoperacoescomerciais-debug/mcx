/**
 * Cargas de dados aplicadas no deploy (idempotentes, rodam a cada início):
 *  1. endereços das lojas (scripts/carga/enderecos-lojas.json): preenche endereço,
 *     bairro e posição só onde a loja ainda não tem — nunca sobrescreve;
 *  2. marca Ygloo (sorvetes) na AF Merchandising, com o checklist do freezer e a
 *     pergunta "freezer funcionando?": só cria se a AF não tiver marca com o código
 *     YGLOO ou o nome Ygloo — nunca altera nem recria uma marca existente;
 *  3. Costa Foods vira marca da AF: enquanto existir a agência "Costa Foods",
 *     leva a marca AVIVAR dela (produtos, redes, mix por rede, lojas que não são
 *     de demonstração, marca autorizada na loja e lista de produtos da loja) para
 *     a marca "Costa Foods (Avivar)" da AF — reaproveita a AVIVAR da AF se já
 *     existir e nunca duplica (produto por SKU/nome, rede por nome, loja por
 *     rede + nome + cidade). Visitas, promotores e demonstração não vão. Depois
 *     de conferir, a agência Costa Foods é excluída em MCX › Agências, e esta
 *     carga deixa de fazer qualquer coisa;
 *  (a carga inicial da AVIVAR rodou uma vez em 28/10/2026 e saiu daqui: recriava a
 *   agência quando ela era renomeada.)
 *
 * Falhas aqui não impedem o sistema de subir.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "../src/server/db";

const data = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "scripts", "carga", file), "utf8"));
const norm = (t: string | null | undefined) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

interface AddressRow {
  loja: string;
  cidade: string;
  endereco: string;
  bairro: string | null;
  lat: number | null;
  lng: number | null;
  precisao: "house" | "street" | "city" | null;
}

async function storeAddresses() {
  const db = await getDb();
  const rows = data("enderecos-lojas.json") as AddressRow[];
  const byKey = new Map<string, AddressRow>();
  const byName = new Map<string, AddressRow[]>();
  for (const r of rows) {
    byKey.set(`${norm(r.loja)}|${norm(r.cidade)}`, r);
    byName.set(norm(r.loja), [...(byName.get(norm(r.loja)) ?? []), r]);
  }
  const stores = await db
    .select({ id: s.stores.id, name: s.stores.name, city: s.stores.city, address: s.stores.address, district: s.stores.district, lat: s.stores.lat, lng: s.stores.lng })
    .from(s.stores)
    .innerJoin(s.agencies, eq(s.agencies.id, s.stores.agencyId))
    .where(and(eq(s.agencies.kind, "client"), or(isNull(s.stores.code), sql`${s.stores.code} not like 'DEMO-%'`)));
  let address = 0;
  let coords = 0;
  let matched = 0;
  for (const st of stores) {
    const same = byName.get(norm(st.name)) ?? [];
    const r = byKey.get(`${norm(st.name)}|${norm(st.city)}`) ?? (same.length === 1 ? same[0] : undefined);
    if (!r) continue;
    matched++;
    const patch: Partial<typeof s.stores.$inferInsert> = {};
    if (!st.address?.trim() && r.endereco) {
      patch.address = r.endereco;
      address++;
    }
    if (!st.district?.trim() && r.bairro) patch.district = r.bairro;
    if ((st.lat == null || st.lng == null) && r.lat != null && r.lng != null && (r.precisao === "house" || r.precisao === "street")) {
      patch.lat = r.lat;
      patch.lng = r.lng;
      patch.geoSource = r.precisao === "house" ? "address" : "address_approx";
      coords++;
    }
    if (Object.keys(patch).length) await db.update(s.stores).set({ ...patch, updatedAt: new Date() }).where(eq(s.stores.id, st.id));
  }
  console.log(`[dados] Endereços: ${matched} loja(s) encontradas na planilha, ${address} endereço(s) e ${coords} posição(ões) gravados.`);
}

export const YGLOO = {
  name: "Ygloo",
  code: "YGLOO",
  activities: ["Freezer limpo e organizado"],
  questions: ["O freezer está funcionando normalmente?"],
};

/** Marca Ygloo na AF: criada uma única vez; ajustes depois só pelo cadastro. */
export async function yglooBrand() {
  const db = await getDb();
  const af = await afAgency();
  if (!af) return console.log("[dados] Ygloo: AF não encontrada (ou mais de uma) — nada feito.");
  const [exists] = await db
    .select({ id: s.brands.id })
    .from(s.brands)
    .where(and(eq(s.brands.agencyId, af.id), or(sql`lower(${s.brands.code}) = 'ygloo'`, sql`lower(${s.brands.name}) = 'ygloo'`)));
  if (exists) return console.log("[dados] Ygloo: marca já existe na AF — nada feito.");
  // Sem SKUs ainda: estoque opcional até os produtos serem importados.
  await db.insert(s.brands).values({ agencyId: af.id, ...YGLOO, requireStock: false, minBeforePhotos: 1, minAfterPhotos: 1, notes: "Sorvetes. Checklist do freezer e aviso no WhatsApp da marca quando o freezer tiver problema." });
  console.log(`[dados] Ygloo: marca criada em ${af.name}.`);
}

/** A única agência AF (cliente). */
async function afAgency() {
  const db = await getDb();
  const list = (await db.select({ id: s.agencies.id, name: s.agencies.name }).from(s.agencies).where(eq(s.agencies.kind, "client"))).filter((a) => /^AF( |$)/.test(norm(a.name)));
  return list.length === 1 ? list[0] : null;
}

export const COSTA_BRAND_NAME = "Costa Foods (Avivar)";
const isCostaBrand = (b: { code: string; name: string }) => ["AVIVAR", "COSTA FOODS", "COSTA FOODS AVIVAR"].some((n) => norm(b.code) === n || norm(b.name) === n);

/** Costa Foods (agência) → marca "Costa Foods (Avivar)" da AF. Idempotente. */
export async function costaFoodsToAf() {
  const db = await getDb();
  const sources = (await db.select().from(s.agencies).where(eq(s.agencies.kind, "client"))).filter((a) => norm(a.name).startsWith("COSTA FOODS"));
  if (!sources.length) return console.log("[dados] Costa Foods: agência não existe mais — nada a levar.");
  const af = await afAgency();
  if (!af) return console.log("[dados] Costa Foods: AF não encontrada (ou mais de uma) — nada feito.");
  for (const src of sources) {
    const srcBrands = (await db.select().from(s.brands).where(eq(s.brands.agencyId, src.id))).filter(isCostaBrand);
    if (!srcBrands.length) {
      console.log(`[dados] Costa Foods: ${src.name} sem marca AVIVAR — nada feito.`);
      continue;
    }
    // Marca de destino: a AVIVAR/Costa Foods da AF (renomeada uma vez) ou uma nova, com as regras da origem.
    let [target] = (await db.select().from(s.brands).where(eq(s.brands.agencyId, af.id))).filter(isCostaBrand);
    if (!target) {
      const b = srcBrands[0];
      [target] = await db
        .insert(s.brands)
        .values({
          agencyId: af.id,
          name: COSTA_BRAND_NAME,
          code: "AVIVAR",
          status: "active",
          minBeforePhotos: b.minBeforePhotos,
          minAfterPhotos: b.minAfterPhotos,
          requireStock: b.requireStock,
          rupturePhotoRequired: b.rupturePhotoRequired,
          allowGallery: b.allowGallery,
          activities: b.activities,
          questions: b.questions,
          notes: b.notes,
        })
        .returning();
      console.log(`[dados] Costa Foods: marca "${COSTA_BRAND_NAME}" criada na AF.`);
    } else if (norm(target.name) === "AVIVAR") {
      await db.update(s.brands).set({ name: COSTA_BRAND_NAME, updatedAt: new Date() }).where(eq(s.brands.id, target.id));
      console.log(`[dados] Costa Foods: marca AVIVAR da AF renomeada para "${COSTA_BRAND_NAME}".`);
    }
    const srcBrandIds = srcBrands.map((b) => b.id);

    // Produtos: por SKU ou nome dentro da marca de destino.
    const existing = await db.select().from(s.products).where(eq(s.products.brandId, target.id));
    const bySku = new Map(existing.map((p) => [p.sku.toLowerCase(), p.id]));
    const byKey = new Map(existing.map((p) => [p.nameKey, p.id]));
    const productMap = new Map<string, string>();
    let newProducts = 0;
    for (const p of await db.select().from(s.products).where(inArray(s.products.brandId, srcBrandIds))) {
      let id = bySku.get(p.sku.toLowerCase()) ?? byKey.get(p.nameKey);
      if (!id) {
        [{ id }] = await db
          .insert(s.products)
          .values({ agencyId: af.id, brandId: target.id, name: p.name, nameKey: p.nameKey, sku: p.sku, ean: p.ean, category: p.category, variant: p.variant, package: p.package, unit: p.unit, status: p.status, sortOrder: p.sortOrder })
          .returning({ id: s.products.id });
        bySku.set(p.sku.toLowerCase(), id);
        byKey.set(p.nameKey, id);
        newProducts++;
      }
      productMap.set(p.id, id);
    }

    // Redes: pelo nome.
    const afChains = await db.select().from(s.chains).where(eq(s.chains.agencyId, af.id));
    const chainByName = new Map(afChains.map((c) => [norm(c.name), c.id]));
    const chainMap = new Map<string, string>();
    let newChains = 0;
    for (const c of await db.select().from(s.chains).where(eq(s.chains.agencyId, src.id))) {
      let id = chainByName.get(norm(c.name));
      if (!id) {
        [{ id }] = await db.insert(s.chains).values({ agencyId: af.id, name: c.name, status: c.status }).returning({ id: s.chains.id });
        chainByName.set(norm(c.name), id);
        newChains++;
      }
      chainMap.set(c.id, id);
    }

    // Mix por rede.
    const mixMap = new Map<string, string>();
    let newMixes = 0;
    for (const m of await db.select().from(s.productMixes).where(inArray(s.productMixes.brandId, srcBrandIds))) {
      const chainId = chainMap.get(m.chainId);
      if (!chainId) continue;
      const ids = [...new Set(m.productIds.map((id) => productMap.get(id)).filter((x): x is string => Boolean(x)))];
      const [hit] = await db
        .select({ id: s.productMixes.id })
        .from(s.productMixes)
        .where(and(eq(s.productMixes.chainId, chainId), eq(s.productMixes.brandId, target.id), sql`lower(${s.productMixes.name}) = ${m.name.toLowerCase()}`));
      if (hit) {
        mixMap.set(m.id, hit.id);
        continue;
      }
      const [row] = await db.insert(s.productMixes).values({ agencyId: af.id, chainId, brandId: target.id, name: m.name, productIds: ids }).returning({ id: s.productMixes.id });
      mixMap.set(m.id, row.id);
      newMixes++;
    }

    // Lojas (menos as de demonstração): por rede + nome + cidade, ou rede + código.
    const afStores = await db.select().from(s.stores).where(eq(s.stores.agencyId, af.id));
    const storeKey = (chainId: string | null, name: string, city: string) => `${chainId ?? "-"}|${norm(name)}|${norm(city)}`;
    const storeByKey = new Map(afStores.map((st) => [storeKey(st.chainId, st.name, st.city), st.id]));
    const storeByCode = new Map(afStores.filter((st) => st.code).map((st) => [`${st.chainId ?? "-"}|${st.code!.toLowerCase()}`, st.id]));
    let newStores = 0;
    let linked = 0;
    const srcStores = (await db.select().from(s.stores).where(eq(s.stores.agencyId, src.id))).filter((st) => !st.code?.startsWith("DEMO-"));
    for (const st of srcStores) {
      const chainId = st.chainId ? chainMap.get(st.chainId) ?? null : null;
      let id = storeByKey.get(storeKey(chainId, st.name, st.city)) ?? (st.code ? storeByCode.get(`${chainId ?? "-"}|${st.code.toLowerCase()}`) : undefined);
      if (!id) {
        [{ id }] = await db
          .insert(s.stores)
          .values({ agencyId: af.id, chainId, name: st.name, code: st.code, cnpj: st.cnpj, address: st.address, district: st.district, city: st.city, state: st.state, lat: st.lat, lng: st.lng, geoSource: st.geoSource, status: st.status, rules: st.rules, notes: st.notes })
          .returning({ id: s.stores.id });
        storeByKey.set(storeKey(chainId, st.name, st.city), id);
        newStores++;
      }
      // Marca autorizada na loja, formato escolhido e lista de produtos da loja.
      const links = await db.select().from(s.storeBrands).where(and(eq(s.storeBrands.storeId, st.id), inArray(s.storeBrands.brandId, srcBrandIds)));
      if (links.length) {
        const added = await db.insert(s.storeBrands).values({ storeId: id, brandId: target.id, visitsPerPeriod: links[0].visitsPerPeriod, period: links[0].period }).onConflictDoNothing().returning();
        linked += added.length;
      }
      const [mix] = await db.select().from(s.storeMixes).where(and(eq(s.storeMixes.storeId, st.id), inArray(s.storeMixes.brandId, srcBrandIds)));
      if (mix && mixMap.get(mix.mixId)) await db.insert(s.storeMixes).values({ storeId: id, brandId: target.id, mixId: mixMap.get(mix.mixId)!, chosenAt: mix.chosenAt }).onConflictDoNothing();
      const list = await db.select({ productId: s.storeProducts.productId }).from(s.storeProducts).where(eq(s.storeProducts.storeId, st.id));
      const mapped = list.map((r) => productMap.get(r.productId)).filter((x): x is string => Boolean(x));
      if (mapped.length) await db.insert(s.storeProducts).values(mapped.map((productId) => ({ storeId: id!, productId }))).onConflictDoNothing();
    }
    console.log(
      `[dados] Costa Foods → AF: ${newProducts} produto(s), ${newChains} rede(s), ${newMixes} mix, ${newStores} loja(s) novas; marca liberada em ${linked} loja(s). Confira e exclua a agência ${src.name} em MCX › Agências.`,
    );
  }
}

/**
 * Sistemática e relatório mensal ligados na ETROS (pedido dela). Só liga se o
 * módulo nunca foi definido — se a equipe MCX desligar depois, fica desligado.
 */
export async function etrosSystematic() {
  const db = await getDb();
  const etros = (await db.select().from(s.agencies).where(eq(s.agencies.kind, "client"))).filter((a) => norm(a.name).startsWith("ETROS"));
  for (const a of etros) {
    const settings = (a.settings ?? {}) as { modules?: Record<string, unknown> };
    if (settings.modules && "sistematica" in settings.modules) continue;
    await db
      .update(s.agencies)
      .set({ settings: { ...settings, modules: { ...(settings.modules ?? {}), sistematica: true } }, updatedAt: new Date() })
      .where(eq(s.agencies.id, a.id));
    console.log(`[dados] Sistemática ligada em ${a.name}.`);
  }
}

async function main() {
  for (const [name, job] of [
    ["Sistemática Etros", etrosSystematic],
    ["endereços", storeAddresses],
    ["Ygloo", yglooBrand],
    ["Costa Foods", costaFoodsToAf],
  ] as const) {
    try {
      await job();
    } catch (err) {
      console.error(`[dados] ${name}: ${(err as Error).message ?? err}`);
    }
  }
  process.exit(0);
}

// Importado pelos testes: só roda as cargas quando chamado como script.
if (process.argv[1]?.includes("setup-data")) void main();
