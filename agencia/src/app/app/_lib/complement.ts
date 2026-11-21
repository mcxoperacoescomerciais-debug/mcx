/**
 * Complemento de visita: a visita do dia na loja já foi encerrada e ficou marca
 * sem atender (ex.: visita fora da programação iniciada só com uma marca). O
 * promotor abre uma visita complementar para as marcas que faltaram.
 */
import type { LocalVisit } from "./local-store";

type VisitLike = Pick<LocalVisit, "id" | "storeId" | "visitDate" | "status" | "attendances">;

/** Visitas não canceladas da mesma loja no mesmo dia (inclui a própria). */
export function sameDayStoreVisits<V extends VisitLike>(visits: V[], storeId: string, date: string): V[] {
  return visits.filter((v) => v.storeId === storeId && v.visitDate === date && v.status !== "cancelled");
}

/** Marcas da loja que não têm nenhum atendimento nas visitas do dia. */
export function remainingStoreBrands(storeBrandIds: string[], dayVisits: VisitLike[]): string[] {
  const touched = new Set(dayVisits.flatMap((v) => Object.values(v.attendances).map((a) => a.brandId)));
  return storeBrandIds.filter((b) => !touched.has(b));
}

/** Marcas com atendimento em OUTRA visita do dia na mesma loja (não repetir na tela desta). */
export function brandsInOtherVisits(visitId: string, dayVisits: VisitLike[]): Set<string> {
  return new Set(dayVisits.filter((v) => v.id !== visitId).flatMap((v) => Object.values(v.attendances).map((a) => a.brandId)));
}

/** Visita que a lista de lojas abre: a que está em andamento; senão, a mais recente do dia. */
export function currentStoreVisit<V extends VisitLike & Pick<LocalVisit, "startedAt">>(dayVisits: V[]): V | undefined {
  return dayVisits.find((v) => v.status === "in_progress") ?? [...dayVisits].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export const COMPLEMENT_REASON = "Complemento da visita de hoje: marca que faltou atender.";
