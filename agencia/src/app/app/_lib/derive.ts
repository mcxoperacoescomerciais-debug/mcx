/**
 * Cálculos de tela do app do promotor (puros, a partir do estado local).
 */
import { attendanceMissing, type MissingItem } from "@/lib/rules";
import type { AttendanceDisplayStatus } from "@/lib/domain";
import type { BootstrapBrand, BootstrapProduct } from "@/lib/sync-types";
import { attendanceDisplayStatus, isVisitFullySynced, type LocalAttendance, type LocalVisit } from "./local-store";

export interface BrandSlot {
  brandId: string;
  attendance: LocalAttendance | undefined;
  status: AttendanceDisplayStatus;
  planned: boolean;
}

/** Marcas da visita (previstas + extras iniciadas), cada uma com seu status. */
export function brandSlots(visit: LocalVisit | undefined, plannedBrandIds: string[]): BrandSlot[] {
  const atts = Object.values(visit?.attendances ?? {});
  const planned = visit?.plannedBrandIds.length ? visit.plannedBrandIds : plannedBrandIds;
  const ids = [...new Set([...planned, ...atts.map((a) => a.brandId)])];
  return ids.map((brandId) => {
    const attendance = atts.find((a) => a.brandId === brandId);
    return { brandId, attendance, status: attendanceDisplayStatus(attendance), planned: planned.includes(brandId) };
  });
}

export function isDoneStatus(s: AttendanceDisplayStatus): boolean {
  return s === "completed" || s === "awaiting_sync" || s === "cancelled";
}

export type StopStatus = "pending" | "in_progress" | "completed" | "closed_incomplete" | "awaiting_sync" | "blocked";

export function stopStatus(visit: LocalVisit | undefined): StopStatus {
  if (!visit) return "pending";
  if (visit.blocked) return "blocked";
  if (visit.status === "in_progress") return "in_progress";
  if (!isVisitFullySynced(visit)) return "awaiting_sync";
  return visit.status === "closed_incomplete" ? "closed_incomplete" : "completed";
}

export const STOP_STATUS_LABEL: Record<StopStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  completed: "Concluída",
  closed_incomplete: "Encerrada incompleta",
  awaiting_sync: "Aguardando sincronização",
  blocked: "Recusada pelo servidor",
};

export const STOP_STATUS_TONE = {
  pending: "neutral",
  in_progress: "info",
  completed: "success",
  closed_incomplete: "warning",
  awaiting_sync: "sync",
  blocked: "danger",
} as const;

export function missingFor(a: LocalAttendance, brand: BootstrapBrand, tracked: BootstrapProduct[], allowExceptions: boolean): MissingItem[] {
  return attendanceMissing({
    brand,
    beforePhotos: a.photos.filter((p) => p.kind === "before").length,
    afterPhotos: a.photos.filter((p) => p.kind === "after").length,
    trackedProductIds: tracked.map((p) => p.id),
    stock: Object.fromEntries(Object.values(a.stock).map((x) => [x.productId, x.state])),
    ruptures: Object.values(a.ruptures).map((r) => ({ productId: r.productId, photos: a.photos.filter((p) => p.ruptureId === r.id).length })),
    exceptionItems: a.exceptionItems,
    exceptionReason: a.exceptionReason,
    exceptionNote: a.exceptionNote,
    allowExceptions,
  });
}
