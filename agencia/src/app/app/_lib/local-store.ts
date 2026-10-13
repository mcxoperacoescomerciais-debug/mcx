/**
 * Estado local do app do promotor — offline-first.
 *
 * Tudo o que o promotor faz é gravado PRIMEIRO no IndexedDB do aparelho e só
 * depois enviado ao servidor por `syncNow()`. Cada visita e cada atendimento
 * têm `rev` (versão local) e `syncedRev` (última versão confirmada pelo
 * servidor): rev > syncedRev = pendente de envio. Fotos ficam como Blob no
 * IndexedDB até o servidor confirmar o upload — só então aparecem como
 * "Enviada". A interface nunca diz que algo foi enviado se ainda está só aqui.
 *
 * Exposto como store externo (subscribe/getSnapshot) para useSyncExternalStore.
 */
import { createStore, del, get, set } from "idb-keyval";
import type {
  AttendanceInput,
  BootstrapPayload,
  DamageInput,
  OccurrenceInput,
  PhotoInput,
  PromoterHistoryItem,
  RuptureInput,
  ServerVisit,
  StockInput,
  UnregisteredInput,
  ValidityInput,
  VisitInput,
  VisitSyncResult,
} from "@/lib/sync-types";
import type { AttendanceDisplayStatus, AttendanceStatus, ExceptionItem, ExceptionReason, PhotoKind, PhotoSource, VisitStatus } from "@/lib/domain";
import { todayIso } from "@/lib/dates";

export interface LocalPhoto extends PhotoInput {
  /** Arquivo confirmado no servidor. */
  uploaded: boolean;
  /** O Blob ainda está guardado neste aparelho. */
  local: boolean;
  lastError?: string;
}

export interface LocalAttendance {
  id: string;
  brandId: string;
  status: AttendanceStatus;
  startedAt: string;
  finishedAt: string | null;
  activitiesDone: string[];
  notes: string;
  exceptionItems: ExceptionItem[];
  exceptionReason: ExceptionReason | null;
  exceptionNote: string;
  cancelReason: string;
  photos: LocalPhoto[];
  deletedPhotoIds: string[];
  stock: Record<string, StockInput>;
  clearedStockProductIds: string[];
  unregistered: Record<string, UnregisteredInput>;
  deletedUnregisteredIds: string[];
  ruptures: Record<string, RuptureInput>;
  deletedRuptureIds: string[];
  occurrences: Record<string, OccurrenceInput>;
  deletedOccurrenceIds: string[];
  /** Validades e avarias (modo SUINCO). Opcionais: atendimentos gravados antes da atualização não têm. */
  validities?: Record<string, ValidityInput>;
  deletedValidityIds?: string[];
  damages?: Record<string, DamageInput>;
  deletedDamageIds?: string[];
  /** Pedido de correção aberto pelo gestor. */
  correction: { id: string; reason: string; requestedAt: string } | null;
  /** Finalizado no servidor: o promotor não altera mais (salvo correção). */
  locked: boolean;
  reviewStatus?: string;
  reviewNote?: string | null;
  rev: number;
  syncedRev: number;
  serverError?: string;
}

export interface LocalVisit {
  id: string;
  storeId: string;
  scheduleId: string | null;
  visitDate: string;
  origin: "scheduled" | "extra";
  extraReason: string;
  status: VisitStatus;
  closeReason: string;
  startedAt: string;
  finishedAt: string | null;
  geo: VisitInput["geo"];
  notes: string;
  /** Marcas previstas (programação) — extraordinária: as escolhidas pelo promotor. */
  plannedBrandIds: string[];
  attendances: Record<string, LocalAttendance>;
  rev: number;
  syncedRev: number;
  serverError?: string;
  /** Erro definitivo (ex.: programação já atendida em outro aparelho). */
  blocked?: boolean;
}

export interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface LocalState {
  ready: boolean;
  bootstrap: BootstrapPayload | null;
  bootstrapAt: string | null;
  visits: Record<string, LocalVisit>;
  history: PromoterHistoryItem[] | null;
  /** Quando o histórico foi baixado (null = nunca). */
  historyAt: string | null;
  sync: SyncState;
  sessionExpired: boolean;
}

const idb = typeof window !== "undefined" ? createStore("mcx-campo", "kv") : undefined;
const KEY_BOOTSTRAP = "bootstrap";
const KEY_BOOTSTRAP_AT = "bootstrapAt";
const KEY_VISITS = "visits";
/** Último histórico baixado — consultável sem sinal. */
const KEY_HISTORY = "history";
const blobKey = (id: string) => `photo:${id}`;
const thumbKey = (id: string) => `thumb:${id}`;

let state: LocalState = {
  ready: false,
  bootstrap: null,
  bootstrapAt: null,
  visits: {},
  history: null,
  historyAt: null,
  sync: { online: true, syncing: false, lastSyncAt: null, lastError: null },
  sessionExpired: false,
};
const listeners = new Set<() => void>();

function emit(next: Partial<LocalState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const localStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => state,
  getServerSnapshot: () => state,
};

async function persistVisits(visits: Record<string, LocalVisit>) {
  emit({ visits });
  await set(KEY_VISITS, visits, idb);
}

// ───────────────────────────── Inicialização ─────────────────────────────

let initialized = false;

export async function initLocalStore(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const [bootstrap, bootstrapAt, visits, history] = await Promise.all([
    get<BootstrapPayload>(KEY_BOOTSTRAP, idb),
    get<string>(KEY_BOOTSTRAP_AT, idb),
    get<Record<string, LocalVisit>>(KEY_VISITS, idb),
    get<{ at: string; items: PromoterHistoryItem[] }>(KEY_HISTORY, idb),
  ]);
  emit({
    ready: true,
    bootstrap: bootstrap ?? null,
    bootstrapAt: bootstrapAt ?? null,
    visits: visits ?? {},
    history: history?.items ?? null,
    historyAt: history?.at ?? null,
    sync: { ...state.sync, online: navigator.onLine },
  });

  window.addEventListener("online", () => {
    emit({ sync: { ...state.sync, online: true } });
    void refreshAll();
  });
  window.addEventListener("offline", () => emit({ sync: { ...state.sync, online: false } }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshAll();
  });
  setInterval(() => void syncNow(), 20_000);
  await refreshAll();
}

export async function refreshAll() {
  await syncNow();
  await refreshBootstrap();
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(input, { ...init, credentials: "same-origin", cache: "no-store" });
    if (res.status === 401) {
      emit({ sessionExpired: true });
      return null;
    }
    if (!state.sync.online) emit({ sync: { ...state.sync, online: true } });
    return res;
  } catch {
    emit({ sync: { ...state.sync, online: false } });
    return null;
  }
}

export async function refreshBootstrap(): Promise<void> {
  const res = await apiFetch("/api/promoter/bootstrap");
  if (!res?.ok) return;
  const bootstrap = (await res.json()) as BootstrapPayload;
  // Troca de usuário no mesmo aparelho: descarta o que já estava sincronizado do anterior.
  if (state.bootstrap && state.bootstrap.user.id !== bootstrap.user.id) {
    const pending = Object.values(state.visits).filter(isVisitDirty);
    if (!pending.length) await persistVisits({});
  }
  const at = new Date().toISOString();
  emit({ bootstrap, bootstrapAt: at });
  await Promise.all([set(KEY_BOOTSTRAP, bootstrap, idb), set(KEY_BOOTSTRAP_AT, at, idb)]);
  await mergeServerVisits(bootstrap.visits, bootstrap);
}

export async function refreshHistory(): Promise<void> {
  const res = await apiFetch("/api/promoter/history");
  if (!res?.ok) return;
  const items = (await res.json()) as PromoterHistoryItem[];
  const at = new Date().toISOString();
  emit({ history: items, historyAt: at });
  await set(KEY_HISTORY, { at, items }, idb);
}

// ───────────────────────────── Conversões ─────────────────────────────

function attendanceDirty(a: LocalAttendance): boolean {
  return a.rev > a.syncedRev;
}

export function isVisitDirty(v: LocalVisit): boolean {
  return v.rev > v.syncedRev || Object.values(v.attendances).some(attendanceDirty);
}

export function pendingPhotos(v: LocalVisit): number {
  return Object.values(v.attendances).reduce((n, a) => n + a.photos.filter((p) => !p.uploaded && p.local).length, 0);
}

/** O servidor confirmou tudo desta visita (dados e fotos)? */
export function isVisitFullySynced(v: LocalVisit): boolean {
  return !isVisitDirty(v) && pendingPhotos(v) === 0;
}

export function attendanceDisplayStatus(a: LocalAttendance | undefined): AttendanceDisplayStatus {
  if (!a) return "pending";
  if (a.status === "correction_requested") return "correction_requested";
  if (a.status === "completed" && (attendanceDirty(a) || a.photos.some((p) => !p.uploaded && p.local))) return "awaiting_sync";
  return a.status;
}

function fromServerVisit(sv: ServerVisit, plannedBrandIds: string[], previous?: LocalVisit): LocalVisit {
  const attendances: Record<string, LocalAttendance> = {};
  for (const a of sv.attendances) {
    const prevPhotos = new Map((previous?.attendances[a.id]?.photos ?? []).map((p) => [p.id, p]));
    attendances[a.id] = {
      id: a.id,
      brandId: a.brandId,
      status: a.status,
      startedAt: a.startedAt,
      finishedAt: a.finishedAt,
      activitiesDone: a.activitiesDone,
      notes: a.notes ?? "",
      exceptionItems: a.exceptionItems,
      exceptionReason: a.exceptionReason,
      exceptionNote: a.exceptionNote ?? "",
      cancelReason: a.cancelReason ?? "",
      photos: a.photos.map((p) => ({ ...p, local: prevPhotos.get(p.id)?.local ?? false })),
      deletedPhotoIds: [],
      stock: Object.fromEntries(a.stock.map((x) => [x.productId, x])),
      clearedStockProductIds: [],
      unregistered: Object.fromEntries(a.unregistered.map((x) => [x.id, x])),
      deletedUnregisteredIds: [],
      ruptures: Object.fromEntries(a.ruptures.map((x) => [x.id, x])),
      deletedRuptureIds: [],
      occurrences: Object.fromEntries(a.occurrences.map((x) => [x.id, x])),
      deletedOccurrenceIds: [],
      validities: Object.fromEntries((a.validities ?? []).map((x) => [x.id, x])),
      deletedValidityIds: [],
      damages: Object.fromEntries((a.damages ?? []).map((x) => [x.id, x])),
      deletedDamageIds: [],
      correction: a.correction,
      locked: a.status === "completed" || a.status === "cancelled",
      reviewStatus: a.reviewStatus,
      reviewNote: a.reviewNote,
      rev: 1,
      syncedRev: 1,
    };
  }
  return {
    id: sv.id,
    storeId: sv.storeId,
    scheduleId: sv.scheduleId,
    visitDate: sv.visitDate,
    origin: sv.origin,
    extraReason: sv.extraReason ?? "",
    status: sv.status,
    closeReason: sv.closeReason ?? "",
    startedAt: sv.startedAt,
    finishedAt: sv.finishedAt,
    geo: sv.geo,
    notes: sv.notes ?? "",
    plannedBrandIds: plannedBrandIds.length ? plannedBrandIds : previous?.plannedBrandIds ?? sv.attendances.map((a) => a.brandId),
    attendances,
    rev: 1,
    syncedRev: 1,
  };
}

/** A versão do servidor prevalece sobre o que já está sincronizado; o que ainda não foi enviado é preservado. */
async function mergeServerVisits(serverVisits: ServerVisit[], bootstrap: BootstrapPayload) {
  const visits = { ...state.visits };
  let changed = false;
  for (const sv of serverVisits) {
    const local = visits[sv.id];
    const planned = sv.scheduleId ? bootstrap.schedules.find((x) => x.id === sv.scheduleId)?.brandIds ?? [] : [];
    if (!local || !isVisitDirty(local)) {
      visits[sv.id] = fromServerVisit(sv, planned, local);
      changed = true;
      continue;
    }
    // Visita com alterações locais: atualiza só atendimentos sem pendência local.
    const fresh = fromServerVisit(sv, planned, local);
    const merged = { ...local, attendances: { ...local.attendances } };
    for (const [id, a] of Object.entries(fresh.attendances)) {
      const la = local.attendances[id];
      if (!la || !attendanceDirty(la)) merged.attendances[id] = a;
    }
    visits[sv.id] = merged;
    changed = true;
  }
  if (changed) await persistVisits(visits);
}

// ───────────────────────────── Mutações (sempre locais primeiro) ─────────────────────────────

export function uuid(): string {
  return crypto.randomUUID();
}

function bumpVisit(visitId: string, fn: (v: LocalVisit) => LocalVisit): Promise<void> {
  const current = state.visits[visitId];
  if (!current) return Promise.resolve();
  const p = persistVisits({ ...state.visits, [visitId]: { ...fn(current), rev: current.rev + 1, serverError: undefined } });
  scheduleSync();
  return p;
}

function bumpAttendance(visitId: string, attendanceId: string, fn: (a: LocalAttendance) => LocalAttendance): Promise<void> {
  const v = state.visits[visitId];
  const a = v?.attendances[attendanceId];
  if (!v || !a) return Promise.resolve();
  if (a.locked && a.status !== "correction_requested") return Promise.resolve();
  const next = { ...fn(a), rev: a.rev + 1, serverError: undefined };
  const p = persistVisits({ ...state.visits, [visitId]: { ...v, attendances: { ...v.attendances, [attendanceId]: next } } });
  scheduleSync();
  return p;
}

export function openVisit(): LocalVisit | undefined {
  // Visita recusada pelo servidor não prende o promotor: ela fica sinalizada à parte.
  return Object.values(state.visits).find((v) => v.status === "in_progress" && !v.blocked);
}

export interface StartVisitArgs {
  storeId: string;
  scheduleId: string | null;
  plannedBrandIds: string[];
  extraReason?: string;
  captureLocation: boolean;
}

export async function startVisit(args: StartVisitArgs): Promise<string> {
  if (args.scheduleId) {
    const existing = Object.values(state.visits).find((v) => v.scheduleId === args.scheduleId && v.status !== "cancelled");
    if (existing) return existing.id;
  }
  const id = uuid();
  const visit: LocalVisit = {
    id,
    storeId: args.storeId,
    scheduleId: args.scheduleId,
    visitDate: todayIso(),
    origin: args.scheduleId ? "scheduled" : "extra",
    extraReason: args.extraReason ?? "",
    status: "in_progress",
    closeReason: "",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    geo: args.captureLocation ? null : { status: "disabled", lat: null, lng: null, accuracy: null },
    notes: "",
    plannedBrandIds: args.plannedBrandIds,
    attendances: {},
    rev: 1,
    syncedRev: 0,
  };
  await persistVisits({ ...state.visits, [id]: visit });
  if (args.captureLocation) void captureLocation(id);
  scheduleSync();
  return id;
}

/** Localização no início da visita (só com permissão do promotor; nunca bloqueia o trabalho). */
async function captureLocation(visitId: string) {
  const geo = await new Promise<VisitInput["geo"]>((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ status: "unavailable", lat: null, lng: null, accuracy: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ status: "captured", lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => resolve({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable", lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
  await bumpVisit(visitId, (v) => ({ ...v, geo }));
}

export async function addPlannedBrand(visitId: string, brandId: string) {
  await bumpVisit(visitId, (v) => (v.plannedBrandIds.includes(brandId) ? v : { ...v, plannedBrandIds: [...v.plannedBrandIds, brandId] }));
}

export async function setVisitNotes(visitId: string, notes: string) {
  await bumpVisit(visitId, (v) => ({ ...v, notes }));
}

export async function startAttendance(visitId: string, brandId: string): Promise<string> {
  const v = state.visits[visitId];
  const existing = v && Object.values(v.attendances).find((a) => a.brandId === brandId);
  if (existing) return existing.id;
  const id = uuid();
  const a: LocalAttendance = {
    id,
    brandId,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    activitiesDone: [],
    notes: "",
    exceptionItems: [],
    exceptionReason: null,
    exceptionNote: "",
    cancelReason: "",
    photos: [],
    deletedPhotoIds: [],
    stock: {},
    clearedStockProductIds: [],
    unregistered: {},
    deletedUnregisteredIds: [],
    ruptures: {},
    deletedRuptureIds: [],
    occurrences: {},
    deletedOccurrenceIds: [],
    validities: {},
    deletedValidityIds: [],
    damages: {},
    deletedDamageIds: [],
    correction: null,
    locked: false,
    rev: 1,
    syncedRev: 0,
  };
  await bumpVisit(visitId, (x) => ({ ...x, attendances: { ...x.attendances, [id]: a } }));
  return id;
}

export function updateAttendance(visitId: string, attendanceId: string, patch: Partial<Pick<LocalAttendance, "activitiesDone" | "notes" | "exceptionItems" | "exceptionReason" | "exceptionNote">>) {
  return bumpAttendance(visitId, attendanceId, (a) => ({ ...a, ...patch }));
}

export interface PhotoLink {
  ruptureId?: string;
  occurrenceId?: string;
  validityId?: string;
  damageId?: string;
}

export async function addPhoto(visitId: string, attendanceId: string, kind: PhotoKind, source: PhotoSource, blob: Blob, thumb: Blob | null, link: PhotoLink = {}): Promise<string> {
  const id = uuid();
  await set(blobKey(id), blob, idb);
  if (thumb) await set(thumbKey(id), thumb, idb);
  await bumpAttendance(visitId, attendanceId, (a) => ({
    ...a,
    photos: [
      ...a.photos,
      { id, kind, source, takenAt: new Date().toISOString(), ruptureId: link.ruptureId ?? null, occurrenceId: link.occurrenceId ?? null, validityId: link.validityId ?? null, damageId: link.damageId ?? null, uploaded: false, local: true },
    ],
  }));
  return id;
}

/** Remover/substituir antes de finalizar. Se a foto já estava no servidor, ela é preservada lá (exclusão lógica + auditoria). */
export async function removePhoto(visitId: string, attendanceId: string, photoId: string) {
  const photo = state.visits[visitId]?.attendances[attendanceId]?.photos.find((p) => p.id === photoId);
  await bumpAttendance(visitId, attendanceId, (a) => ({
    ...a,
    photos: a.photos.filter((p) => p.id !== photoId),
    deletedPhotoIds: a.syncedRev > 0 ? [...a.deletedPhotoIds, photoId] : a.deletedPhotoIds,
  }));
  if (photo && !photo.uploaded) {
    await del(blobKey(photoId), idb);
    await del(thumbKey(photoId), idb);
  }
}

/** Fotos tiradas para um item que acabou não sendo salvo (o promotor fechou sem salvar). */
export async function discardUnsavedPhotos(visitId: string, attendanceId: string, link: PhotoLink) {
  const a = state.visits[visitId]?.attendances[attendanceId];
  const orphan = a?.photos.filter((p) => (link.validityId && p.validityId === link.validityId) || (link.damageId && p.damageId === link.damageId)) ?? [];
  for (const p of orphan) await removePhoto(visitId, attendanceId, p.id);
}

export function getPhotoBlob(photoId: string, thumb = false): Promise<Blob | undefined> {
  return get<Blob>(thumb ? thumbKey(photoId) : blobKey(photoId), idb);
}

export function saveStock(visitId: string, attendanceId: string, entry: StockInput) {
  return bumpAttendance(visitId, attendanceId, (a) => ({
    ...a,
    stock: { ...a.stock, [entry.productId]: entry },
    clearedStockProductIds: a.clearedStockProductIds.filter((id) => id !== entry.productId),
  }));
}

export function clearStock(visitId: string, attendanceId: string, productId: string) {
  return bumpAttendance(visitId, attendanceId, (a) => {
    const stock = { ...a.stock };
    delete stock[productId];
    return { ...a, stock, clearedStockProductIds: [...a.clearedStockProductIds, productId] };
  });
}

export function saveUnregistered(visitId: string, attendanceId: string, item: UnregisteredInput) {
  return bumpAttendance(visitId, attendanceId, (a) => ({ ...a, unregistered: { ...a.unregistered, [item.id]: item } }));
}

export function deleteUnregistered(visitId: string, attendanceId: string, id: string) {
  return bumpAttendance(visitId, attendanceId, (a) => {
    const unregistered = { ...a.unregistered };
    delete unregistered[id];
    return { ...a, unregistered, deletedUnregisteredIds: [...a.deletedUnregisteredIds, id] };
  });
}

export function saveRupture(visitId: string, attendanceId: string, r: RuptureInput) {
  return bumpAttendance(visitId, attendanceId, (a) => ({ ...a, ruptures: { ...a.ruptures, [r.id]: r } }));
}

export async function deleteRupture(visitId: string, attendanceId: string, ruptureId: string) {
  const a = state.visits[visitId]?.attendances[attendanceId];
  for (const p of a?.photos.filter((x) => x.ruptureId === ruptureId) ?? []) await removePhoto(visitId, attendanceId, p.id);
  await bumpAttendance(visitId, attendanceId, (x) => {
    const ruptures = { ...x.ruptures };
    delete ruptures[ruptureId];
    return { ...x, ruptures, deletedRuptureIds: [...x.deletedRuptureIds, ruptureId] };
  });
}

/** Ruptura no modo SUINCO: um toque marca/desmarca "Ruptura total" do produto. */
/**
 * Atendimento recém-finalizado cujo relatório a tela da visita deve oferecer
 * para envio (só nesta sessão do app; não é persistido).
 */
let shareRequest: string | null = null;
export function requestShare(attendanceId: string) {
  shareRequest = attendanceId;
}
export function peekShareRequest(): string | null {
  return shareRequest;
}
export function clearShareRequest() {
  shareRequest = null;
}

export async function toggleRupture(visitId: string, attendanceId: string, productId: string, fromStockSuggestion = false): Promise<boolean> {
  const a = state.visits[visitId]?.attendances[attendanceId];
  const existing = Object.values(a?.ruptures ?? {}).find((r) => r.productId === productId);
  if (existing) {
    await deleteRupture(visitId, attendanceId, existing.id);
    return false;
  }
  await saveRupture(visitId, attendanceId, {
    id: uuid(),
    productId,
    situation: "total",
    knownStock: null,
    note: null,
    fromStockSuggestion,
    recordedAt: new Date().toISOString(),
  });
  return true;
}

export function saveValidity(visitId: string, attendanceId: string, v: ValidityInput) {
  return bumpAttendance(visitId, attendanceId, (a) => ({ ...a, validities: { ...(a.validities ?? {}), [v.id]: v } }));
}

export async function deleteValidity(visitId: string, attendanceId: string, id: string) {
  const a = state.visits[visitId]?.attendances[attendanceId];
  for (const p of a?.photos.filter((x) => x.validityId === id) ?? []) await removePhoto(visitId, attendanceId, p.id);
  await bumpAttendance(visitId, attendanceId, (x) => {
    const validities = { ...(x.validities ?? {}) };
    delete validities[id];
    return { ...x, validities, deletedValidityIds: [...(x.deletedValidityIds ?? []), id] };
  });
}

export function saveDamage(visitId: string, attendanceId: string, d: DamageInput) {
  return bumpAttendance(visitId, attendanceId, (a) => ({ ...a, damages: { ...(a.damages ?? {}), [d.id]: d } }));
}

export async function deleteDamage(visitId: string, attendanceId: string, id: string) {
  const a = state.visits[visitId]?.attendances[attendanceId];
  for (const p of a?.photos.filter((x) => x.damageId === id) ?? []) await removePhoto(visitId, attendanceId, p.id);
  await bumpAttendance(visitId, attendanceId, (x) => {
    const damages = { ...(x.damages ?? {}) };
    delete damages[id];
    return { ...x, damages, deletedDamageIds: [...(x.deletedDamageIds ?? []), id] };
  });
}

export function saveOccurrence(visitId: string, attendanceId: string, o: OccurrenceInput) {
  return bumpAttendance(visitId, attendanceId, (a) => ({ ...a, occurrences: { ...a.occurrences, [o.id]: o } }));
}

export async function deleteOccurrence(visitId: string, attendanceId: string, id: string) {
  const a = state.visits[visitId]?.attendances[attendanceId];
  for (const p of a?.photos.filter((x) => x.occurrenceId === id) ?? []) await removePhoto(visitId, attendanceId, p.id);
  await bumpAttendance(visitId, attendanceId, (x) => {
    const occurrences = { ...x.occurrences };
    delete occurrences[id];
    return { ...x, occurrences, deletedOccurrenceIds: [...x.deletedOccurrenceIds, id] };
  });
}

export async function finishAttendance(visitId: string, attendanceId: string) {
  await bumpAttendance(visitId, attendanceId, (a) => ({ ...a, status: "completed", finishedAt: new Date().toISOString() }));
  void syncNow();
}

export async function cancelAttendance(visitId: string, attendanceId: string, reason: string) {
  await bumpAttendance(visitId, attendanceId, (a) => ({ ...a, status: "cancelled", cancelReason: reason, finishedAt: new Date().toISOString() }));
  void syncNow();
}

export async function finishVisit(visitId: string, closeReason: string | null) {
  await bumpVisit(visitId, (v) => ({
    ...v,
    status: closeReason ? "closed_incomplete" : "completed",
    closeReason: closeReason ?? "",
    finishedAt: new Date().toISOString(),
  }));
  void syncNow();
}

/** Visita aberta por engano, sem nada registrado: some do aparelho; se já foi ao servidor, é cancelada lá. */
export async function discardVisit(visitId: string, reason: string): Promise<boolean> {
  const v = state.visits[visitId];
  if (!v || Object.keys(v.attendances).length) return false;
  if (v.syncedRev === 0) {
    const rest = { ...state.visits };
    delete rest[visitId];
    await persistVisits(rest);
    return true;
  }
  await bumpVisit(visitId, (x) => ({ ...x, status: "cancelled", closeReason: reason, finishedAt: new Date().toISOString() }));
  void syncNow();
  return true;
}

/**
 * Remove do aparelho uma visita que o servidor recusou definitivamente (ex.: loja
 * desautorizada, programação já atendida em outro aparelho). Só com confirmação
 * explícita do promotor — nada some sozinho.
 */
export async function removeBlockedVisit(visitId: string): Promise<void> {
  const v = state.visits[visitId];
  if (!v?.blocked) return;
  for (const a of Object.values(v.attendances)) for (const p of a.photos) {
    await del(blobKey(p.id), idb);
    await del(thumbKey(p.id), idb);
  }
  const rest = { ...state.visits };
  delete rest[visitId];
  await persistVisits(rest);
}

// ───────────────────────────── Sincronização ─────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing: Promise<void> | null = null;

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), 1200);
}

export function pendingCount(s: LocalState = state): number {
  let n = 0;
  for (const v of Object.values(s.visits)) {
    if (v.blocked) continue;
    if (v.rev > v.syncedRev) n++;
    for (const a of Object.values(v.attendances)) if (attendanceDirty(a)) n++;
    n += pendingPhotos(v);
  }
  return n;
}

function toAttendanceInput(a: LocalAttendance): AttendanceInput {
  return {
    id: a.id,
    brandId: a.brandId,
    status: a.status === "correction_requested" ? "in_progress" : a.status,
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    activitiesDone: a.activitiesDone,
    notes: a.notes || null,
    exceptionItems: a.exceptionItems,
    exceptionReason: a.exceptionItems.length ? a.exceptionReason : null,
    exceptionNote: a.exceptionItems.length ? a.exceptionNote || null : null,
    cancelReason: a.cancelReason || null,
    photos: a.photos.map(({ id, kind, ruptureId, occurrenceId, validityId, damageId, source, takenAt }) => ({
      id,
      kind,
      ruptureId,
      occurrenceId,
      validityId: validityId ?? null,
      damageId: damageId ?? null,
      source,
      takenAt,
    })),
    deletedPhotoIds: a.deletedPhotoIds,
    stock: Object.values(a.stock),
    clearedStockProductIds: a.clearedStockProductIds,
    unregistered: Object.values(a.unregistered),
    deletedUnregisteredIds: a.deletedUnregisteredIds,
    ruptures: Object.values(a.ruptures),
    deletedRuptureIds: a.deletedRuptureIds,
    occurrences: Object.values(a.occurrences),
    deletedOccurrenceIds: a.deletedOccurrenceIds,
    validities: Object.values(a.validities ?? {}),
    deletedValidityIds: a.deletedValidityIds ?? [],
    damages: Object.values(a.damages ?? {}),
    deletedDamageIds: a.deletedDamageIds ?? [],
  };
}

function toVisitInput(v: LocalVisit): VisitInput {
  return {
    id: v.id,
    storeId: v.storeId,
    scheduleId: v.scheduleId,
    visitDate: v.visitDate,
    origin: v.origin,
    extraReason: v.extraReason || null,
    status: v.status,
    closeReason: v.closeReason || null,
    startedAt: v.startedAt,
    finishedAt: v.finishedAt,
    geo: v.geo,
    notes: v.notes || null,
    attendances: Object.values(v.attendances).filter(attendanceDirty).map(toAttendanceInput),
  };
}

export function syncNow(): Promise<void> {
  if (syncing) return syncing;
  syncing = doSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(): Promise<void> {
  const dirty = Object.values(state.visits).filter((v) => isVisitDirty(v) && !v.blocked);
  const withPhotos = Object.values(state.visits).filter((v) => pendingPhotos(v) > 0);
  if (!dirty.length && !withPhotos.length) return;
  emit({ sync: { ...state.sync, syncing: true } });
  let lastError: string | null = null;
  let needsRefresh = false;

  if (dirty.length) {
    const sent = dirty.map((v) => ({ visitId: v.id, rev: v.rev, attRevs: Object.fromEntries(Object.values(v.attendances).map((a) => [a.id, a.rev])) }));
    const res = await apiFetch("/api/promoter/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visits: dirty.map(toVisitInput) }),
    });
    if (res?.ok) {
      const { results } = (await res.json()) as { results: VisitSyncResult[] };
      const visits = { ...state.visits };
      for (const r of results) {
        const v = visits[r.visitId];
        const sentInfo = sent.find((x) => x.visitId === r.visitId);
        if (!v || !sentInfo) continue;
        const next: LocalVisit = { ...v, attendances: { ...v.attendances } };
        if (r.code === "forbidden" || r.code === "conflict") {
          next.blocked = true;
          next.serverError = r.error;
          lastError = r.error ?? "Visita recusada pelo servidor.";
          visits[r.visitId] = next;
          continue;
        }
        next.syncedRev = sentInfo.rev;
        if (r.closeRejected) {
          // Encerramento recusado: a visita volta a ficar aberta, com a explicação.
          next.status = "in_progress";
          next.finishedAt = null;
          next.serverError = r.error;
          lastError = r.error ?? null;
        } else {
          next.serverError = undefined;
        }
        for (const ar of r.attendances) {
          const a = next.attendances[ar.attendanceId];
          if (!a) continue;
          const sentRev = sentInfo.attRevs[ar.attendanceId] ?? a.rev;
          if (ar.ok) {
            next.attendances[ar.attendanceId] = { ...a, syncedRev: sentRev, serverError: undefined, locked: a.status === "completed" || a.status === "cancelled", correction: a.status === "completed" ? null : a.correction };
          } else if (ar.code === "locked") {
            next.attendances[ar.attendanceId] = { ...a, syncedRev: a.rev, locked: true, serverError: ar.error };
            needsRefresh = true;
          } else {
            // Recusado (ex.: faltou foto obrigatória): os dados foram gravados, o status volta para "em andamento".
            const back = a.correction ? "correction_requested" : "in_progress";
            next.attendances[ar.attendanceId] = { ...a, status: back, finishedAt: null, syncedRev: sentRev, serverError: ar.error };
            lastError = ar.error ?? "Atendimento recusado.";
          }
        }
        visits[r.visitId] = next;
      }
      await persistVisits(visits);
    } else if (res) {
      lastError = res.status === 400 ? "Dados recusados pelo servidor. Avise o gestor." : "Servidor indisponível. Tentaremos novamente.";
    }
  }

  // Fotos: só depois que o atendimento existe no servidor (antes disso, 409 e nova tentativa).
  outer: for (const v of Object.values(state.visits)) {
    for (const a of Object.values(v.attendances)) {
      if (a.syncedRev === 0) continue;
      for (const p of a.photos.filter((ph) => !ph.uploaded && ph.local)) {
        const blob = await getPhotoBlob(p.id);
        if (!blob) {
          await markPhoto(v.id, a.id, p.id, { local: false, lastError: "Arquivo não encontrado no aparelho." });
          continue;
        }
        const thumb = await getPhotoBlob(p.id, true);
        const form = new FormData();
        form.set("id", p.id);
        form.set("file", blob, `${p.id}.jpg`);
        if (thumb) form.set("thumb", thumb, `${p.id}_thumb.jpg`);
        const res = await apiFetch("/api/photos", { method: "POST", body: form });
        if (!res) break outer;
        if (res.ok) {
          await markPhoto(v.id, a.id, p.id, { uploaded: true, local: false, lastError: undefined });
          // Original sai do aparelho (exceto as do depois, que vão no grupo com o PDF); a miniatura
          // fica para o app e o PDF offline mostrarem a foto sem sinal.
          if (p.kind !== "after") await del(blobKey(p.id), idb);
        } else if (res.status === 400) {
          await markPhoto(v.id, a.id, p.id, { lastError: "Arquivo recusado (formato ou tamanho)." });
          lastError = "Uma foto foi recusada pelo servidor. Tire a foto novamente.";
        } else if (res.status !== 409) {
          lastError = "Falha ao enviar foto. Tentaremos novamente.";
        }
      }
    }
  }

  await pruneOldVisits();
  emit({ sync: { ...state.sync, syncing: false, lastError, lastSyncAt: lastError ? state.sync.lastSyncAt : new Date().toISOString() } });
  if (needsRefresh) void refreshBootstrap();
}

async function markPhoto(visitId: string, attendanceId: string, photoId: string, patch: Partial<LocalPhoto>) {
  const v = state.visits[visitId];
  const a = v?.attendances[attendanceId];
  if (!a) return;
  // Não incrementa rev: subir arquivo não muda os dados do atendimento.
  await persistVisits({
    ...state.visits,
    [visitId]: { ...v, attendances: { ...v.attendances, [attendanceId]: { ...a, photos: a.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)) } } },
  });
}

/** Visitas encerradas e 100% sincronizadas há mais de 2 dias saem do aparelho (ficam no histórico do servidor). */
async function pruneOldVisits() {
  const limit = Date.now() - 2 * 86_400_000;
  const keep: Record<string, LocalVisit> = {};
  let changed = false;
  for (const v of Object.values(state.visits)) {
    const old = v.status !== "in_progress" && isVisitFullySynced(v) && v.finishedAt !== null && new Date(v.finishedAt).getTime() < limit;
    const hasCorrection = Object.values(v.attendances).some((a) => a.status === "correction_requested");
    if (old && !hasCorrection) {
      changed = true;
      for (const a of Object.values(v.attendances))
        for (const p of a.photos) {
          await del(thumbKey(p.id), idb);
          await del(blobKey(p.id), idb);
        }
    } else keep[v.id] = v;
  }
  if (changed) await persistVisits(keep);
}
