"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import * as pf from "@/server/portfolio";
import type { FormState } from "../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function done(r: Awaited<ReturnType<typeof pf.saveTarget>>): FormState {
  if (r.ok) revalidatePath("/painel/metas");
  return r;
}

export async function saveTargetAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await pf.saveTarget(await getScope(), { promoterId: str(fd, "promoterId"), storeId: str(fd, "storeId"), brandId: str(fd, "brandId"), perWeek: Number(str(fd, "perWeek")) }));
}

export async function deleteTargetAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await pf.deleteTarget(await getScope(), str(fd, "id")));
}
