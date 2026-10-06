"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { generateWeeklyReport, previousWeek } from "@/server/weekly-report";
import { daysBetween } from "@/lib/validity";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Gera (ou regera) o relatório do período escolhido. Sem datas, usa a semana anterior. */
export async function generateReportAction(formData: FormData): Promise<void> {
  const user = await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const fallback = previousWeek();
  let start = String(formData.get("de") ?? "");
  let end = String(formData.get("ate") ?? "");
  if (!ISO.test(start)) start = fallback.start;
  if (!ISO.test(end)) end = fallback.end;
  if (start > end) [start, end] = [end, start];
  if (daysBetween(start, end) > 92) {
    redirect(`/painel/relatorios?erro=${encodeURIComponent("Escolha um período de até 3 meses.")}`);
  }
  const id = await generateWeeklyReport(scope, start, end, user.id);
  revalidatePath("/painel/relatorios");
  redirect(`/painel/relatorios/${id}`);
}
