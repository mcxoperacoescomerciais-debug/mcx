/**
 * Dados de demonstração da operação (apresentação para a marca): um promotor
 * fictício com lojas em Divinópolis, visitas das últimas duas semanas e de hoje,
 * com estoque, ruptura (área de vendas e depósito), validades (inclusive datas
 * críticas), avarias e lojas não atendidas — para os painéis e relatórios terem
 * o que mostrar. Usa as marcas e os produtos já cadastrados na agência.
 *
 * Tudo fica marcado (lojas com código DEMO-, promotor "demo.<agência>") e o
 * botão "Apagar" remove exatamente isso. O promotor não tem senha conhecida:
 * para entrar no app com ele, o gestor define uma senha em Usuários.
 */
import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import { hashPassword, type Scope } from "./auth";
import { audit } from "./audit";
import type { ActionResult } from "./manager";
import { addDays, todayIso, weekdayOf } from "@/lib/dates";
import { classify } from "@/lib/validity";

const CODE_PREFIX = "DEMO-";
const CITY = "Divinópolis";
/** Lojas de demonstração em Divinópolis (redes da operação de MG). */
const STORES: { chain: string; name: string; district: string; lat: number; lng: number }[] = [
  { chain: "ABC VAREJO", name: "ABC VAREJO - DIVINÓPOLIS CENTRO", district: "Centro", lat: -20.1426, lng: -44.8846 },
  { chain: "ABC VAREJO", name: "ABC VAREJO - DIVINÓPOLIS NITERÓI", district: "Niterói", lat: -20.1556, lng: -44.8763 },
  { chain: "SUPERMERCADOS BH", name: "SUPERMERCADOS BH - DIVINÓPOLIS", district: "Bom Pastor", lat: -20.1335, lng: -44.8967 },
  { chain: "MART MINAS", name: "MART MINAS - DIVINÓPOLIS", district: "Santa Clara", lat: -20.1619, lng: -44.8996 },
  { chain: "VILLEFORT", name: "VILLEFORT - DIVINÓPOLIS", district: "São José", lat: -20.1288, lng: -44.8805 },
  { chain: "SUPERMERCADOS RENA", name: "SUPERMERCADOS RENA - DIVINÓPOLIS", district: "Porto Velho", lat: -20.1511, lng: -44.9049 },
  { chain: "CARREFOUR", name: "CARREFOUR - DIVINÓPOLIS", district: "Bela Vista", lat: -20.1375, lng: -44.8711 },
  { chain: "ABC CASH", name: "ABC CASH - DIVINÓPOLIS", district: "Interlagos", lat: -20.1703, lng: -44.8862 },
];
const SITUATIONS = ["shelf_empty", "shelf_empty", "total", "total", "backroom_empty", "missing_display"] as const;
const DAMAGE_KINDS = ["damaged_package", "violated", "no_vacuum", "strange_color"] as const;

/** Sorteio previsível (mesma semente = mesmos dados). */
function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100_000) / 100_000;
  };
}

const at = (date: string, hh: number, mm: number) => new Date(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`);

export async function operationDemoStatus(scope: Scope) {
  const db = await getDb();
  const stores = await db.select({ id: s.stores.id }).from(s.stores).where(and(eq(s.stores.agencyId, scope.agencyId), like(s.stores.code, `${CODE_PREFIX}%`)));
  const [promoter] = await db.select({ id: s.users.id, username: s.users.username }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.internalCode, "DEMO"), eq(s.users.role, "promoter")));
  return { stores: stores.length, promoter: promoter ?? null };
}

export async function seedOperationDemo(scope: Scope): Promise<ActionResult> {
  if (scope.role !== "admin" && !scope.platform) return { ok: false, error: "Somente administradores." };
  const db = await getDb();
  const status = await operationDemoStatus(scope);
  if (status.stores || status.promoter) return { ok: false, error: "Os dados de demonstração já existem. Apague antes de gerar de novo." };
  const brands = await db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(and(eq(s.brands.agencyId, scope.agencyId), eq(s.brands.status, "active")));
  if (!brands.length) return { ok: false, error: "Cadastre a marca antes de gerar a demonstração." };
  const products = await db
    .select({ id: s.products.id, brandId: s.products.brandId, unit: s.products.unit })
    .from(s.products)
    .where(and(eq(s.products.agencyId, scope.agencyId), eq(s.products.status, "active"), inArray(s.products.brandId, brands.map((b) => b.id))));
  if (!products.length) return { ok: false, error: "Importe os produtos (SKUs) da marca antes de gerar a demonstração." };

  const [agency] = await db.select({ slug: s.agencies.slug }).from(s.agencies).where(eq(s.agencies.id, scope.agencyId));
  const username = `demo.${(agency?.slug ?? "agencia").replace(/[^a-z0-9]+/g, "").slice(0, 20)}`;
  const [taken] = await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
  if (taken) return { ok: false, error: `O usuário ${username} já existe.` };
  const today = todayIso();
  const rand = rng(today.split("-").reduce((n, p) => n * 31 + Number(p), 7));
  const bands = scope.settings.validityBands;

  await db.transaction(async (tx) => {
    // Redes (usa as que já existem com o mesmo nome) e lojas.
    const chainId = new Map<string, string>();
    for (const name of [...new Set(STORES.map((x) => x.chain))]) {
      const [c] = await tx.select({ id: s.chains.id }).from(s.chains).where(and(eq(s.chains.agencyId, scope.agencyId), sql`lower(${s.chains.name}) = ${name.toLowerCase()}`));
      if (c) chainId.set(name, c.id);
      else {
        const [n] = await tx.insert(s.chains).values({ agencyId: scope.agencyId, name }).returning({ id: s.chains.id });
        chainId.set(name, n.id);
      }
    }
    const stores = await tx
      .insert(s.stores)
      .values(STORES.map((x, i) => ({ agencyId: scope.agencyId, chainId: chainId.get(x.chain)!, name: x.name, code: `${CODE_PREFIX}${String(i + 1).padStart(2, "0")}`, city: CITY, state: "MG", district: x.district, address: "Endereço de demonstração", lat: x.lat, lng: x.lng, notes: "Loja de demonstração (dados fictícios)" })))
      .returning({ id: s.stores.id, lat: s.stores.lat, lng: s.stores.lng, name: s.stores.name });
    await tx.insert(s.storeBrands).values(stores.flatMap((st) => brands.map((b) => ({ storeId: st.id, brandId: b.id }))));

    // Promotor fictício (sem senha conhecida).
    const [promoter] = await tx
      .insert(s.users)
      .values({
        agencyId: scope.agencyId,
        role: "promoter",
        name: "Promotor Demonstração",
        username,
        internalCode: "DEMO",
        region: CITY,
        employment: "fixed",
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        mustChangePassword: true,
        geoPermission: "granted",
        geoCheckedAt: new Date(),
        createdBy: scope.userId,
      })
      .returning({ id: s.users.id });
    await tx.insert(s.userStores).values(stores.map((st) => ({ userId: promoter.id, storeId: st.id })));
    await tx.insert(s.userBrands).values(brands.map((b) => ({ userId: promoter.id, brandId: b.id })));

    // Cada loja trabalha com o mix da rede (se importado); senão, com um recorte dos produtos.
    const mixes = await tx.select({ chainId: s.productMixes.chainId, productIds: s.productMixes.productIds }).from(s.productMixes).where(eq(s.productMixes.agencyId, scope.agencyId));
    const storeChain = new Map(STORES.map((x, i) => [stores[i].id, chainId.get(x.chain)!]));
    const mixOf = new Map(
      stores.map((st) => {
        const mix = mixes.find((m) => m.chainId === storeChain.get(st.id));
        const fromMix = mix ? products.filter((p) => mix.productIds.includes(p.id)) : [];
        return [st.id, fromMix.length ? fromMix : products.filter(() => rand() < Math.min(1, 24 / products.length) + 0.15).slice(0, 28)];
      }),
    );
    for (const [id, list] of mixOf) if (!list.length) mixOf.set(id, products.slice(0, 12));

    let lastPos: { lat: number; lng: number } | null = null;
    for (let back = 13; back >= 0; back--) {
      const date = addDays(today, -back);
      if (weekdayOf(date) === 0) continue; // domingo sem programação
      // 4 lojas por dia, em rodízio.
      const dayStores = [0, 1, 2, 3].map((k) => stores[(back * 3 + k) % stores.length]);
      for (const [seq, st] of dayStores.entries()) {
        const planned = `${String(8 + seq * 2).padStart(2, "0")}:00`;
        const [sch] = await tx.insert(s.schedules).values({ agencyId: scope.agencyId, promoterId: promoter.id, storeId: st.id, date, plannedStart: planned, seq: seq + 1, createdBy: scope.userId }).returning({ id: s.schedules.id });
        await tx.insert(s.scheduleBrands).values(brands.map((b) => ({ scheduleId: sch.id, brandId: b.id })));
        // Hoje: duas feitas, uma em andamento, uma ainda no prazo. Antes: ~1 em 9 não atendida.
        if (back === 0 && seq === 3) continue;
        if (back > 0 && rand() < 0.11) continue;
        const start = at(date, 8 + seq * 2, Math.floor(rand() * 25));
        const open = back === 0 && seq === 2;
        const minutes = 35 + Math.floor(rand() * 40);
        const end = new Date(start.getTime() + minutes * 60_000);
        const far = back === 4 && seq === 1; // um check-in longe da loja, para a pendência de presença
        const pos = { lat: st.lat! + (far ? 0.02 : (rand() - 0.5) * 0.0008), lng: st.lng! + (far ? 0.015 : (rand() - 0.5) * 0.0008) };
        lastPos = pos;
        const visitId = randomUUID();
        await tx.insert(s.visits).values({
          id: visitId,
          agencyId: scope.agencyId,
          promoterId: promoter.id,
          storeId: st.id,
          scheduleId: sch.id,
          visitDate: date,
          status: open ? "in_progress" : "completed",
          origin: "scheduled",
          startedAt: start,
          finishedAt: open ? null : end,
          lat: pos.lat,
          lng: pos.lng,
          accuracyM: 8 + Math.floor(rand() * 20),
          geoStatus: "captured",
          createdBy: promoter.id,
          updatedBy: promoter.id,
        });
        const perBrand = Math.max(10, Math.floor(minutes / brands.length));
        for (const [bi, b] of brands.entries()) {
          const aStart = new Date(start.getTime() + bi * perBrand * 60_000 + 60_000);
          const aEnd = new Date(aStart.getTime() + (perBrand - 2) * 60_000);
          const attId = randomUUID();
          const done = !(open && bi === brands.length - 1);
          await tx.insert(s.attendances).values({ id: attId, agencyId: scope.agencyId, visitId, brandId: b.id, status: done ? "completed" : "in_progress", startedAt: aStart, finishedAt: done ? aEnd : null, createdBy: promoter.id, updatedBy: promoter.id });
          const list = (mixOf.get(st.id) ?? []).filter((p) => p.brandId === b.id);
          // Lojas com pior execução têm mais ruptura (o gráfico por loja fica realista).
          const ruptureRate = 0.05 + ((stores.indexOf(st) * 37) % 100) / 100 * 0.16;
          for (const p of list) {
            const zero = rand() < ruptureRate;
            await tx.insert(s.stockEntries).values({ id: randomUUID(), agencyId: scope.agencyId, attendanceId: attId, productId: p.id, state: zero ? "zero" : "quantity", quantity: zero ? 0 : 2 + Math.floor(rand() * 30), unit: p.unit, recordedAt: aStart });
            if (zero) await tx.insert(s.ruptures).values({ id: randomUUID(), agencyId: scope.agencyId, attendanceId: attId, productId: p.id, situation: SITUATIONS[Math.floor(rand() * SITUATIONS.length)], fromStockSuggestion: true, recordedAt: aStart });
          }
          // Validades: algumas por atendimento, com vencidas e críticas.
          for (let k = 0; k < 2 + Math.floor(rand() * 3) && list.length; k++) {
            const p = list[Math.floor(rand() * list.length)];
            const days = Math.floor(rand() * 45) - 4;
            await tx.insert(s.validities).values({ id: randomUUID(), agencyId: scope.agencyId, attendanceId: attId, productId: p.id, location: rand() < 0.65 ? "sales_floor" : "stock", quantity: 1 + Math.floor(rand() * 18), unit: p.unit, expiryDate: addDays(date, days), daysToExpiry: days, severity: classify(days, bands), recordedAt: aStart });
          }
          if (list.length && rand() < 0.3) {
            const p = list[Math.floor(rand() * list.length)];
            await tx.insert(s.damages).values({ id: randomUUID(), agencyId: scope.agencyId, attendanceId: attId, productId: p.id, kind: DAMAGE_KINDS[Math.floor(rand() * DAMAGE_KINDS.length)], quantity: 1 + Math.floor(rand() * 6), unit: p.unit, recordedAt: aStart });
          }
        }
      }
    }
    // Último sinal: na loja em andamento hoje (aparece no mapa ao vivo).
    if (lastPos) await tx.update(s.users).set({ lastSeenAt: new Date(), lastLat: lastPos.lat, lastLng: lastPos.lng, lastAccuracyM: 12, lastGeoAt: new Date() }).where(eq(s.users.id, promoter.id));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "demo", scope.agencyId, "operation_demo_created", { after: { stores: stores.length, promoter: username } }, tx);
  });
  return { ok: true, message: `Demonstração criada: ${STORES.length} lojas em ${CITY} e o promotor ${username} com duas semanas de visitas.` };
}

export async function deleteOperationDemo(scope: Scope): Promise<ActionResult> {
  if (scope.role !== "admin" && !scope.platform) return { ok: false, error: "Somente administradores." };
  const db = await getDb();
  const stores = (await db.select({ id: s.stores.id }).from(s.stores).where(and(eq(s.stores.agencyId, scope.agencyId), like(s.stores.code, `${CODE_PREFIX}%`)))).map((r) => r.id);
  const promoters = (await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.internalCode, "DEMO"), eq(s.users.role, "promoter")))).map((r) => r.id);
  if (!stores.length && !promoters.length) return { ok: false, error: "Não há dados de demonstração nesta agência." };
  await db.transaction(async (tx) => {
    const visitWhere = promoters.length && stores.length ? sql`(${inArray(s.visits.promoterId, promoters)} or ${inArray(s.visits.storeId, stores)})` : promoters.length ? inArray(s.visits.promoterId, promoters) : inArray(s.visits.storeId, stores);
    const visits = (await tx.select({ id: s.visits.id }).from(s.visits).where(and(eq(s.visits.agencyId, scope.agencyId), visitWhere))).map((r) => r.id);
    const atts = visits.length ? (await tx.select({ id: s.attendances.id }).from(s.attendances).where(inArray(s.attendances.visitId, visits))).map((r) => r.id) : [];
    if (atts.length) {
      const rupt = (await tx.select({ id: s.ruptures.id }).from(s.ruptures).where(inArray(s.ruptures.attendanceId, atts))).map((r) => r.id);
      if (rupt.length) await tx.delete(s.ruptureEvents).where(inArray(s.ruptureEvents.ruptureId, rupt));
      for (const t of [s.photos, s.stockEntries, s.unregisteredProducts, s.ruptures, s.occurrences, s.validities, s.damages, s.whatsappAlerts, s.correctionRequests]) await tx.delete(t).where(inArray(t.attendanceId, atts));
      await tx.delete(s.attendances).where(inArray(s.attendances.id, atts));
    }
    if (visits.length) await tx.delete(s.visits).where(inArray(s.visits.id, visits));
    const schedWhere = promoters.length && stores.length ? sql`(${inArray(s.schedules.promoterId, promoters)} or ${inArray(s.schedules.storeId, stores)})` : promoters.length ? inArray(s.schedules.promoterId, promoters) : inArray(s.schedules.storeId, stores);
    const scheds = (await tx.select({ id: s.schedules.id }).from(s.schedules).where(and(eq(s.schedules.agencyId, scope.agencyId), schedWhere))).map((r) => r.id);
    if (scheds.length) {
      await tx.delete(s.scheduleBrands).where(inArray(s.scheduleBrands.scheduleId, scheds));
      await tx.delete(s.schedules).where(inArray(s.schedules.id, scheds));
    }
    if (promoters.length) {
      await tx.delete(s.visitTargets).where(inArray(s.visitTargets.promoterId, promoters));
      await tx.delete(s.userStores).where(inArray(s.userStores.userId, promoters));
      await tx.delete(s.userBrands).where(inArray(s.userBrands.userId, promoters));
    }
    if (stores.length) {
      await tx.delete(s.visitTargets).where(inArray(s.visitTargets.storeId, stores));
      await tx.delete(s.userStores).where(inArray(s.userStores.storeId, stores));
      await tx.delete(s.routeStops).where(inArray(s.routeStops.storeId, stores));
      await tx.delete(s.storeProducts).where(inArray(s.storeProducts.storeId, stores));
      await tx.delete(s.storeMixes).where(inArray(s.storeMixes.storeId, stores));
      await tx.delete(s.storeBrands).where(inArray(s.storeBrands.storeId, stores));
      await tx.delete(s.stores).where(inArray(s.stores.id, stores));
    }
    if (promoters.length) await tx.delete(s.users).where(inArray(s.users.id, promoters));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "demo", scope.agencyId, "operation_demo_deleted", { before: { stores: stores.length, promoters: promoters.length } }, tx);
  });
  return { ok: true, message: "Dados de demonstração apagados (lojas, promotor e visitas)." };
}
