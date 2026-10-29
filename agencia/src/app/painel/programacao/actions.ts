"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import * as sch from "@/server/schedules";
import type { FormState } from "../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const done = (r: Awaited<ReturnType<typeof sch.createSchedule>>): FormState => {
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
};

/**
 * Loja e marca do promotor entram só pelo quadro da semana do cadastro dele
 * (Cadastros › Usuários); aqui a programação do dia muda só horário, ordem e
 * cancelamento.
 */
export async function updateScheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await sch.updateSchedule(await getScope(), str(fd, "id"), { plannedStart: str(fd, "plannedStart") || null }, str(fd, "reason")));
}

export async function cancelScheduleAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await sch.cancelSchedule(await getScope(), str(fd, "id"), str(fd, "reason")));
}

export async function moveScheduleAction(fd: FormData): Promise<void> {
  await sch.moveSchedule(await getScope(), str(fd, "id"), str(fd, "dir") === "up" ? -1 : 1);
  revalidatePath("/painel/programacao");
}
