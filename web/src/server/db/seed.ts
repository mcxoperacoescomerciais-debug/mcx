/**
 * Dados de demonstração — só rodam no banco embutido de desenvolvimento
 * (PGlite) e só se o banco estiver vazio. Em produção o banco começa limpo
 * e é populado pela importação de Excel/CSV (ver scripts/bootstrap.ts).
 *
 * Lojas, cidades e produtos foram tirados dos relatórios reais de WhatsApp;
 * quantidades e datas são geradas por um gerador pseudoaleatório com semente
 * fixa, então o resultado é sempre o mesmo.
 *
 * Usuários de demonstração: ver DEMO_USERS abaixo. A senha é a variável de
 * ambiente DEMO_PASSWORD (padrão no README de desenvolvimento).
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import type { DB } from "./index";
import * as s from "./schema";
import { addDays, classify, todayIso } from "../../lib/validity";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import type { DamageKind, RuptureKind } from "../../lib/domain";
import { applyMix, type MixPayload } from "../import/apply-mix";
import type { StoreFormat } from "../import/mix-workbook";
import catalog from "./catalog-suinco.json";

const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "suinco123";

export const DEMO_USERS = [
  { username: "admin", name: "Eduardo Sampaio", role: "admin" as const },
  { username: "gestor.af", name: "Adriana Fontes", role: "agency_manager" as const },
  { username: "gestor.suinco", name: "Gerente SUINCO", role: "client_manager" as const },
  { username: "joao", name: "João Pereira", role: "promoter" as const },
  { username: "patricia", name: "Patrícia Lima", role: "promoter" as const },
  { username: "lucas", name: "Lucas Andrade", role: "promoter" as const },
];

const CITY_COORDS: Record<string, [number, number]> = {
  Formiga: [-20.4644, -45.4266],
  Itaúna: [-20.0753, -44.5765],
  Arcos: [-20.2863, -45.5401],
  "Pará de Minas": [-19.8601, -44.6081],
  "Lagoa da Prata": [-20.0225, -45.5439],
  Divinópolis: [-20.1446, -44.8912],
  "Bom Despacho": [-19.7365, -45.2522],
  "Nova Serrana": [-19.8758, -44.9842],
};

const STORES: { network: string; format: StoreFormat; name: string; code: string; city: string; promoter: string }[] = [
  { network: "Super ABC", format: "varejo", name: "ABC Formiga", code: "63", city: "Formiga", promoter: "joao" },
  { network: "Super ABC", format: "plus", name: "ABC Formiga Centro", code: "08", city: "Formiga", promoter: "joao" },
  { network: "Super ABC", format: "cash", name: "ABC Itaúna", code: "71", city: "Itaúna", promoter: "patricia" },
  { network: "Super ABC", format: "varejo", name: "ABC Lagoa da Prata", code: "20", city: "Lagoa da Prata", promoter: "joao" },
  { network: "Super ABC", format: "cash", name: "ABC Divinópolis", code: "12", city: "Divinópolis", promoter: "patricia" },
  { network: "Super ABC", format: "plus", name: "ABC Bom Despacho", code: "33", city: "Bom Despacho", promoter: "lucas" },
  { network: "Super BH", format: "varejo", name: "BH Arcos", code: "24", city: "Arcos", promoter: "joao" },
  { network: "Super BH", format: "varejo", name: "BH Pará de Minas", code: "144", city: "Pará de Minas", promoter: "lucas" },
  { network: "Super BH", format: "varejo", name: "BH Divinópolis", code: "98", city: "Divinópolis", promoter: "patricia" },
  { network: "Super BH", format: "varejo", name: "BH Nova Serrana", code: "151", city: "Nova Serrana", promoter: "lucas" },
  { network: "Super BH", format: "varejo", name: "BH Itaúna", code: "117", city: "Itaúna", promoter: "patricia" },
  { network: "Super BH", format: "varejo", name: "BH Lagoa da Prata", code: "160", city: "Lagoa da Prata", promoter: "joao" },
];

/** Gerador pseudoaleatório determinístico (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoIfEmpty(db: DB): Promise<void> {
  const [{ value }] = await db.select({ value: count() }).from(s.tenants);
  if (value > 0) return;
  await seedDemo(db);
}

async function seedDemo(db: DB): Promise<void> {
  const rand = rng(20260929);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1));

  const [tenant] = await db.insert(s.tenants).values({ name: "AF Merchandising", slug: "af" }).returning();
  const [client] = await db
    .insert(s.clients)
    .values({ tenantId: tenant.id, name: "SUINCO", slug: "suinco" })
    .returning();
  await db.insert(s.clientSettings).values({ clientId: client.id, settings: DEFAULT_SETTINGS });

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const [row] = await db
      .insert(s.users)
      .values({ tenantId: tenant.id, role: u.role, name: u.name, username: u.username, passwordHash: hash })
      .returning({ id: s.users.id });
    userIds[u.username] = row.id;
    await db.insert(s.userClients).values({ userId: row.id, clientId: client.id });
  }

  const networkIds: Record<string, string> = {};
  for (const name of [...new Set(STORES.map((st) => st.network))]) {
    const [row] = await db
      .insert(s.networks)
      .values({ tenantId: tenant.id, clientId: client.id, name })
      .returning({ id: s.networks.id });
    networkIds[name] = row.id;
  }

  // Catálogo e mix reais (planilhas de MIX da SUINCO, ver scripts/build-catalog.ts).
  for (const [network, payload] of Object.entries(catalog as Record<string, MixPayload>)) {
    await applyMix(db, { tenantId: tenant.id, clientId: client.id, networkId: networkIds[network] }, payload);
  }
  const mixRows = await db.select({ networkId: s.productMixes.networkId, format: s.productMixes.format, productId: s.productMixes.productId }).from(s.productMixes);
  const mixFor = (networkId: string, format: string) => mixRows.filter((m) => m.networkId === networkId && m.format === format).map((m) => m.productId);

  const storeRows: { id: string; promoter: string; mix: string[] }[] = [];
  for (const st of STORES) {
    const [lat, lng] = CITY_COORDS[st.city];
    const [row] = await db
      .insert(s.stores)
      .values({
        tenantId: tenant.id,
        clientId: client.id,
        networkId: networkIds[st.network],
        format: st.format,
        name: st.name,
        code: st.code,
        city: st.city,
        state: "MG",
        lat: lat + (rand() - 0.5) * 0.02,
        lng: lng + (rand() - 0.5) * 0.02,
      })
      .returning({ id: s.stores.id });
    await db.insert(s.storeAssignments).values({ userId: userIds[st.promoter], storeId: row.id });
    storeRows.push({ id: row.id, promoter: st.promoter, mix: mixFor(networkIds[st.network], st.format) });
  }

  // ~6 semanas de histórico, 2 visitas por loja por semana.
  const today = todayIso();
  const bands = DEFAULT_SETTINGS.bands;
  // Algumas lojas são "problemáticas" de propósito, para o dashboard ter o que mostrar.
  const troubled = new Set([storeRows[0].id, storeRows[7].id, storeRows[2].id]);

  for (let dayOffset = 42; dayOffset >= 1; dayOffset--) {
    const visitDate = addDays(today, -dayOffset);
    const weekday = new Date(`${visitDate}T12:00:00Z`).getUTCDay();
    if (weekday === 0) continue;
    for (const store of storeRows) {
      if (rand() > 0.33) continue;
      const visitId = randomUUID();
      const promoterId = userIds[store.promoter];
      const startHour = between(8, 16);
      const startedAt = new Date(`${visitDate}T${String(startHour + 3).padStart(2, "0")}:${String(between(0, 59)).padStart(2, "0")}:00Z`);
      const finishedAt = new Date(startedAt.getTime() + between(15, 50) * 60_000);
      await db.insert(s.visits).values({
        id: visitId,
        tenantId: tenant.id,
        clientId: client.id,
        storeId: store.id,
        promoterId,
        visitDate,
        startedAt,
        finishedAt,
        status: "finished",
        checklist: { sales_floor: true, stock: true, validity: true, rupture: true, damage: true },
        notes: rand() < 0.15 ? "Gerente da loja informado sobre os itens próximos ao vencimento." : null,
        createdBy: promoterId,
      });

      const isTroubled = troubled.has(store.id);
      const occRows: (typeof s.occurrences.$inferInsert)[] = [];
      const base = { tenantId: tenant.id, clientId: client.id, visitId, storeId: store.id, createdBy: promoterId };
      const itemCount = between(3, 8);
      for (let i = 0; i < itemCount; i++) {
        const productId = pick(store.mix);
        const days = isTroubled ? between(-4, 40) : between(-1, 70);
        const expiryDate = addDays(visitDate, days);
        const inStock = rand() < 0.25;
        occRows.push({
          ...base,
          id: randomUUID(),
          productId,
          type: "validity",
          location: inStock ? "stock" : "sales_floor",
          quantity: inStock ? between(1, 28) : between(2, 120),
          unit: inStock ? "cx" : "un",
          expiryDate,
          daysToExpiry: days,
          severity: classify(days, bands),
        });
      }
      if (rand() < (isTroubled ? 0.6 : 0.25)) {
        occRows.push({
          ...base,
          id: randomUUID(),
          productId: pick(store.mix),
          type: "rupture",
          ruptureKind: pick<RuptureKind>(["total", "total", "partial", "not_found", "empty_space"]),
        });
      }
      if (rand() < (isTroubled ? 0.35 : 0.12)) {
        occRows.push({
          ...base,
          id: randomUUID(),
          productId: pick(store.mix),
          type: "damage",
          quantity: between(1, 6),
          damageKind: pick<DamageKind>(["damaged_package", "crushed", "leak", "violated"]),
          notes: "Embalagem com perda de vácuo.",
        });
      }
      // Ocorrências antigas: parte já tratada pelo gestor.
      for (const o of occRows) {
        if (dayOffset > 10 && rand() < 0.6) o.status = "resolved";
      }
      await db.insert(s.occurrences).values(occRows);
    }
  }
  console.log("[seed] Banco de demonstração criado.");
}
