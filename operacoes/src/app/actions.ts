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
import type { Outcome, InteractionKind } from "@/lib/crm";
import * as crm from "@/server/crm";
import type { LeadInput, MoveExtra } from "@/server/crm";
import * as demands from "@/server/demands";
import type { DemandInput, DemandPatch, Result } from "@/server/demands";
import * as registry from "@/server/registry";
import * as routines from "@/server/routines";
import type { RoutineInput } from "@/server/routines";
import * as templates from "@/server/templates";
import type { TemplateInput } from "@/server/templates";
import * as time from "@/server/time";

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

export async function changeStatusAction(id: string, status: Status, extra: { waitingFor?: string | null; followUpDate?: string | null; minutes?: number | null } = {}) {
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

export async function saveClientAction(id: string | null, input: { name: string; kind: ClientKind; document?: string | null; status?: "active" | "inactive"; notes?: string | null; monthlyValueCents?: number | null }) {
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

export async function updateUserAction(id: string, input: { role?: Role; status?: "active" | "inactive"; resetPassword?: string; weeklyHours?: number; costPerHourCents?: number | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.updateUser(user, id, input));
}

export async function saveTypeAction(id: string | null, input: { categoryId?: string; name: string; active?: boolean }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await registry.saveType(user, id, input));
}

export async function startTimerAction(demandId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await time.startTimer(user, demandId));
}

export async function stopTimerAction() {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await time.stopTimer(user));
}

export async function addTimeEntryAction(demandId: string, input: { day: string; minutes: number; note?: string | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await time.addManualEntry(user, demandId, input));
}

export async function updateTimeEntryAction(entryId: string, minutes: number) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await time.updateEntry(user, entryId, minutes));
}

export async function deleteTimeEntryAction(entryId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await time.deleteEntry(user, entryId));
}

export async function applyTemplateAction(demandId: string, templateId: string, actions: number) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.applyTemplate(user, demandId, templateId, actions));
}

export async function saveAsTemplateAction(demandId: string, name: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.saveAsTemplate(user, demandId, name));
}

export async function setItemNotApplicableAction(itemId: string, reason: string | null) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.setItemNotApplicable(user, itemId, reason));
}

export async function verifyItemAction(itemId: string, verified: boolean) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.verifyItem(user, itemId, verified));
}

export async function reportMissAction(demandId: string, input: { item: string; quantity?: string | null; impact?: string | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.reportMiss(user, demandId, input));
}

export async function addMissToTemplateAction(missId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.addMissToTemplate(user, missId));
}

export async function saveTemplateAction(id: string | null, input: TemplateInput) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.saveTemplate(user, id, input));
}

export async function duplicateTemplateAction(id: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await templates.duplicateTemplate(user, id));
}

export async function saveRoutineAction(id: string | null, input: RoutineInput) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await routines.saveRoutine(user, id, input));
}

export async function createLeadAction(input: LeadInput, confirmDuplicate = false) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.createLead(user, input, { confirmDuplicate }));
}

export async function updateLeadAction(id: string, input: LeadInput) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.updateLead(user, id, input));
}

export async function setNextActionAction(id: string, nextAction: string, nextActionDate: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.setNextAction(user, id, nextAction, nextActionDate));
}

export async function moveLeadAction(id: string, stageId: string, extra: MoveExtra = {}) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.moveLead(user, id, stageId, extra));
}

export async function addInteractionAction(leadId: string, input: { kind: InteractionKind; summary: string; outcome: Outcome; nextAction?: string | null; nextActionDate?: string | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.addInteraction(user, leadId, input));
}

export async function openWhatsappAction(leadId: string, input: { contactId: string; templateId?: string | null; text: string; nextAction?: string | null; nextActionDate?: string | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.openWhatsapp(user, leadId, input));
}

export async function addLeadContactAction(leadId: string, input: { name: string; role?: string | null; whatsapp?: string | null; email?: string | null }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.addLeadContact(user, leadId, input));
}

export async function setContactOptOutAction(contactId: string, optOut: boolean) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.setContactOptOut(user, contactId, optOut));
}

export async function removeLeadContactAction(contactId: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.removeLeadContact(user, contactId));
}

export async function deleteLeadAction(id: string, reason: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.deleteLead(user, id, reason));
}

export async function importLeadsAction(csv: string, dryRun: boolean, ownerId?: string) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.importLeads(user, csv, { dryRun, ownerId }));
}

export async function saveMessageTemplateAction(id: string | null, input: { name: string; stageId?: string | null; body: string; status?: "draft" | "approved" | "archived" }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.saveMessageTemplate(user, id, input));
}

export async function saveStageAction(id: string | null, input: { name: string; probability: number; active?: boolean }) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.saveStage(user, id, input));
}

export async function setDailyGoalAction(goal: number) {
  const user = await actionUser();
  if (!user) return EXPIRED;
  return done(await crm.setDailyGoal(user, goal));
}
