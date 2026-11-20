"use server";
/**
 * Server actions do MCX Operações. TODA action começa com actionUser(): sem
 * sessão válida do Operações, responde erro e não toca no banco (há teste que
 * falha se alguma action nova esquecer disso). A permissão por papel é
 * conferida de novo dentro de cada função de servidor.
 */
import { revalidatePath } from "next/cache";
import type { ClientKind, Role, Status } from "@/lib/domain";
import { actionUser } from "@/server/auth";
import * as demands from "@/server/demands";
import type { DemandInput, DemandPatch, Result } from "@/server/demands";
import * as registry from "@/server/registry";

const EXPIRED = { ok: false as const, error: "Sessão expirada. Entre de novo." };

function done<T extends Result<object>>(result: T): T {
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function createDemandAction(input: DemandInput, confirmDuplicate = false) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.createDemand(user, input, { confirmDuplicate }));
}

export async function updateDemandAction(id: string, patch: DemandPatch) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.updateDemand(user, id, patch));
}

export async function changeStatusAction(id: string, status: Status, extra: { waitingFor?: string | null; followUpDate?: string | null } = {}) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.changeStatus(user, id, status, extra));
}

export async function addCommentAction(id: string, body: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.addComment(user, id, body));
}

export async function addChecklistItemAction(id: string, text: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.addChecklistItem(user, id, text));
}

export async function toggleChecklistItemAction(itemId: string, checked: boolean) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.toggleChecklistItem(user, itemId, checked));
}

export async function removeChecklistItemAction(itemId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.removeChecklistItem(user, itemId));
}

export async function setSharesAction(id: string, userIds: string[]) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.setShares(user, id, userIds));
}

export async function deleteDemandAction(id: string, reason: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await demands.deleteDemand(user, id, reason));
}

export async function saveClientAction(id: string | null, input: { name: string; kind: ClientKind; document?: string | null; status?: "active" | "inactive"; notes?: string | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.saveClient(user, id, input));
}

export async function addContactAction(clientId: string, input: { name: string; role?: string; whatsapp?: string; email?: string }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.addContact(user, clientId, input));
}

export async function removeContactAction(contactId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.removeContact(user, contactId));
}

export async function addBrandAction(clientId: string, name: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.addBrand(user, clientId, name));
}

export async function removeBrandAction(brandId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.removeBrand(user, brandId));
}

export async function saveCategoryAction(id: string | null, input: { name: string; active?: boolean }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.saveCategory(user, id, input));
}

export async function createUserAction(input: { name: string; username: string; role: Role; password: string }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.createUser(user, input));
}

export async function updateUserAction(id: string, input: { role?: Role; status?: "active" | "inactive"; resetPassword?: string }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.updateUser(user, id, input));
}
