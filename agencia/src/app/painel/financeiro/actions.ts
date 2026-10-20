"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import * as fin from "@/server/finance";
import type { FormState } from "../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function money(fd: FormData, k: string): number | null {
  const t = str(fd, k).replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
}

export async function brandFeeAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await fin.saveBrandFee(await getScope(), str(fd, "brandId"), money(fd, "fee"));
  if (r.ok) revalidatePath("/painel/financeiro");
  return r;
}

export async function createInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const ids = fd.getAll("tastingId").map(String).filter(Boolean);
  const r = await fin.createInvoice(await getScope(), { brandId: str(fd, "brandId"), tastingIds: ids, number: str(fd, "number") || null, issueDate: str(fd, "issueDate"), dueDate: str(fd, "dueDate") || null, notes: str(fd, "notes") || null });
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

export async function receiveInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await fin.receiveInvoice(await getScope(), str(fd, "id"), str(fd, "receivedAt"), money(fd, "amount"));
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

export async function cancelInvoiceAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await fin.cancelInvoice(await getScope(), str(fd, "id"));
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}
