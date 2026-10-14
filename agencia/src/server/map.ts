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
import { getRangeBoard } from "./operations";
import { brandFilter, promoterFilter } from "./scope";
import type { PanelFilters } from "@/lib/filters";
import type { StopBucket } from "@/lib/domain";
import { distanceM } from "@/lib/rules";

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
    stores.push({ id: r.id, name: r.name, chain: r.chain, city: r.city, address: r.address, lat: valid ? r.lat : null, lng: valid ? r.lng : null, status: worst ?? "unscheduled", stops });
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
