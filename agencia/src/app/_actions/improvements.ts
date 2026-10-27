"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatform, requireUser } from "@/server/auth";
import * as improvements from "@/server/improvements";

export type ImprovementInput = { title: string; description: string; origin: string };

/** Qualquer usuário logado (painel ou app do promotor). */
export async function submitImprovementAction(input: ImprovementInput): Promise<{ ok: true; message?: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const r = await improvements.createImprovement(user, {
    title: String(input?.title ?? ""),
    description: String(input?.description ?? ""),
    origin: String(input?.origin ?? ""),
  });
  if (!r.ok) return r;
  const id = r.id!;
  // Análise do Claude e aviso no WhatsApp depois de responder a quem enviou.
  after(() => improvements.processImprovement(id));
  revalidatePath("/painel/melhorias");
  revalidatePath("/painel/mcx/melhorias");
  return { ok: true, message: r.message };
}

export async function listMyImprovementsAction() {
  const user = await requireUser();
  const rows = await improvements.listMyImprovements(user);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

type FormState = { ok: true; message?: string } | { ok: false; error: string } | null;

export async function updateImprovementAction(_: FormState, fd: FormData): Promise<FormState> {
  const id = String(fd.get("id") ?? "");
  const r = await improvements.updateImprovement(await requirePlatform(), id, { status: String(fd.get("status") ?? ""), reply: String(fd.get("reply") ?? "") });
  if (r.ok) {
    revalidatePath(`/painel/mcx/melhorias/${id}`);
    revalidatePath("/painel/mcx/melhorias");
  }
  return r;
}

export async function reanalyzeImprovementAction(_: FormState, fd: FormData): Promise<FormState> {
  await requirePlatform();
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Solicitação não encontrada." };
  await improvements.analyzeImprovement(id);
  revalidatePath(`/painel/mcx/melhorias/${id}`);
  return { ok: true, message: "Análise atualizada." };
}
