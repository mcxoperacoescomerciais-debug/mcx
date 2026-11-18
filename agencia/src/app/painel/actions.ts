"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import * as m from "@/server/manager";
import * as c from "@/server/manager-corrections";
import type { ActionResult } from "@/server/manager";
import type { IssueReviewStatus } from "@/lib/domain";

export type FormState = ActionResult | null;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

function done(r: ActionResult): FormState {
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

export async function requestCorrectionAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await m.requestCorrection(await getScope(), str(fd, "id"), str(fd, "reason")));
}

export async function correctValidityAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await c.correctValidity(await getScope(), str(fd, "id"), { expiryDate: str(fd, "expiryDate"), quantity: str(fd, "quantity"), price: str(fd, "price") }, str(fd, "reason")));
}

export async function correctStockAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await c.correctStock(await getScope(), str(fd, "attendanceId"), str(fd, "productId"), { quantity: str(fd, "quantity"), unit: str(fd, "unit"), price: str(fd, "price") }, str(fd, "reason")));
}

export async function removeRuptureAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await c.removeRuptureByManager(await getScope(), str(fd, "id"), str(fd, "reason")));
}

export async function undoMistakenVisitAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await m.undoMistakenVisit(await getScope(), str(fd, "id"), str(fd, "reason")));
}

export async function cancelCorrectionAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await m.cancelCorrection(await getScope(), str(fd, "id"), str(fd, "reason")));
}

export async function reviewAttendanceAction(_: FormState, fd: FormData): Promise<FormState> {
  const decision = str(fd, "decision") === "rejected" ? "rejected" : "approved";
  return done(await m.reviewAttendance(await getScope(), str(fd, "id"), decision, str(fd, "note")));
}

export async function reviewIssueAction(_: FormState, fd: FormData): Promise<FormState> {
  const status: IssueReviewStatus = str(fd, "status") === "concluded" ? "concluded" : "analyzed";
  return done(await m.reviewIssue(await getScope(), str(fd, "key"), status, str(fd, "action")));
}

export async function occurrenceAction(_: FormState, fd: FormData): Promise<FormState> {
  const status = str(fd, "status") === "resolved" ? "resolved" : "analyzed";
  return done(await m.handleOccurrence(await getScope(), str(fd, "id"), status, str(fd, "action")));
}
