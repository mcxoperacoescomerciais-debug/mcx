/**
 * Cargas de dados aplicadas no deploy (idempotentes, rodam a cada início):
 *  1. endereços das lojas (scripts/carga/enderecos-lojas.json): preenche endereço,
 *     bairro e posição só onde a loja ainda não tem — nunca sobrescreve;
 *  (a carga inicial da AVIVAR rodou uma vez em 28/10/2026 e saiu daqui: recriava a
 *   agência quando ela era renomeada.)
 *
 * Falhas aqui não impedem o sistema de subir.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, isNull, or, sql } from "drizzle-orm";
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

async function main() {
  for (const [name, job] of [
    ["endereços", storeAddresses],
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
