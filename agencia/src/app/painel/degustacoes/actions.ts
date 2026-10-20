"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getScope } from "@/server/auth";
import * as ts from "@/server/tastings";
import { CONTACT_STATUSES, DOC_STATUSES, FILE_KINDS, TASTING_STATUSES, type ContactStatus, type DocStatus, type TastingFileKind, type TastingStatus } from "@/lib/tasting";
import type { FormState } from "../actions";
import type { PreviewRow } from "@/server/tasting-import";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
/** "1.234,56", "1234,5", "1234.56" → número; vazio → null. */
function money(fd: FormData, k: string): number | null {
  const t = str(fd, k).replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const BASE = "/painel/degustacoes";

function tastingInput(fd: FormData): ts.TastingInput {
  return {
    brandId: str(fd, "brandId"),
    storeId: opt(fd, "storeId"),
    chainName: opt(fd, "chainName"),
    storeName: str(fd, "storeName"),
    city: str(fd, "city"),
    state: str(fd, "state") || "MG",
    date: str(fd, "date"),
    startTime: opt(fd, "startTime"),
    endTime: opt(fd, "endTime"),
    product: opt(fd, "product"),
    description: opt(fd, "description"),
    materialsNote: opt(fd, "materialsNote"),
    notes: opt(fd, "notes"),
    responsibleId: opt(fd, "responsibleId"),
    orderRef: opt(fd, "orderRef"),
    actionCode: opt(fd, "actionCode"),
    billingTerms: opt(fd, "billingTerms"),
    brandPaymentDue: opt(fd, "brandPaymentDue"),
    tasterPaymentDue: opt(fd, "tasterPaymentDue"),
    photoProof: fd.get("photoProof") === "on",
    requiredEvidence: opt(fd, "requiredEvidence"),
    revenue: money(fd, "revenue"),
    taxes: money(fd, "taxes"),
    tasterFee: money(fd, "tasterFee"),
    transport: money(fd, "transport"),
    food: money(fd, "food"),
    materialsCost: money(fd, "materialsCost"),
    otherCost: money(fd, "otherCost"),
  };
}

export async function saveTastingAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = opt(fd, "id");
  const r = await ts.saveTasting(await getScope(), id, tastingInput(fd), { allowDuplicate: fd.get("allowDuplicate") === "on" });
  if (!r.ok) return r.duplicateOf ? { ok: false, error: `${r.error} Confira a existente ou marque “cadastrar mesmo assim”.` } : r;
  revalidatePath(BASE, "layout");
  redirect(`${BASE}/${r.id}`);
}

export async function saveTasterAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = opt(fd, "id");
  const r = await ts.saveTaster(await getScope(), id, {
    name: str(fd, "name"),
    phone: opt(fd, "phone"),
    city: str(fd, "city"),
    state: str(fd, "state") || "MG",
    region: opt(fd, "region"),
    area: opt(fd, "area"),
    availability: opt(fd, "availability"),
    experience: opt(fd, "experience"),
    usualFee: money(fd, "usualFee"),
    notes: opt(fd, "notes"),
    status: str(fd, "status") === "inactive" ? "inactive" : "active",
  });
  if (!r.ok) return r;
  revalidatePath(`${BASE}/degustadoras`, "layout");
  if (!id) redirect(`${BASE}/degustadoras/${r.id}`);
  return r;
}

export async function selectTasterAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const r = await ts.selectTaster(await getScope(), id, str(fd, "tasterId"));
  if (r.ok) revalidatePath(`${BASE}/${id}`);
  return r;
}

export async function contactAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const status = str(fd, "status") as ContactStatus;
  if (!(CONTACT_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Escolha a situação do contato." };
  const r = await ts.setContactStatus(await getScope(), id, status, opt(fd, "note"));
  if (r.ok) revalidatePath(`${BASE}/${id}`);
  return r;
}

export async function statusAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const status = str(fd, "status") as TastingStatus;
  if (!(TASTING_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Situação inválida." };
  const fee = money(fd, "cancellationFee");
  const r = await ts.setTastingStatus(await getScope(), id, status, { reason: opt(fd, "reason"), cancellationFee: fee });
  if (r.ok) revalidatePath(`${BASE}/${id}`);
  return r;
}

export async function materialAction(id: string, item: string, checked: boolean) {
  const r = await ts.toggleMaterial(await getScope(), id, item, checked);
  if (r.ok) revalidatePath(`${BASE}/${id}`);
  return r;
}

export async function financeAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const doc = str(fd, "docStatus") as DocStatus;
  const r = await ts.saveFinance(await getScope(), id, {
    revenueActual: money(fd, "revenueActual"),
    taxesActual: money(fd, "taxesActual"),
    tasterFeeActual: money(fd, "tasterFeeActual"),
    transportActual: money(fd, "transportActual"),
    foodActual: money(fd, "foodActual"),
    materialsCostActual: money(fd, "materialsCostActual"),
    otherCostActual: money(fd, "otherCostActual"),
    docStatus: (DOC_STATUSES as readonly string[]).includes(doc) ? doc : "na",
    billingStatus: str(fd, "billingStatus") === "billed" ? "billed" : "not_billed",
    billedAmount: money(fd, "billedAmount"),
    receiptStatus: str(fd, "receiptStatus") === "received" ? "received" : "pending",
    receivedAmount: money(fd, "receivedAmount"),
    receivedAt: opt(fd, "receivedAt"),
    tasterPaymentStatus: str(fd, "tasterPaymentStatus") === "paid" ? "paid" : "pending",
    paidAmount: money(fd, "paidAmount"),
    paidAt: opt(fd, "paidAt"),
  });
  if (r.ok) revalidatePath(`${BASE}/${id}`);
  return r;
}

export async function fileAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const file = fd.get("file");
  const kind = str(fd, "kind") as TastingFileKind;
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Escolha o arquivo." };
  const r = await ts.addTastingFile(await getScope(), { tastingId: id }, (FILE_KINDS as readonly string[]).includes(kind) ? kind : "other", file);
  if (r.ok) revalidatePath(`${BASE}/${id}`);
  return r;
}

export async function seedSamplesAction(_: FormState, _fd: FormData): Promise<FormState> {
  void _fd;
  const { seedSamples } = await import("@/server/tasting-samples");
  const r = await seedSamples(await getScope());
  if (r.ok) revalidatePath(BASE, "layout");
  return r;
}

export async function deleteSamplesAction(_: FormState, _fd: FormData): Promise<FormState> {
  void _fd;
  const r = await ts.deleteSamples(await getScope());
  if (r.ok) revalidatePath(BASE, "layout");
  return r;
}

export async function previewScheduleAction(fd: FormData) {
  const { previewSchedule } = await import("@/server/tasting-import");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false as const, error: "Escolha o arquivo do cronograma." };
  return previewSchedule(await getScope(), str(fd, "brandId"), file);
}

export async function commitScheduleAction(batchId: string, brandId: string, rows: PreviewRow[]) {
  const { commitSchedule } = await import("@/server/tasting-import");
  const r = await commitSchedule(await getScope(), batchId, brandId, rows);
  if (r.ok) revalidatePath(BASE, "layout");
  return r;
}

export async function saveQuoteAction(id: string | null, data: { name: string; brandId: string | null; globals: { taxPct: number; adminPct?: number; marginPct: number; fuelPrice?: number }; cities: unknown; notes: string | null }) {
  const { saveQuote } = await import("@/server/tasting-quotes");
  const r = await saveQuote(await getScope(), id, data);
  if (r.ok) revalidatePath(`${BASE}/calculadora`);
  return r;
}

export async function deleteQuoteAction(id: string) {
  const { deleteQuote } = await import("@/server/tasting-quotes");
  const r = await deleteQuote(await getScope(), id);
  if (r.ok) revalidatePath(`${BASE}/calculadora`);
  return r;
}
