"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatform } from "@/server/auth";
import * as scopes from "@/server/scope-forms";
import type { FormState } from "../../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function createScopeAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await scopes.createScopeForm(await requirePlatform(), { clientName: str(fd, "clientName"), base: str(fd, "base") });
  if (!r.ok) return r;
  revalidatePath("/painel/mcx/escopos");
  redirect(`/painel/mcx/escopos/${r.id}`);
}

export async function saveScopeAction(_: FormState, fd: FormData): Promise<FormState> {
  let sections: unknown = [];
  try {
    sections = JSON.parse(String(fd.get("sections") ?? "[]"));
  } catch {
    return { ok: false, error: "Não foi possível ler as seções. Recarregue a página." };
  }
  const id = str(fd, "id");
  const r = await scopes.updateScopeForm(await requirePlatform(), id, {
    clientName: str(fd, "clientName"),
    title: str(fd, "title"),
    intro: str(fd, "intro"),
    details: str(fd, "details"),
    closingText: str(fd, "closingText"),
    sections,
  });
  if (r.ok) revalidatePath(`/painel/mcx/escopos/${id}`);
  return r;
}

export async function archiveScopeAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const r = await scopes.setScopeArchived(await requirePlatform(), id, str(fd, "archived") === "1");
  if (r.ok) revalidatePath(`/painel/mcx/escopos/${id}`);
  return r;
}

export async function reopenScopeAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = str(fd, "id");
  const r = await scopes.reopenScopeForm(await requirePlatform(), id);
  if (r.ok) revalidatePath(`/painel/mcx/escopos/${id}`);
  return r;
}
