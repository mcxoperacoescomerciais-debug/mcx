/**
 * Estado local do app do promotor — offline-first.
 *
 * Tudo que o promotor faz é gravado primeiro no IndexedDB do aparelho e só
 * depois enviado ao servidor por `syncNow()`. Cada visita/item tem `rev`
 * (versão local) e `syncedRev` (última versão confirmada pelo servidor): o
 * que tiver rev > syncedRev está pendente. Fotos ficam como Blob no IndexedDB
 * até o upload ser confirmado.
 *
 * Exposto como um store externo (subscribe/getSnapshot) para o React usar
 * com useSyncExternalStore.
 */
import { createStore, del, get, set } from "idb-keyval";
import type { BootstrapPayload, OccurrenceInput, PromoterVisitSummary, SyncResult, VisitInput } from "@/lib/sync-types";
import { todayIso } from "@/lib/validity";

export interface LocalPhoto {
  id: string;
  occurrenceId: string;
  uploaded: boolean;
}

export type LocalOccurrence = OccurrenceInput & {
  createdAt: string;
  photos: LocalPhoto[];
};

export interface LocalVisit {
  id: string;
  storeId: string;
  visitDate: string;
  startedAt: string;
  finishedAt: string | null;
  status: "in_progress" | "finished";
  checklist: Record<string, boolean>;
  notes: string;
  occurrences: Record<string, LocalOccurrence>;
  deletedOccurrenceIds: string[];
  rev: number;
  syncedRev: number;
  lastError?: string;
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
  visits: Record<string, LocalVisit>;
  history: PromoterVisitSummary[] | null;
  sync: SyncState;
  /** true quando o servidor respondeu 401 — o app manda para o login. */
  sessionExpired: boolean;
  /** Formato escolhido pelo promotor por loja (ABC: varejo/plus/cash), valendo mesmo sem internet. */
  formatChoices: Record<string, string>;
}

const idb = typeof window !== "undefined" ? createStore("mcx-suinco", "kv") : undefined;
const KEY_BOOTSTRAP = "bootstrap";
const KEY_VISITS = "visits";
const KEY_FORMATS = "storeFormats";
const photoKey = (id: string) => `photo:${id}`;

let state: LocalState = {
  ready: false,
  bootstrap: null,
  visits: {},
  history: null,
  sync: { online: true, syncing: false, lastSyncAt: null, lastError: null },
  sessionExpired: false,
  formatChoices: {},
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
  const [bootstrap, visits, formatChoices] = await Promise.all([
    get<BootstrapPayload>(KEY_BOOTSTRAP, idb),
    get<Record<string, LocalVisit>>(KEY_VISITS, idb),
    get<Record<string, string>>(KEY_FORMATS, idb),
  ]);
  emit({
    ready: true,
    bootstrap: bootstrap ?? null,
    visits: visits ?? {},
    formatChoices: formatChoices ?? {},
    sync: { ...state.sync, online: navigator.onLine },
  });

  window.addEventListener("online", () => {
    emit({ sync: { ...state.sync, online: true } });
    void syncNow();
  });
  window.addEventListener("offline", () => emit({ sync: { ...state.sync, online: false } }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshAll();
  });
  setInterval(() => void syncNow(), 20_000);
  await refreshAll();
}

async function refreshAll() {
  await syncNow();
  await refreshBootstrap();
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(input, { ...init, credentials: "same-origin" });
    if (res.status === 401) {
      emit({ sessionExpired: true });
      return null;
    }
    emit({ sync: { ...state.sync, online: true } });
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
  // Troca de usuário no mesmo aparelho: descarta visitas JÁ sincronizadas do anterior.
  if (state.bootstrap && state.bootstrap.user.id !== bootstrap.user.id) {
    const pending = Object.values(state.visits).filter((v) => v.rev > v.syncedRev);
    if (!pending.length) await persistVisits({});
  }
  emit({ bootstrap });
  await set(KEY_BOOTSTRAP, bootstrap, idb);
}

export async function refreshHistory(): Promise<void> {
  const res = await apiFetch("/api/promoter/visits");
  if (!res?.ok) return;
  emit({ history: (await res.json()) as PromoterVisitSummary[] });
}

// ───────────────────────────── Mutações (sempre locais primeiro) ─────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function updateVisit(visitId: string, fn: (v: LocalVisit) => LocalVisit): Promise<void> {
  const current = state.visits[visitId];
  if (!current) return Promise.resolve();
  const next = { ...fn(current), rev: current.rev + 1 };
  const p = persistVisits({ ...state.visits, [visitId]: next });
  scheduleSync();
  return p;
}

/** Guarda o formato da loja escolhido pelo promotor; vai para o servidor junto com a próxima visita da loja. */
export async function chooseStoreFormat(storeId: string, format: string): Promise<void> {
  const formatChoices = { ...state.formatChoices, [storeId]: format };
  emit({ formatChoices });
  await set(KEY_FORMATS, formatChoices, idb);
  // Visitas em andamento da loja reenviam o formato novo.
  for (const v of Object.values(state.visits)) if (v.storeId === storeId && v.status === "in_progress") await updateVisit(v.id, (x) => x);
}

export async function startVisit(storeId: string): Promise<string> {
  const existing = Object.values(state.visits).find((v) => v.storeId === storeId && v.status === "in_progress");
  if (existing) return existing.id;
  const id = uuid();
  const visit: LocalVisit = {
    id,
    storeId,
    visitDate: todayIso(),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "in_progress",
    checklist: {},
    notes: "",
    occurrences: {},
    deletedOccurrenceIds: [],
    rev: 1,
    syncedRev: 0,
  };
  await persistVisits({ ...state.visits, [id]: visit });
  scheduleSync();
  return id;
}

export type OccurrenceDraft = Omit<OccurrenceInput, "id"> & { id?: string };

export async function saveOccurrence(visitId: string, draft: OccurrenceDraft): Promise<string> {
  const id = draft.id ?? uuid();
  await updateVisit(visitId, (v) => {
    const prev = v.occurrences[id];
    return {
      ...v,
      occurrences: {
        ...v.occurrences,
        [id]: { ...draft, id, createdAt: prev?.createdAt ?? new Date().toISOString(), photos: prev?.photos ?? [] },
      },
    };
  });
  return id;
}

export async function deleteOccurrence(visitId: string, occurrenceId: string): Promise<void> {
  const occ = state.visits[visitId]?.occurrences[occurrenceId];
  await updateVisit(visitId, (v) => {
    const rest = { ...v.occurrences };
    delete rest[occurrenceId];
    return { ...v, occurrences: rest, deletedOccurrenceIds: [...v.deletedOccurrenceIds, occurrenceId] };
  });
  for (const p of occ?.photos ?? []) await del(photoKey(p.id), idb);
}

export async function setVisitFields(visitId: string, fields: Partial<Pick<LocalVisit, "notes" | "checklist">>): Promise<void> {
  await updateVisit(visitId, (v) => ({ ...v, ...fields }));
}

export async function finishVisit(visitId: string): Promise<void> {
  await updateVisit(visitId, (v) => ({ ...v, status: "finished", finishedAt: new Date().toISOString() }));
  await syncNow();
}

export async function reopenVisit(visitId: string): Promise<void> {
  await updateVisit(visitId, (v) => ({ ...v, status: "in_progress", finishedAt: null }));
}

/** Descarta uma visita iniciada por engano (só se nada foi registrado). */
export async function discardVisit(visitId: string): Promise<boolean> {
  const v = state.visits[visitId];
  if (!v || Object.keys(v.occurrences).length) return false;
  const rest = { ...state.visits };
  delete rest[visitId];
  await persistVisits(rest);
  return true;
}

export async function addPhoto(visitId: string, occurrenceId: string, blob: Blob): Promise<void> {
  const id = uuid();
  await set(photoKey(id), blob, idb);
  await updateVisit(visitId, (v) => {
    const occ = v.occurrences[occurrenceId];
    if (!occ) return v;
    return {
      ...v,
      occurrences: { ...v.occurrences, [occurrenceId]: { ...occ, photos: [...occ.photos, { id, occurrenceId, uploaded: false }] } },
    };
  });
}

export async function removePhoto(visitId: string, occurrenceId: string, photoId: string): Promise<void> {
  await updateVisit(visitId, (v) => {
    const occ = v.occurrences[occurrenceId];
    if (!occ) return v;
    return { ...v, occurrences: { ...v.occurrences, [occurrenceId]: { ...occ, photos: occ.photos.filter((p) => p.id !== photoId) } } };
  });
  await del(photoKey(photoId), idb);
}

export function getPhotoBlob(photoId: string): Promise<Blob | undefined> {
  return get<Blob>(photoKey(photoId), idb);
}

// ───────────────────────────── Sincronização ─────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing: Promise<void> | null = null;

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), 1500);
}

export function pendingCount(s: LocalState = state): number {
  let n = 0;
  for (const v of Object.values(s.visits)) {
    if (v.rev > v.syncedRev) n++;
    for (const o of Object.values(v.occurrences)) n += o.photos.filter((p) => !p.uploaded).length;
  }
  return n;
}

function toOccurrenceInput(o: LocalOccurrence): OccurrenceInput {
  const { createdAt, photos, ...input } = o;
  void createdAt;
  void photos;
  return input;
}

function toVisitInput(v: LocalVisit): VisitInput {
  return {
    id: v.id,
    storeId: v.storeId,
    visitDate: v.visitDate,
    startedAt: v.startedAt,
    finishedAt: v.finishedAt,
    status: v.status,
    checklist: v.checklist,
    notes: v.notes || null,
    occurrences: Object.values(v.occurrences).map(toOccurrenceInput),
    deletedOccurrenceIds: v.deletedOccurrenceIds,
    storeFormat: (state.formatChoices[v.storeId] as VisitInput["storeFormat"]) ?? null,
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
  const dirty = Object.values(state.visits).filter((v) => v.rev > v.syncedRev);
  const withPhotos = Object.values(state.visits).filter((v) =>
    Object.values(v.occurrences).some((o) => o.photos.some((p) => !p.uploaded)),
  );
  if (!dirty.length && !withPhotos.length) return;
  emit({ sync: { ...state.sync, syncing: true } });

  let lastError: string | null = null;
  if (dirty.length) {
    const sentRevs = Object.fromEntries(dirty.map((v) => [v.id, v.rev]));
    const res = await apiFetch("/api/promoter/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visits: dirty.map(toVisitInput) }),
    });
    if (res?.ok) {
      const { results } = (await res.json()) as { results: SyncResult[] };
      const visits = { ...state.visits };
      for (const r of results) {
        const v = visits[r.visitId];
        if (!v) continue;
        visits[r.visitId] = r.ok
          ? { ...v, syncedRev: sentRevs[r.visitId], lastError: undefined }
          : { ...v, lastError: r.error };
        if (!r.ok) lastError = r.error ?? "Erro ao sincronizar";
      }
      await persistVisits(visits);
    } else if (res) {
      lastError = "Servidor indisponível. Tentaremos novamente.";
    }
  }

  // Fotos só depois do item existir no servidor (o servidor responde 409 se ainda não existir).
  for (const v of Object.values(state.visits)) {
    if (v.syncedRev === 0) continue;
    for (const o of Object.values(v.occurrences)) {
      for (const p of o.photos.filter((ph) => !ph.uploaded)) {
        const blob = await getPhotoBlob(p.id);
        if (!blob) {
          await markPhotoUploaded(v.id, o.id, p.id);
          continue;
        }
        const form = new FormData();
        form.set("id", p.id);
        form.set("visitId", v.id);
        form.set("occurrenceId", o.id);
        form.set("file", blob, `${p.id}.jpg`);
        const res = await apiFetch("/api/photos", { method: "POST", body: form });
        if (res?.ok) {
          await markPhotoUploaded(v.id, o.id, p.id);
          await del(photoKey(p.id), idb);
        } else if (!res) {
          break;
        } else if (res.status === 400) {
          // Arquivo recusado (formato/tamanho): tentar de novo não resolve, e
          // ficar pendente travaria o PDF da visita para sempre.
          await markPhotoUploaded(v.id, o.id, p.id);
          lastError = "Uma foto não pôde ser enviada (arquivo inválido).";
        }
      }
    }
  }

  await pruneOldVisits();
  emit({ sync: { ...state.sync, syncing: false, lastError, lastSyncAt: lastError ? state.sync.lastSyncAt : new Date().toISOString() } });
}

async function markPhotoUploaded(visitId: string, occurrenceId: string, photoId: string) {
  const v = state.visits[visitId];
  const o = v?.occurrences[occurrenceId];
  if (!o) return;
  // Não incrementa rev: subir foto não muda os dados da visita.
  await persistVisits({
    ...state.visits,
    [visitId]: {
      ...v,
      occurrences: { ...v.occurrences, [occurrenceId]: { ...o, photos: o.photos.map((p) => (p.id === photoId ? { ...p, uploaded: true } : p)) } },
    },
  });
}

/** Visitas finalizadas e 100% sincronizadas há mais de 3 dias saem do aparelho (ficam no histórico do servidor). */
async function pruneOldVisits() {
  const limit = Date.now() - 3 * 86_400_000;
  const keep: Record<string, LocalVisit> = {};
  let changed = false;
  for (const v of Object.values(state.visits)) {
    const done =
      v.status === "finished" &&
      v.rev === v.syncedRev &&
      Object.values(v.occurrences).every((o) => o.photos.every((p) => p.uploaded)) &&
      v.finishedAt !== null &&
      new Date(v.finishedAt).getTime() < limit;
    if (done) changed = true;
    else keep[v.id] = v;
  }
  if (changed) await persistVisits(keep);
}

export function isVisitFullySynced(v: LocalVisit): boolean {
  return v.rev === v.syncedRev && Object.values(v.occurrences).every((o) => o.photos.every((p) => p.uploaded));
}
