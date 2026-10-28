/**
 * Posição da loja aprendida no check-in.
 *
 * Loja sem posição (sem endereço na planilha) fica com a posição do 1º check-in
 * com GPS bom; loja com posição aproximada (só a rua foi localizada) é corrigida
 * pelo 1º check-in a até 1,5 km dela. Sem endereço escrito, o endereço é obtido
 * da posição (OpenStreetMap) depois de gravar a visita.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { schema as s, type DB } from "./db";
import { distanceM } from "@/lib/rules";

/** Precisão mínima do GPS para a posição virar a da loja. */
export const LEARN_MAX_ACCURACY_M = 100;
/** Distância máxima para o check-in corrigir uma posição aproximada. */
export const APPROX_FIX_MAX_M = 1500;

type Tx = Pick<DB, "select" | "update">;
type Geo = { status?: string | null; lat?: number | null; lng?: number | null; accuracy?: number | null } | null | undefined;

/** Decide se o check-in define a posição da loja (regra pura, testável). */
export function shouldLearnLocation(
  store: { lat: number | null; lng: number | null; geoSource: string | null },
  geo: Geo,
): boolean {
  if (!geo || geo.lat == null || geo.lng == null) return false;
  if (geo.accuracy == null || geo.accuracy > LEARN_MAX_ACCURACY_M) return false;
  if (store.lat == null || store.lng == null) return true;
  if (store.geoSource !== "address_approx") return false;
  return distanceM({ lat: store.lat, lng: store.lng }, { lat: geo.lat, lng: geo.lng }) <= APPROX_FIX_MAX_M;
}

/** Grava a posição do check-in na loja quando a regra permite. Devolve se precisa buscar o endereço. */
export async function learnStoreLocation(tx: Tx, storeId: string, geo: Geo): Promise<{ learned: boolean; needsAddress: boolean }> {
  const [store] = await tx.select({ lat: s.stores.lat, lng: s.stores.lng, geoSource: s.stores.geoSource, address: s.stores.address }).from(s.stores).where(eq(s.stores.id, storeId));
  if (!store || !shouldLearnLocation(store, geo)) return { learned: false, needsAddress: false };
  await tx.update(s.stores).set({ lat: geo!.lat!, lng: geo!.lng!, geoSource: "checkin", updatedAt: new Date() }).where(eq(s.stores.id, storeId));
  return { learned: true, needsAddress: !store.address?.trim() };
}

/** Endereço a partir da posição (OpenStreetMap). Falha em silêncio: a posição já vale. */
export async function fillAddressFromPosition(db: DB, storeId: string, lat: number, lng: number): Promise<void> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { "User-Agent": "mcx-campo (mcx-campo.onrender.com)", "Accept-Language": "pt-BR" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const j = (await res.json()) as { address?: Record<string, string> };
    const a = j.address ?? {};
    const street = [a.road, a.house_number].filter(Boolean).join(", ");
    if (!street) return;
    const district = a.suburb ?? a.neighbourhood ?? a.quarter ?? null;
    const [store] = await db.select({ address: s.stores.address, district: s.stores.district }).from(s.stores).where(eq(s.stores.id, storeId));
    if (!store || store.address?.trim()) return;
    await db
      .update(s.stores)
      .set({ address: street, district: store.district?.trim() ? store.district : district, updatedAt: new Date() })
      .where(eq(s.stores.id, storeId));
  } catch {
    // sem rede ou serviço fora: tenta de novo no próximo check-in que corrigir a posição
  }
}
