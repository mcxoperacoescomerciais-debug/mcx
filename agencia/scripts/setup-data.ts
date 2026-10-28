/**
 * Cargas de dados aplicadas no deploy (idempotentes, rodam a cada início):
 *  1. endereços das lojas (scripts/data/enderecos-lojas.json): preenche endereço,
 *     bairro e posição só onde a loja ainda não tem — nunca sobrescreve;
 *  2. agência AVIVAR (marca única): agência com Degustações e Financeiro
 *     desligados e visão geral executiva, marca, 106 produtos, mix de 14 redes e
 *     os dados de demonstração (promotor fictício em Divinópolis). Só cria se a
 *     agência ainda não existe. Nenhum login é criado: a equipe MCX entra pela
 *     tela MCX › Agências; o administrador da agência é criado por lá.
 *
 * Falhas aqui não impedem o sistema de subir.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull, like, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "../src/server/db";
import { scopeForUser } from "../src/server/auth";
import { saveBrand } from "../src/server/admin";
import { runImport } from "../src/server/import";
import { seedOperationDemo } from "../src/server/demo-operation";
import { mergeSettings } from "../src/lib/settings";

const data = (file: string) => JSON.parse(readFileSync(path.join(process.cwd(), "scripts", "data", file), "utf8"));
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

const AVIVAR = "AVIVAR";

async function avivar() {
  const db = await getDb();
  const [exists] = await db.select({ id: s.agencies.id }).from(s.agencies).where(and(eq(s.agencies.kind, "client"), sql`upper(${s.agencies.name}) = ${AVIVAR}`));
  if (exists) return;
  const [owner] = await db
    .select({ id: s.users.id, agencyId: s.users.agencyId, role: s.users.role })
    .from(s.users)
    .where(and(eq(s.users.platform, true), eq(s.users.status, "active")))
    .orderBy(sql`case when ${s.users.platformRole} = 'owner' then 0 else 1 end`)
    .limit(1);
  if (!owner) return console.log("[dados] AVIVAR: sem usuário da equipe MCX para registrar a criação.");

  const settings = mergeSettings({ modules: { tastings: false, finance: false }, overviewStyle: "executive" });
  const [slugTaken] = await db.select({ id: s.agencies.id }).from(s.agencies).where(like(s.agencies.slug, "avivar%"));
  const [agency] = await db
    .insert(s.agencies)
    .values({ name: AVIVAR, slug: slugTaken ? `avivar-${Date.now().toString(36).slice(-4)}` : "avivar", kind: "client", settings })
    .returning();
  await db.insert(s.auditLogs).values({ agencyId: agency.id, userId: owner.id, entity: "agency", entityId: agency.id, action: "created", reason: "Carga inicial AVIVAR no deploy" });
  const scope = await scopeForUser({ ...owner, platform: true }, agency.id);

  const brand = await saveBrand(scope, {
    id: null,
    name: AVIVAR,
    code: AVIVAR,
    status: "active",
    minBeforePhotos: 1,
    minAfterPhotos: 1,
    requireStock: true,
    rupturePhotoRequired: false,
    allowGallery: false,
    activities: [],
    notes: null,
  });
  if (!brand.ok) throw new Error(`marca: ${brand.error}`);
  const products = await runImport(scope, "produtos", data("avivar-produtos.json"), false);
  const mix = await runImport(scope, "mix", data("avivar-mix.json"), false);
  const demo = await seedOperationDemo(scope);
  console.log(
    `[dados] AVIVAR criada: ${products.created} produto(s), mix ${mix.created + mix.updated} (${mix.errors.length} erro(s)), demonstração: ${demo.ok ? "ok" : demo.error}.`,
  );
  for (const e of [...products.errors, ...mix.errors].slice(0, 10)) console.log(`[dados]   linha ${e.line}: ${e.message}`);
}

async function main() {
  for (const [name, job] of [
    ["endereços", storeAddresses],
    ["AVIVAR", avivar],
  ] as const) {
    try {
      await job();
    } catch (err) {
      console.error(`[dados] ${name}: ${(err as Error).message ?? err}`);
    }
  }
  process.exit(0);
}

void main();
