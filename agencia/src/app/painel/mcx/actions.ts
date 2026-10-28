"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACTIVE_AGENCY_COOKIE, requirePlatform } from "@/server/auth";
import { audit } from "@/server/audit";
import * as platform from "@/server/platform";
import type { FormState } from "../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Equipe MCX (só o Dono). */
export async function createMasterAction(_: FormState, fd: FormData): Promise<FormState> {
  const { createMaster } = await import("@/server/platform-team");
  const r = await createMaster(await requirePlatform(), { name: str(fd, "name"), username: str(fd, "username"), password: String(fd.get("password") ?? "") });
  if (r.ok) revalidatePath("/painel/mcx/equipe");
  return r;
}

export async function setMasterStatusAction(_: FormState, fd: FormData): Promise<FormState> {
  const { setMasterStatus } = await import("@/server/platform-team");
  const r = await setMasterStatus(await requirePlatform(), str(fd, "id"), str(fd, "status") === "inactive" ? "inactive" : "active");
  if (r.ok) revalidatePath("/painel/mcx/equipe");
  return r;
}

/** Entra no painel de uma agência (tudo o que for visto/feito é dela). */
export async function enterAgencyAction(fd: FormData): Promise<void> {
  const user = await requirePlatform();
  const id = str(fd, "agencyId");
  const agency = /^[0-9a-f-]{36}$/i.test(id) ? await platform.getClientAgency(id) : null;
  if (!agency) redirect("/painel/mcx");
  (await cookies()).set(ACTIVE_AGENCY_COOKIE, agency.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
  await audit({ agencyId: agency.id, userId: user.id }, "agency", agency.id, "platform_enter");
  redirect(str(fd, "next").startsWith("/painel") ? str(fd, "next") : "/painel");
}

/** Sai da agência e volta para a visão MCX (macro). */
export async function leaveAgencyAction(): Promise<void> {
  await requirePlatform();
  (await cookies()).delete(ACTIVE_AGENCY_COOKIE);
  redirect("/painel/mcx");
}

export async function createAgencyAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await platform.createAgency(await requirePlatform(), {
    name: str(fd, "name"),
    adminName: str(fd, "adminName"),
    adminUsername: str(fd, "adminUsername"),
    adminPassword: String(fd.get("adminPassword") ?? ""),
    modules: { tastings: fd.get("tastings") === "on", finance: fd.get("finance") === "on" },
    overviewStyle: str(fd, "overviewStyle") === "executive" ? "executive" : "standard",
  });
  if (r.ok) {
    revalidatePath("/painel", "layout");
    redirect(`/painel/mcx/agencias/${r.id}`);
  }
  return r;
}

export async function updateAgencyAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await platform.updateAgency(await requirePlatform(), str(fd, "id"), {
    name: str(fd, "name"),
    status: str(fd, "status") === "suspended" ? "suspended" : "active",
  });
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

export async function agencyModulesAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await platform.setAgencyModules(await requirePlatform(), str(fd, "id"), {
    tastings: fd.get("tastings") === "on",
    finance: fd.get("finance") === "on",
    overviewStyle: str(fd, "overviewStyle") === "executive" ? "executive" : "standard",
  });
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

export async function agencyLogoAction(_: FormState, fd: FormData): Promise<FormState> {
  const file = fd.get("logo");
  const remove = fd.get("remove") === "1";
  if (!remove && !(file instanceof File && file.size)) return { ok: false, error: "Escolha a imagem do logo." };
  const r = await platform.setAgencyLogo(await requirePlatform(), str(fd, "id"), remove ? null : file instanceof File ? file : null);
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

/** Aviso de armazenamento (WhatsApp da MCX, não de uma agência). */
export async function saveStorageAlertAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requirePlatform();
  const { saveStorageAlertConfig } = await import("@/server/storage-alert");
  const r = await saveStorageAlertConfig(user.id, { phone: str(fd, "phone"), apikey: str(fd, "apikey"), enabled: fd.get("enabled") === "on" });
  if (r.ok) revalidatePath("/painel/mcx/armazenamento");
  return r;
}

export async function storageReportNowAction(_: FormState, _fd: FormData): Promise<FormState> {
  void _fd;
  await requirePlatform();
  const { runStorageCheck } = await import("@/server/storage-alert");
  const r = await runStorageCheck(new Date(), { force: true });
  return r.sent.length ? { ok: true, message: "Aviso enviado. Confira o WhatsApp." } : { ok: false, error: "Nada enviado: ligue o aviso, salve e confira o número e a chave." };
}
