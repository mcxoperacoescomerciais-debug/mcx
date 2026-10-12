"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import { setStoreCoords } from "@/server/admin";
import { storeCoordsFromVisit } from "@/server/map";
import type { FormState } from "../actions";

/** Usa como localização da loja a última localização registrada numa visita a ela. */
export async function applyVisitLocationAction(_: FormState, fd: FormData): Promise<FormState> {
  const scope = await getScope();
  const storeId = String(fd.get("storeId") ?? "");
  const suggestion = await storeCoordsFromVisit(scope, storeId);
  if (!suggestion) return { ok: false, error: "Nenhuma localização registrada em visita para esta loja." };
  const r = await setStoreCoords(scope, storeId, suggestion, `Localização registrada na visita de ${suggestion.date}`);
  if (r.ok) revalidatePath("/painel/mapa");
  return r;
}
