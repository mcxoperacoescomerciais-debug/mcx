/**
 * Contrato entre o app do promotor (offline-first) e o servidor.
 *
 * O aparelho envia o "documento" da visita (só os atendimentos alterados),
 * sempre com IDs gerados no próprio aparelho. O servidor faz upsert idempotente
 * e revalida TODAS as regras — o que vem do celular nunca é confiado às cegas.
 */
import { z } from "zod";
import {
  EXCEPTION_ITEMS,
  EXCEPTION_REASONS,
  OCCURRENCE_CATEGORIES,
  PHOTO_KINDS,
  PHOTO_SOURCES,
  RUPTURE_SITUATIONS,
  STOCK_STATES,
  type AttendanceStatus,
  type Unit,
} from "./domain";

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shortText = (max = 500) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));

export const photoInput = z.object({
  id,
  kind: z.enum(PHOTO_KINDS),
  ruptureId: id.nullable().optional().default(null),
  occurrenceId: id.nullable().optional().default(null),
  source: z.enum(PHOTO_SOURCES),
  takenAt: instant,
});

export const stockInput = z.object({
  productId: id,
  state: z.enum(STOCK_STATES),
  quantity: z.number().int().min(0).max(100_000).nullable(),
  note: shortText(300),
  recordedAt: instant,
});

export const unregisteredInput = z.object({
  id,
  description: z.string().trim().min(2).max(160),
  quantity: z.number().int().min(0).max(100_000).nullable(),
  note: shortText(300),
});

export const ruptureInput = z.object({
  id,
  productId: id,
  situation: z.enum(RUPTURE_SITUATIONS),
  knownStock: z.number().int().min(0).max(100_000).nullable(),
  note: shortText(300),
  fromStockSuggestion: z.boolean(),
  recordedAt: instant,
});

export const occurrenceInput = z.object({
  id,
  category: z.enum(OCCURRENCE_CATEGORIES),
  note: shortText(500),
  recordedAt: instant,
});

export const attendanceInput = z.object({
  id,
  brandId: id,
  status: z.enum(["in_progress", "completed", "cancelled"]),
  startedAt: instant,
  finishedAt: instant.nullable(),
  activitiesDone: z.array(z.string().max(200)).max(50),
  notes: shortText(1000),
  exceptionItems: z.array(z.enum(EXCEPTION_ITEMS)).max(3),
  exceptionReason: z.enum(EXCEPTION_REASONS).nullable(),
  exceptionNote: shortText(500),
  cancelReason: shortText(500),
  photos: z.array(photoInput).max(60),
  deletedPhotoIds: z.array(id).max(200),
  stock: z.array(stockInput).max(500),
  clearedStockProductIds: z.array(id).max(500),
  unregistered: z.array(unregisteredInput).max(50),
  deletedUnregisteredIds: z.array(id).max(100),
  ruptures: z.array(ruptureInput).max(500),
  deletedRuptureIds: z.array(id).max(500),
  occurrences: z.array(occurrenceInput).max(50),
  deletedOccurrenceIds: z.array(id).max(100),
});

export const visitInput = z.object({
  id,
  storeId: id,
  scheduleId: id.nullable(),
  visitDate: isoDate,
  origin: z.enum(["scheduled", "extra"]),
  extraReason: shortText(500),
  status: z.enum(["in_progress", "completed", "closed_incomplete", "cancelled"]),
  closeReason: shortText(500),
  startedAt: instant,
  finishedAt: instant.nullable(),
  geo: z
    .object({
      status: z.enum(["captured", "denied", "unavailable", "disabled"]),
      lat: z.number().min(-90).max(90).nullable(),
      lng: z.number().min(-180).max(180).nullable(),
      accuracy: z.number().min(0).max(1e6).nullable(),
    })
    .nullable(),
  notes: shortText(1000),
  /** Só os atendimentos alterados desde a última sincronização. */
  attendances: z.array(attendanceInput).max(60),
});

export const syncRequest = z.object({ visits: z.array(visitInput).min(1).max(30) });

export type PhotoInput = z.infer<typeof photoInput>;
export type StockInput = z.infer<typeof stockInput>;
export type UnregisteredInput = z.infer<typeof unregisteredInput>;
export type RuptureInput = z.infer<typeof ruptureInput>;
export type OccurrenceInput = z.infer<typeof occurrenceInput>;
export type AttendanceInput = z.infer<typeof attendanceInput>;
export type VisitInput = z.infer<typeof visitInput>;

export interface AttendanceSyncResult {
  attendanceId: string;
  ok: boolean;
  /** "locked": finalizado no servidor; o aparelho deve adotar a versão do servidor. */
  code?: "locked" | "invalid" | "forbidden";
  error?: string;
}

export interface VisitSyncResult {
  visitId: string;
  ok: boolean;
  code?: "forbidden" | "invalid" | "conflict";
  error?: string;
  /** O encerramento da visita foi recusado (a visita continua aberta). */
  closeRejected?: boolean;
  attendances: AttendanceSyncResult[];
}

// ───────────────────────────── Bootstrap (dados para trabalhar offline) ─────────────────────────────

export interface BootstrapBrand {
  id: string;
  name: string;
  code: string;
  minBeforePhotos: number;
  minAfterPhotos: number;
  requireStock: boolean;
  rupturePhotoRequired: boolean;
  allowGallery: boolean;
  activities: string[];
}

export interface BootstrapStore {
  id: string;
  name: string;
  chainName: string | null;
  code: string | null;
  address: string | null;
  district: string | null;
  city: string;
  state: string;
  /** Marcas que ESTE promotor pode atender nesta loja. */
  brandIds: string[];
}

export interface BootstrapProduct {
  id: string;
  brandId: string;
  name: string;
  sku: string;
  ean: string | null;
  category: string | null;
  variant: string | null;
  package: string | null;
  unit: Unit;
}

export interface BootstrapSchedule {
  id: string;
  date: string;
  storeId: string;
  seq: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  brandIds: string[];
  notes: string | null;
}

/** Versão do servidor de uma visita do promotor (para retomar em outro aparelho ou corrigir). */
export interface ServerAttendance extends Omit<AttendanceInput, "status" | "photos"> {
  status: AttendanceStatus;
  photos: (PhotoInput & { uploaded: boolean })[];
  correction: { id: string; reason: string; requestedAt: string } | null;
  reviewStatus: string;
  reviewNote: string | null;
}

export interface ServerVisit extends Omit<VisitInput, "attendances"> {
  attendances: ServerAttendance[];
}

export interface BootstrapPayload {
  user: { id: string; name: string; employment: string | null; mustChangePassword: boolean };
  agency: { name: string; logoUrl: string | null };
  settings: { allowIncompleteVisit: boolean; allowExtraVisits: boolean; captureLocation: boolean; allowExceptions: boolean };
  today: string;
  brands: BootstrapBrand[];
  stores: BootstrapStore[];
  products: BootstrapProduct[];
  /** storeId → produtos acompanhados (só lojas com lista própria; demais = todos da marca). */
  storeProducts: Record<string, string[]>;
  schedules: BootstrapSchedule[];
  visits: ServerVisit[];
  /** Último levantamento de estoque por loja/produto (referência para o promotor). */
  lastStock: Record<string, Record<string, { state: string; quantity: number | null; date: string }>>;
  serverTime: string;
}

export interface PromoterHistoryItem {
  visitId: string;
  visitDate: string;
  storeName: string;
  chainName: string | null;
  city: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  brands: { attendanceId: string; brandName: string; status: string; ruptures: number; correction: boolean }[];
}
