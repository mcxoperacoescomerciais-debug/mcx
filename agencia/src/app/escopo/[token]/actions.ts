"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { submitScopeResponse, type SubmitResult } from "@/server/scope-forms";
import type { ResponseInput } from "@/lib/scope-forms";

/** Envio público (sem login): o token do link identifica o escopo. */
export async function submitScopeAction(token: string, input: ResponseInput): Promise<SubmitResult> {
  const safe: ResponseInput = {
    answers: input && typeof input.answers === "object" && input.answers ? input.answers : {},
    generalNote: String(input?.generalNote ?? ""),
    signerName: String(input?.signerName ?? ""),
    signerRole: String(input?.signerRole ?? ""),
    signerEmail: String(input?.signerEmail ?? ""),
    agree: input?.agree === true,
  };
  const r = await submitScopeResponse(String(token), safe, (await headers()).get("user-agent"));
  if (r.ok) revalidatePath(`/escopo/${token}`);
  return r;
}
