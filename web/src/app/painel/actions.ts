"use server";

import { revalidatePath } from "next/cache";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { changeOccurrenceStatus, getOccurrenceDetail, type OccurrenceDetail } from "@/server/occurrences";
import { OCCURRENCE_STATUS_LABEL, type OccurrenceStatus } from "@/lib/domain";

export async function loadOccurrenceAction(id: string): Promise<OccurrenceDetail | null> {
  const scope = await getScope();
  return getOccurrenceDetail(scope, id);
}

export async function changeStatusAction(
  id: string,
  status: OccurrenceStatus,
  actionText: string,
  actionDate: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireRole(STAFF_ROLES);
  if (!(status in OCCURRENCE_STATUS_LABEL)) return { ok: false, error: "Status inválido." };
  const scope = await getScope();
  const res = await changeOccurrenceStatus(scope, id, status, actionText.slice(0, 1000) || null, actionDate);
  if (res.ok) revalidatePath("/painel", "layout");
  return res;
}
