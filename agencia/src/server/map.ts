/**
 * Mapa operacional: lojas do escopo com a situação no dia (mesmas regras do
 * painel) e, quando houver, a localização REGISTRADA pelo promotor ao iniciar a
 * visita — um ponto num horário, nunca posição em tempo real. Loja sem
 * coordenadas válidas vai para a lista "sem localização", não para o mapa.
 */
import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { getDayBoard, getRangeBoard, summarizePromoters, type PromoterOpStatus } from "./operations";
import { brandFilter, promoterFilter } from "./scope";
import type { PanelFilters } from "@/lib/filters";
import type { StopBucket } from "@/lib/domain";
import { distanceM } from "@/lib/rules";
import { todayIso } from "@/lib/dates";

export type MapStatus = StopBucket | "unscheduled";

export interface MapStop {
  promoterName: string;
  plannedStart: string | null;
  bucket: StopBucket;
  extra: boolean;
  brands: { name: string; status: string | null; finishedAt: string | null }[];
  visit: { id: string; startedAt: string; finishedAt: string | null } | null;
  /** Localização registrada pelo aparelho ao iniciar a visita. */
  registered: { lat: number; lng: number; at: string; accuracyM: number | null; distanceM: number | null } | null;
  geoStatus: string | null;
}

export interface MapStore {
  id: string;
  name: string;
  chain: string | null;
  city: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  status: MapStatus;
  stops: MapStop[];
}

const BUCKET_WEIGHT: Record<StopBucket, number> = { late: 0, missed: 1, in_progress: 2, pending: 3, exception: 4, completed: 5 };

/**
 * Mapa em tempo real (hoje): só lojas com visita concluída (verde) ou em andamento (azul).
 * Concluída com exceção conta como concluída.
 */
export async function liveMapStores(scope: Scope, f: Pick<PanelFilters, "brand" | "chain" | "store" | "promoter" | "city" | "status">) {
  const date = todayIso();
  const status = f.status === "completed" || f.status === "in_progress" ? f.status : null;
  const { stores, generatedAt } = await mapData(scope, { ...f, from: date, to: date, status: null });
  const live = stores
    .map((st) => ({ ...st, status: (st.stops.some((x) => x.bucket === "in_progress") ? "in_progress" : st.stops.some((x) => x.bucket === "completed" || x.bucket === "exception") ? "completed" : st.status) as MapStatus }))
    .filter((st) => (st.status === "completed" || st.status === "in_progress") && (!status || st.status === status));
  return { stores: live, generatedAt };
}

export async function mapData(scope: Scope, f: Pick<PanelFilters, "from" | "to" | "brand" | "chain" | "store" | "promoter" | "city" | "status">) {
  const db = await getDb();
  const board = await getRangeBoard(scope, f);
  const visitIds = board.stops.map((st) => st.visit?.id).filter((x): x is string => Boolean(x));
  const geo = visitIds.length
    ? await db
        .select({ id: s.visits.id, lat: s.visits.lat, lng: s.visits.lng, accuracyM: s.visits.accuracyM, geoStatus: s.visits.geoStatus, startedAt: s.visits.startedAt })
        .from(s.visits)
        .where(inArray(s.visits.id, visitIds))
    : [];
  const geoById = new Map(geo.map((g) => [g.id, g]));

  // Lojas cadastradas no escopo (as não programadas no dia também aparecem, a menos que se filtre por promotor).
  const storeRows = await db
    .select({ id: s.stores.id, name: s.stores.name, chain: s.chains.name, chainId: s.stores.chainId, city: s.stores.city, address: s.stores.address, lat: s.stores.lat, lng: s.stores.lng })
    .from(s.stores)
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(and(eq(s.stores.agencyId, scope.agencyId), eq(s.stores.status, "active")));
  const brandStores =
    f.brand || scope.brandIds
      ? new Set(
          (
            await db
              .select({ storeId: s.storeBrands.storeId })
              .from(s.storeBrands)
              .where(and(f.brand ? eq(s.storeBrands.brandId, f.brand) : undefined, brandFilter(scope, s.storeBrands.brandId)))
          ).map((r) => r.storeId),
        )
      : null;

  const byStore = new Map<string, MapStop[]>();
  for (const st of board.stops) {
    const g = st.visit ? geoById.get(st.visit.id) : undefined;
    const list = byStore.get(st.storeId) ?? [];
    list.push({
      promoterName: st.promoterName,
      plannedStart: st.plannedStart,
      bucket: st.bucket,
      extra: !st.scheduleId,
      brands: [
        ...st.plannedBrands.map((b) => {
          const a = st.attendances.find((x) => x.brandId === b.id);
          return { name: b.name, status: a?.status ?? null, finishedAt: a?.finishedAt?.toISOString() ?? null };
        }),
        ...st.attendances.filter((a) => !st.plannedBrands.some((b) => b.id === a.brandId)).map((a) => ({ name: a.brandName, status: a.status, finishedAt: a.finishedAt?.toISOString() ?? null })),
      ],
      visit: st.visit ? { id: st.visit.id, startedAt: st.visit.startedAt.toISOString(), finishedAt: st.visit.finishedAt?.toISOString() ?? null } : null,
      registered: g && g.lat != null && g.lng != null ? { lat: g.lat, lng: g.lng, at: g.startedAt.toISOString(), accuracyM: g.accuracyM, distanceM: null } : null,
      geoStatus: g?.geoStatus ?? null,
    });
    byStore.set(st.storeId, list);
  }

  const stores: MapStore[] = [];
  for (const r of storeRows) {
    const stops = byStore.get(r.id) ?? [];
    if (!stops.length) {
      // Sem programação no dia: só entra se o filtro não for de promotor/situação de visita.
      if (f.promoter || (f.status && f.status !== "unscheduled")) continue;
      if (brandStores && !brandStores.has(r.id)) continue;
    } else if (f.status === "unscheduled") continue;
    if (f.chain && r.chainId !== f.chain) continue;
    if (f.city && r.city !== f.city) continue;
    if (f.store && r.id !== f.store) continue;
    const valid = r.lat != null && r.lng != null && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180 && !(r.lat === 0 && r.lng === 0);
    for (const st of stops) if (st.registered && valid) st.registered.distanceM = distanceM({ lat: r.lat!, lng: r.lng! }, st.registered);
    const worst = stops.length ? stops.map((x) => x.bucket).sort((a, b) => BUCKET_WEIGHT[a] - BUCKET_WEIGHT[b])[0] : null;
    if (f.status && f.status !== "unscheduled" && worst !== f.status) continue;
    // Onde o promotor estava ao entrar na loja; sem esse registro, o endereço cadastrado da loja.
    const here = stops.find((x) => x.registered)?.registered;
    stores.push({ id: r.id, name: r.name, chain: r.chain, city: r.city, address: r.address, lat: here?.lat ?? (valid ? r.lat : null), lng: here?.lng ?? (valid ? r.lng : null), status: worst ?? "unscheduled", stops });
  }
  stores.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { stores, generatedAt: board.generatedAt };
}

/**
 * Para lojas sem coordenadas: a última localização registrada numa visita a
 * ela (com precisão razoável), para o administrador decidir se a usa.
 */
export async function suggestedStoreLocations(scope: Scope, storeIds: string[]) {
  if (!storeIds.length) return new Map<string, { lat: number; lng: number; date: string; accuracyM: number | null }>();
  const db = await getDb();
  const rows = await db
    .select({ storeId: s.visits.storeId, lat: s.visits.lat, lng: s.visits.lng, date: s.visits.visitDate, accuracyM: s.visits.accuracyM })
    .from(s.visits)
    .where(and(eq(s.visits.agencyId, scope.agencyId), inArray(s.visits.storeId, storeIds), isNotNull(s.visits.lat), isNotNull(s.visits.lng), promoterFilter(scope, s.visits.promoterId)))
    .orderBy(desc(s.visits.visitDate), desc(s.visits.startedAt));
  const out = new Map<string, { lat: number; lng: number; date: string; accuracyM: number | null }>();
  for (const r of rows) {
    if (out.has(r.storeId) || r.lat == null || r.lng == null) continue;
    if (r.accuracyM != null && r.accuracyM > 150) continue;
    out.set(r.storeId, { lat: r.lat, lng: r.lng, date: r.date, accuracyM: r.accuracyM });
  }
  return out;
}

/** Administrador grava na loja a localização registrada numa visita (auditado em saveStore). */
export async function storeCoordsFromVisit(scope: Scope, storeId: string) {
  const suggestion = (await suggestedStoreLocations(scope, [storeId])).get(storeId);
  return suggestion ?? null;
}

// ───────────────────────────── Acompanhamento ao vivo ─────────────────────────────

/** App aberto e falando com o servidor nos últimos minutos (atualiza a cada 2 min). */
export const ONLINE_MINUTES = 5;

export interface LivePlace {
  storeId: string;
  storeName: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

export interface LivePromoter {
  promoterId: string;
  name: string;
  online: boolean;
  lastSeenAt: string | null;
  /** Última posição enviada pelo celular hoje (app aberto e localização permitida). */
  position: { lat: number; lng: number; accuracyM: number | null; at: string } | null;
  geoPermission: string | null;
  status: PromoterOpStatus;
  /** Loja em que está agora (visita aberta). */
  current: (LivePlace & { visitId: string; since: string; brands: { name: string; status: string | null }[] }) | null;
  /** Próxima loja do roteiro ainda não iniciada. */
  next: (LivePlace & { plannedStart: string | null; late: boolean }) | null;
  /** Última loja encerrada hoje. */
  last: (LivePlace & { finishedAt: string }) | null;
  /** Atendimentos de marca finalizados hoje (concluídos ou não atendidos). */
  done: { attendanceId: string; brandName: string; storeName: string; status: string; at: string }[];
  scheduled: number;
  completed: number;
}

export interface LiveEvent {
  id: string;
  at: string;
  kind: "checkin" | "checkout" | "attendance" | "not_attended";
  promoterId: string;
  promoterName: string;
  storeName: string;
  text: string;
}

/**
 * Onde cada promotor está agora, a partir dos registros do dia (não é
 * rastreamento contínuo): loja da visita aberta, próxima loja do roteiro e o
 * que já foi feito; "online" = o app falou com o servidor há poucos minutos.
 */
export type LiveFilters = Pick<PanelFilters, "brand" | "chain" | "store" | "promoter" | "city">;

export interface LiveTotals {
  /** Promotores dentro de uma loja agora (no filtro). */
  inStore: number;
  online: number;
  storesPlanned: number;
  storesDone: number;
  storesInProgress: number;
  attendancesDone: number;
}

export async function liveOperations(scope: Scope, f: Partial<LiveFilters> = {}): Promise<{ generatedAt: string; promoters: LivePromoter[]; events: LiveEvent[]; totals: LiveTotals }> {
  const db = await getDb();
  const date = todayIso();
  const filtered = Boolean(f.brand || f.chain || f.store || f.promoter || f.city);
  const board = await getDayBoard(scope, { date, brand: f.brand ?? null, chain: f.chain ?? null, store: f.store ?? null, promoter: f.promoter ?? null, city: f.city ?? null });
  const summary = new Map(summarizePromoters(board).map((p) => [p.promoterId, p]));
  const storeIds = [...new Set(board.stops.map((st) => st.storeId))];
  const coords = storeIds.length ? await db.select({ id: s.stores.id, lat: s.stores.lat, lng: s.stores.lng }).from(s.stores).where(inArray(s.stores.id, storeIds)) : [];
  const coordOf = new Map(coords.map((c) => [c.id, c]));
  const seen = await db
    .select({ id: s.users.id, name: s.users.name, lastSeenAt: s.users.lastSeenAt, geoPermission: s.users.geoPermission, lastLat: s.users.lastLat, lastLng: s.users.lastLng, lastAccuracyM: s.users.lastAccuracyM, lastGeoAt: s.users.lastGeoAt })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"), promoterFilter(scope, s.users.id)));
  const now = Date.now();
  const place = (st: (typeof board.stops)[number]): LivePlace => {
    const c = coordOf.get(st.storeId);
    return { storeId: st.storeId, storeName: st.storeName, city: st.city, lat: c?.lat ?? null, lng: c?.lng ?? null };
  };

  const promoters: LivePromoter[] = [];
  const events: LiveEvent[] = [];
  for (const u of seen) {
    const mine = board.stops.filter((st) => st.promoterId === u.id).sort((a, b) => a.seq - b.seq || (a.plannedStart ?? "99").localeCompare(b.plannedStart ?? "99"));
    const online = Boolean(u.lastSeenAt && now - u.lastSeenAt.getTime() <= ONLINE_MINUTES * 60_000);
    // Sem programação e sem sinal hoje: não entra no acompanhamento. Com filtro, só quem tem loja no filtro.
    if (!mine.length && (filtered || !(u.lastSeenAt && u.lastSeenAt.toISOString().slice(0, 10) >= date))) continue;
    const open = mine.find((st) => st.visit?.status === "in_progress");
    const next = mine.find((st) => !st.visit && (st.bucket === "pending" || st.bucket === "late"));
    const finished = mine.filter((st) => st.visit?.finishedAt).sort((a, b) => b.visit!.finishedAt!.getTime() - a.visit!.finishedAt!.getTime())[0];
    const done = mine
      .flatMap((st) => st.attendances.filter((a) => (a.status === "completed" || a.status === "cancelled") && a.finishedAt).map((a) => ({ attendanceId: a.id, brandName: a.brandName, storeName: st.storeName, status: a.status, at: a.finishedAt!.toISOString() })))
      .sort((a, b) => b.at.localeCompare(a.at));
    const sm = summary.get(u.id);
    promoters.push({
      promoterId: u.id,
      name: u.name,
      online,
      lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
      position:
        u.lastLat != null && u.lastLng != null && u.lastGeoAt && u.lastGeoAt.toISOString().slice(0, 10) >= date
          ? { lat: u.lastLat, lng: u.lastLng, accuracyM: u.lastAccuracyM, at: u.lastGeoAt.toISOString() }
          : null,
      geoPermission: u.geoPermission,
      status: sm?.status ?? "no_schedule",
      current: open
        ? {
            ...place(open),
            visitId: open.visit!.id,
            since: open.visit!.startedAt.toISOString(),
            brands: [...new Map([...open.plannedBrands.map((b) => [b.id, b.name] as const), ...open.attendances.map((a) => [a.brandId, a.brandName] as const)])].map(([id, name]) => ({ name, status: open.attendances.find((a) => a.brandId === id)?.status ?? null })),
          }
        : null,
      next: next ? { ...place(next), plannedStart: next.plannedStart, late: next.bucket === "late" } : null,
      last: finished ? { ...place(finished), finishedAt: finished.visit!.finishedAt!.toISOString() } : null,
      done,
      scheduled: sm?.scheduled ?? 0,
      completed: sm?.completed ?? 0,
    });
    for (const st of mine) {
      if (!st.visit) continue;
      const base = { promoterId: u.id, promoterName: u.name, storeName: st.storeName };
      events.push({ ...base, id: `in:${st.visit.id}`, at: st.visit.startedAt.toISOString(), kind: "checkin", text: `chegou em ${st.storeName}` });
      if (st.visit.finishedAt) events.push({ ...base, id: `out:${st.visit.id}`, at: st.visit.finishedAt.toISOString(), kind: "checkout", text: `encerrou ${st.storeName} (${st.brandsDone}/${st.brandsTotal} marcas)` });
      for (const a of st.attendances) {
        if (!a.finishedAt || (a.status !== "completed" && a.status !== "cancelled")) continue;
        events.push({ ...base, id: `att:${a.id}`, at: a.finishedAt.toISOString(), kind: a.status === "completed" ? "attendance" : "not_attended", text: a.status === "completed" ? `concluiu ${a.brandName} em ${st.storeName}` : `não atendeu ${a.brandName} em ${st.storeName}` });
      }
    }
  }
  const order: Record<PromoterOpStatus, number> = { in_store: 0, late: 1, between: 2, not_started: 3, missed: 4, done: 5, no_schedule: 6 };
  promoters.sort((a, b) => order[a.status] - order[b.status] || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, "pt-BR"));
  events.sort((a, b) => b.at.localeCompare(a.at));
  const scheduled = board.stops.filter((st) => st.scheduleId || st.visit);
  const totals: LiveTotals = {
    inStore: promoters.filter((p) => p.current).length,
    online: promoters.filter((p) => p.online).length,
    storesPlanned: scheduled.length,
    storesDone: scheduled.filter((st) => st.bucket === "completed" || st.bucket === "exception").length,
    storesInProgress: scheduled.filter((st) => st.bucket === "in_progress").length,
    attendancesDone: board.stops.reduce((n, st) => n + st.attendances.filter((a) => a.status === "completed").length, 0),
  };
  return { generatedAt: new Date().toISOString(), promoters, events: events.slice(0, 60), totals };
}

export type GeoPermissionState = "denied" | "prompt" | "unsupported" | "unknown";

/** Promotores ativos que não liberaram a localização (para o gestor cobrar). */
export async function geoPermissionList(scope: Scope, promoterId?: string | null) {
  const db = await getDb();
  const rows = await db
    .select({ id: s.users.id, name: s.users.name, permission: s.users.geoPermission, checkedAt: s.users.geoCheckedAt, lastSeenAt: s.users.lastSeenAt })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"), promoterFilter(scope, s.users.id), promoterId ? eq(s.users.id, promoterId) : undefined));
  return rows
    .filter((r) => r.permission !== "granted")
    .map((r) => ({ ...r, permission: (r.permission === "denied" || r.permission === "prompt" || r.permission === "unsupported" ? r.permission : "unknown") as GeoPermissionState }))
    .sort((a, b) => (a.permission === "denied" ? 0 : 1) - (b.permission === "denied" ? 0 : 1) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Sinal do app do promotor: online, permissão de localização e (se permitida) a posição atual. */
export async function promoterHeartbeat(promoterId: string, i: { permission: string; lat?: number | null; lng?: number | null; accuracy?: number | null }) {
  const db = await getDb();
  const now = new Date();
  const permission = ["granted", "denied", "prompt", "unsupported"].includes(i.permission) ? i.permission : null;
  const validPos = typeof i.lat === "number" && typeof i.lng === "number" && Math.abs(i.lat) <= 90 && Math.abs(i.lng) <= 180 && !(i.lat === 0 && i.lng === 0);
  await db
    .update(s.users)
    .set({
      lastSeenAt: now,
      ...(permission ? { geoPermission: permission, geoCheckedAt: now } : {}),
      ...(validPos ? { lastLat: i.lat!, lastLng: i.lng!, lastAccuracyM: typeof i.accuracy === "number" && Number.isFinite(i.accuracy) ? Math.round(i.accuracy) : null, lastGeoAt: now } : {}),
    })
    .where(eq(s.users.id, promoterId));
}
