/**
 * Cadastra os promotores e as lojas da planilha de rotas (Rotas_Promotores_Todos_1),
 * só redes com SUINCO: Super ABC, Super BH e Economart.
 *
 *   DATABASE_URL=postgres://... npx tsx --tsconfig tsconfig.scripts.json scripts/import-rotas.ts
 *
 * Login = primeiro nome (minúsculo, sem acento); senha = igual ao login.
 * Lojas ABC entram com formato "" (a definir): o promotor escolhe Varejo, Plus
 * ou Cash na primeira visita. Idempotente: pode rodar de novo sem duplicar.
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as s from "../src/server/db/schema";

type Net = "abc" | "bh" | "eco";
type StoreDef = { net: Net; name: string; code?: string; city: string };

const NETWORK_NAME: Record<Net, string> = { abc: "Super ABC", bh: "Super BH", eco: "Economart" };

const STORES: Record<string, StoreDef> = {
  abc12: { net: "abc", name: "Hiper ABC", code: "12", city: "Pará de Minas" },
  bh250: { net: "bh", name: "Super BH Atacado", code: "250", city: "Pará de Minas" },
  bh144: { net: "bh", name: "Super BH", code: "144", city: "Pará de Minas" },
  bhPitangui: { net: "bh", name: "Super BH", city: "Pitangui" },
  abc31: { net: "abc", name: "Hiper ABC", code: "31", city: "Santo Antônio do Monte" },
  abc13: { net: "abc", name: "Super ABC", code: "13", city: "Santo Antônio do Monte" },
  bhBambui: { net: "bh", name: "Super BH", city: "Bambuí" },
  abcBambui: { net: "abc", name: "Super ABC", city: "Bambuí" },
  bhItatiaiucu: { net: "bh", name: "Super BH", city: "Itatiaiuçu" },
  bhMartinho: { net: "bh", name: "Super BH", city: "Martinho Campos" },
  abc28: { net: "abc", name: "Super ABC", code: "28", city: "Piumhi" },
  bh219: { net: "bh", name: "Super BH", code: "219", city: "Piumhi" },
  bhCapitolio: { net: "bh", name: "Super BH", city: "Capitólio" },
  abc08: { net: "abc", name: "Super ABC", code: "08", city: "Formiga" },
  abc63: { net: "abc", name: "Super ABC", code: "63", city: "Formiga" },
  bhFormiga: { net: "bh", name: "Super BH", city: "Formiga" },
  abc20: { net: "abc", name: "Super ABC", code: "20", city: "Lagoa da Prata" },
  bh113: { net: "bh", name: "Super BH", code: "113", city: "Lagoa da Prata" },
  bh184: { net: "bh", name: "Super BH", code: "184", city: "Lagoa da Prata" },
  abc30: { net: "abc", name: "Hiper ABC", code: "30", city: "Arcos" },
  abc14: { net: "abc", name: "Super ABC", code: "14", city: "Arcos" },
  bhArcos: { net: "bh", name: "Super BH", city: "Arcos" },
  bhBomDespacho: { net: "bh", name: "Super BH", city: "Bom Despacho" },
  bhCajuru: { net: "bh", name: "Super BH", city: "Carmo do Cajuru" },
  abc29: { net: "abc", name: "Hiper ABC", code: "29", city: "Campo Belo" },
  abc67: { net: "abc", name: "Super ABC", code: "67", city: "Campo Belo" },
  abc10: { net: "abc", name: "Super ABC", code: "10", city: "Campo Belo" },
  abc77: { net: "abc", name: "Super ABC", code: "77", city: "Candeias" },
  abc09: { net: "abc", name: "Super ABC R. Passos", code: "09", city: "Oliveira" },
  abc22: { net: "abc", name: "Hiper ABC", code: "22", city: "Oliveira" },
  bhMateusLeme: { net: "bh", name: "Super BH", city: "Mateus Leme" },
  bhJuatuba: { net: "bh", name: "Super BH", city: "Juatuba" },
  bhNovoJuatuba: { net: "bh", name: "Super BH Novo Juatuba", city: "Juatuba" },
  abcClaudio: { net: "abc", name: "Super ABC", city: "Cláudio" },
  abcAtacadoItauna: { net: "abc", name: "ABC Atacado", city: "Itaúna" },
  abcZeze: { net: "abc", name: "Super ABC Zezé", city: "Itaúna" },
  abcPraca: { net: "abc", name: "Super ABC Praça", city: "Itaúna" },
  bh616: { net: "bh", name: "Super BH Pio XII", code: "616", city: "Itaúna" },
  bhJK: { net: "bh", name: "Super BH JK", city: "Itaúna" },
  bhCarmopolis: { net: "bh", name: "Super BH", city: "Carmópolis de Minas" },
  abcNovaSerrana: { net: "abc", name: "Super ABC", city: "Nova Serrana" },
  bhRodovia: { net: "bh", name: "Super BH Rodovia", city: "Nova Serrana" },
  ecoNovaSerrana: { net: "eco", name: "Economart", city: "Nova Serrana" },
  abcPerdigao: { net: "abc", name: "Super ABC Centro", city: "Perdigão" },
};

const PROMOTERS: { username: string; name: string; stores: (keyof typeof STORES)[] }[] = [
  { username: "sthefane", name: "Sthefane", stores: ["abc12", "bh250", "bh144"] },
  { username: "aderlania", name: "Aderlania", stores: ["bhPitangui"] },
  { username: "paulo", name: "Paulo (Santo Antônio do Monte)", stores: ["abc31", "abc13"] },
  { username: "isabela", name: "Isabela", stores: ["bhBambui", "abcBambui"] },
  { username: "fabiana", name: "Fabiana", stores: ["bhMartinho"] },
  { username: "evaldo", name: "Evaldo", stores: ["abc28", "bh219"] },
  { username: "barbara", name: "Barbara", stores: ["bhCapitolio"] },
  { username: "diogo", name: "Diogo", stores: ["abc08", "abc63", "bhFormiga"] },
  { username: "cecilia", name: "Cecilia", stores: ["abc20", "bh113", "bh184"] },
  { username: "daniel", name: "Daniel", stores: ["abc30", "abc14", "bhArcos"] },
  { username: "rogerio", name: "Rogerio", stores: ["bhBomDespacho"] },
  { username: "joao", name: "João Vitor", stores: ["bhCajuru"] },
  { username: "juliano", name: "Juliano", stores: ["abc29", "abc67", "abc10", "abc77"] },
  { username: "karina", name: "Karina", stores: ["abc09", "abc22"] },
  { username: "duane", name: "Duane Henrique", stores: ["bhMateusLeme", "bhJuatuba", "bhNovoJuatuba"] },
  { username: "paulo2", name: "Paulo (Cláudio)", stores: ["abcClaudio"] },
  { username: "marcilia", name: "Marcília", stores: ["abcAtacadoItauna", "bh616", "abcZeze", "abcPraca", "bhJK"] },
  { username: "sharon", name: "Sharon", stores: ["bhCarmopolis"] },
  { username: "laura", name: "Laura", stores: ["bhRodovia", "abcNovaSerrana", "abcPerdigao"] },
  { username: "hyara", name: "Hyara", stores: ["ecoNovaSerrana", "abcNovaSerrana", "bhRodovia"] },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...).");
  const conn = postgres(url, { max: 1 });
  const db = drizzle(conn, { schema: s });

  const [client] = await db.select().from(s.clients).where(eq(s.clients.slug, "suinco"));
  if (!client) throw new Error("Cliente SUINCO não encontrado — rode o db:bootstrap antes.");
  const [admin] = await db.select().from(s.users).where(eq(s.users.role, "admin")).limit(1);
  const by = admin?.id ?? null;

  const netIds = {} as Record<Net, string>;
  for (const [k, name] of Object.entries(NETWORK_NAME) as [Net, string][]) {
    let [n] = await db.select().from(s.networks).where(and(eq(s.networks.clientId, client.id), sql`lower(${s.networks.name}) = lower(${name})`));
    if (!n) [n] = await db.insert(s.networks).values({ tenantId: client.tenantId, clientId: client.id, name, createdBy: by }).returning();
    netIds[k] = n.id;
  }

  const storeIds: Record<string, string> = {};
  let storesCreated = 0;
  for (const [key, d] of Object.entries(STORES)) {
    const codeCond = d.code ? eq(s.stores.code, d.code) : isNull(s.stores.code);
    let [st] = await db
      .select()
      .from(s.stores)
      .where(and(eq(s.stores.clientId, client.id), eq(s.stores.networkId, netIds[d.net]), eq(s.stores.name, d.name), eq(s.stores.city, d.city), codeCond));
    if (!st) {
      [st] = await db
        .insert(s.stores)
        .values({ tenantId: client.tenantId, clientId: client.id, networkId: netIds[d.net], format: d.net === "abc" ? "" : "varejo", name: d.name, code: d.code ?? null, city: d.city, state: "MG", createdBy: by })
        .returning();
      storesCreated++;
    }
    storeIds[key] = st.id;
  }

  let usersCreated = 0;
  for (const p of PROMOTERS) {
    let [u] = await db.select().from(s.users).where(sql`lower(${s.users.username}) = ${p.username}`);
    if (!u) {
      [u] = await db
        .insert(s.users)
        .values({ tenantId: client.tenantId, role: "promoter", name: p.name, username: p.username, passwordHash: await bcrypt.hash(p.username, 10), createdBy: by })
        .returning();
      usersCreated++;
    } else if (u.role !== "promoter") {
      console.warn(`! ${p.username} já existe como ${u.role}; mantido sem alterar.`);
      continue;
    }
    await db.insert(s.userClients).values({ userId: u.id, clientId: client.id }).onConflictDoNothing();
    for (const k of p.stores) await db.insert(s.storeAssignments).values({ userId: u.id, storeId: storeIds[k] }).onConflictDoNothing();
  }

  console.log(`Redes: ${Object.values(NETWORK_NAME).join(", ")}. Lojas novas: ${storesCreated}/${Object.keys(STORES).length}. Promotores novos: ${usersCreated}/${PROMOTERS.length}.`);
  await conn.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
