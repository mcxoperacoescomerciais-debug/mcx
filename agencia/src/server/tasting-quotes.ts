/**
 * Orçamentos da calculadora de degustação: salvos para reabrir, comparar e
 * mostrar à marca. Os números são recalculados na tela a partir dos insumos.
 */
import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import type { ActionResult } from "./manager";
import { canManageTastings } from "./tastings";
import { DEFAULT_FUEL_PRICE, normalizeCity, type CalcCity, type CalcGlobals } from "@/lib/tasting-calc";

const fail = (error: string): ActionResult => ({ ok: false, error });

export async function listQuotes(scope: Scope) {
  const db = await getDb();
  return db
    .select({ id: s.tastingQuotes.id, name: s.tastingQuotes.name, brandName: s.brands.name, cities: s.tastingQuotes.cities, updatedAt: s.tastingQuotes.updatedAt })
    .from(s.tastingQuotes)
    .leftJoin(s.brands, eq(s.brands.id, s.tastingQuotes.brandId))
    .where(eq(s.tastingQuotes.agencyId, scope.agencyId))
    .orderBy(desc(s.tastingQuotes.updatedAt))
    .limit(50);
}

export async function getQuote(scope: Scope, id: string) {
  const db = await getDb();
  const [q] = await db.select().from(s.tastingQuotes).where(and(eq(s.tastingQuotes.id, id), eq(s.tastingQuotes.agencyId, scope.agencyId)));
  return q ?? null;
}

const num = (v: unknown, max = 1_000_000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : 0);

function cleanCities(raw: unknown): CalcCity[] {
  return Array.isArray(raw) ? raw.slice(0, 60).map(normalizeCity) : [];
}

export async function saveQuote(scope: Scope, id: string | null, i: { name: string; brandId: string | null; globals: CalcGlobals; cities: unknown; notes: string | null }): Promise<ActionResult & { id?: string }> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const name = i.name.trim();
  if (name.length < 2) return fail("Dê um nome ao orçamento (ex.: Suinco · novembro · 5 cidades).");
  const cities = cleanCities(i.cities);
  if (!cities.length) return fail("Inclua ao menos uma cidade.");
  const globals = { taxPct: num(i.globals.taxPct, 99), adminPct: 0, marginPct: num(i.globals.marginPct, 99), fuelPrice: num(i.globals.fuelPrice ?? DEFAULT_FUEL_PRICE, 100) };
  const db = await getDb();
  if (i.brandId) {
    const [b] = await db.select({ id: s.brands.id }).from(s.brands).where(and(eq(s.brands.id, i.brandId), eq(s.brands.agencyId, scope.agencyId)));
    if (!b) return fail("Marca não encontrada.");
  }
  const values = { name, brandId: i.brandId, globals, cities, notes: i.notes?.trim() || null, updatedAt: new Date(), updatedBy: scope.userId };
  if (id) {
    const r = await db.update(s.tastingQuotes).set(values).where(and(eq(s.tastingQuotes.id, id), eq(s.tastingQuotes.agencyId, scope.agencyId))).returning({ id: s.tastingQuotes.id });
    if (!r.length) return fail("Orçamento não encontrado.");
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_quote", id, "updated", { after: { name, cities: cities.length } });
    return { ok: true, message: "Orçamento salvo.", id };
  }
  const [row] = await db.insert(s.tastingQuotes).values({ ...values, agencyId: scope.agencyId, createdBy: scope.userId }).returning({ id: s.tastingQuotes.id });
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_quote", row.id, "created", { after: { name, cities: cities.length } });
  return { ok: true, message: "Orçamento salvo.", id: row.id };
}

export async function deleteQuote(scope: Scope, id: string): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const db = await getDb();
  const r = await db.delete(s.tastingQuotes).where(and(eq(s.tastingQuotes.id, id), eq(s.tastingQuotes.agencyId, scope.agencyId))).returning({ id: s.tastingQuotes.id });
  if (!r.length) return fail("Orçamento não encontrado.");
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_quote", id, "deleted");
  return { ok: true, message: "Orçamento apagado." };
}

/** Referências para preencher a calculadora: cachê médio das degustadoras por cidade e as cidades conhecidas. */
export async function calcReferences(scope: Scope) {
  const db = await getDb();
  const tasters = await db
    .select({ city: s.tasters.city, fee: s.tasters.usualFee })
    .from(s.tasters)
    .where(and(eq(s.tasters.agencyId, scope.agencyId), eq(s.tasters.status, "active"), eq(s.tasters.sample, false)));
  const stores = await db.selectDistinct({ city: s.stores.city }).from(s.stores).where(eq(s.stores.agencyId, scope.agencyId)).orderBy(asc(s.stores.city));
  const byCity = new Map<string, { sum: number; n: number; people: number }>();
  for (const t of tasters) {
    const k = t.city.trim();
    const g = byCity.get(k) ?? { sum: 0, n: 0, people: 0 };
    g.people++;
    if (t.fee !== null) {
      g.sum += t.fee;
      g.n++;
    }
    byCity.set(k, g);
  }
  const fees = Object.fromEntries([...byCity].map(([city, g]) => [city, { avgFee: g.n ? Math.round((g.sum / g.n) * 100) / 100 : null, tasters: g.people }]));
  const cities = [...new Set([...stores.map((x) => x.city), ...byCity.keys()])].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { fees, cities };
}
