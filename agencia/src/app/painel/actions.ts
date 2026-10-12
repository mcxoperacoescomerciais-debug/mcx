"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import * as m from "@/server/manager";
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
