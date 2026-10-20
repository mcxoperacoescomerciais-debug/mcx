"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getScope } from "@/server/auth";
import * as admin from "@/server/admin";
import { readTable, runImport, type ImportKind, type ImportReport } from "@/server/import";
import type { FormState } from "../actions";
import type { Employment, Role, Unit } from "@/lib/domain";
import { mergeSettings } from "@/lib/settings";
import { parseCoords } from "@/lib/rules";
import { ISSUE_KINDS } from "@/lib/domain";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const all = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);

function done<T extends { ok: boolean }>(r: T): T {
  if (r.ok) revalidatePath("/painel", "layout");
  return r;
}

export async function saveBrandAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(
    await admin.saveBrand(await getScope(), {
      id: str(fd, "id") || null,
      name: str(fd, "name"),
      code: str(fd, "code"),
      status: str(fd, "status") === "inactive" ? "inactive" : "active",
      minBeforePhotos: Number(str(fd, "minBeforePhotos") || 1),
      minAfterPhotos: Number(str(fd, "minAfterPhotos") || 1),
      requireStock: bool(fd, "requireStock"),
      rupturePhotoRequired: bool(fd, "rupturePhotoRequired"),
      allowGallery: bool(fd, "allowGallery"),
      activities: str(fd, "activities").split("\n"),
      notes: str(fd, "notes") || null,
    }),
  );
}

export async function saveChainAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await admin.saveChain(await getScope(), str(fd, "id") || null, str(fd, "name"), str(fd, "status") === "inactive" ? "inactive" : "active"));
}

export async function saveStoreAction(_: FormState, fd: FormData): Promise<FormState> {
  const coords = parseCoords(str(fd, "coords"));
  if (coords === "invalid") return { ok: false, error: "Localização inválida. Use latitude, longitude (ex.: -19.9245, -43.9352)." };
  const r = await admin.saveStore(await getScope(), {
    coords,
    id: str(fd, "id") || null,
    chainId: str(fd, "chainId") || null,
    name: str(fd, "name"),
    code: str(fd, "code") || null,
    cnpj: str(fd, "cnpj") || null,
    address: str(fd, "address") || null,
    district: str(fd, "district") || null,
    city: str(fd, "city"),
    state: str(fd, "state") || "MG",
    status: str(fd, "status") === "inactive" ? "inactive" : "active",
    brandIds: all(fd, "brandIds"),
    rules: str(fd, "rules") || null,
    notes: str(fd, "notes") || null,
  });
  done(r);
  if (r.ok && !str(fd, "id")) redirect(`/painel/cadastros/lojas/${r.id}`);
  return r;
}

export async function storeProductsAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(await admin.setStoreProducts(await getScope(), str(fd, "storeId"), str(fd, "brandId"), all(fd, "productIds")));
}

export async function saveProductAction(_: FormState, fd: FormData): Promise<FormState> {
  return done(
    await admin.saveProduct(await getScope(), {
      id: str(fd, "id") || null,
      brandId: str(fd, "brandId"),
      name: str(fd, "name"),
      sku: str(fd, "sku"),
      ean: str(fd, "ean") || null,
      category: str(fd, "category") || null,
      variant: str(fd, "variant") || null,
      package: str(fd, "package") || null,
      unit: (str(fd, "unit") || "un") as Unit,
      status: str(fd, "status") === "inactive" ? "inactive" : "active",
    }),
  );
}

export async function saveUserAction(_: FormState, fd: FormData): Promise<FormState> {
  const role = (["admin", "manager", "promoter"].includes(str(fd, "role")) ? str(fd, "role") : "promoter") as Role;
  const r = await admin.saveUser(await getScope(), {
    id: str(fd, "id") || null,
    role,
    name: str(fd, "name"),
    username: str(fd, "username"),
    email: str(fd, "email") || null,
    phone: str(fd, "phone") || null,
    internalCode: str(fd, "internalCode") || null,
    employment: (str(fd, "employment") || null) as Employment | null,
    workMode: str(fd, "workMode") === "route" ? "route" : str(fd, "workMode") === "portfolio" ? "portfolio" : null,
    region: str(fd, "region") || null,
    managerId: str(fd, "managerId") || null,
    status: str(fd, "status") === "inactive" ? "inactive" : "active",
    allBrands: str(fd, "allBrands") !== "restricted",
    teamOnly: bool(fd, "teamOnly"),
    // Promotor: lojas e marcas são definidas nas atribuições (abaixo do cadastro), não aqui.
    brandIds: role === "promoter" ? undefined : all(fd, "brandIds"),
    storeIds: role === "promoter" ? undefined : [],
    permissions: fd.get("permissionsSet") ? all(fd, "permissions") : undefined,
    password: str(fd, "password") || null,
  });
  done(r);
  if (r.ok && !str(fd, "id")) redirect(`/painel/cadastros/usuarios/${r.id}`);
  return r;
}

export async function storeMixAction(_: FormState, fd: FormData): Promise<FormState> {
  const { setStoreMix } = await import("@/server/mixes");
  return done(await setStoreMix(await getScope(), str(fd, "storeId"), str(fd, "brandId"), str(fd, "mixId")));
}

export async function saveSettingsAction(_: FormState, fd: FormData): Promise<FormState> {
  const scope = await getScope();
  const priority = Object.fromEntries(ISSUE_KINDS.map((k) => [k, Number(str(fd, `p_${k}`) || 5)]));
  const name = str(fd, "agencyName");
  if (name && name !== scope.agencyName) await admin.saveAgencyName(scope, name);
  return done(
    await admin.saveSettings(
      scope,
      mergeSettings({
        requireApproval: bool(fd, "requireApproval"),
        allowIncompleteVisit: bool(fd, "allowIncompleteVisit"),
        allowExtraVisits: bool(fd, "allowExtraVisits"),
        captureLocation: bool(fd, "captureLocation"),
        allowExceptions: bool(fd, "allowExceptions"),
        defaultWorkMode: str(fd, "defaultWorkMode"),
        lateToleranceMin: Number(str(fd, "lateToleranceMin")),
        dayEndsAt: str(fd, "dayEndsAt"),
        stockDivergencePct: Number(str(fd, "stockDivergencePct")),
        issuePriority: priority as never,
        validityBands: {
          critical: Number(str(fd, "band_critical")),
          high: Number(str(fd, "band_high")),
          attention: Number(str(fd, "band_attention")),
          monitor: Number(str(fd, "band_monitor")),
        },
        alerts: {
          bulkDays: Number(str(fd, "alert_bulkDays")),
          bulkMinQty: Number(str(fd, "alert_bulkMinQty")),
          whatsappPhone: normalizePhones(str(fd, "alert_phone")),
          // A chave nunca volta para a tela: vazio mantém a atual; "apagar" remove.
          whatsappApiKey: str(fd, "alert_apikey").toLowerCase() === "apagar" ? "" : str(fd, "alert_apikey") || scope.settings.alerts.whatsappApiKey,
          storageReport: scope.settings.alerts.storageReport,
        },
      }),
    ),
  );
}

/** "37 99999-8888, +55 31 98888 7777" → "+5537999998888,+5531988887777" */
function normalizePhones(raw: string): string {
  return raw
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean)
    .map((d) => "+" + (d.startsWith("55") && d.length >= 12 ? d : "55" + d))
    .join(",");
}

export async function testWhatsAppAction(_: FormState, _fd: FormData): Promise<FormState> {
  void _fd;
  const scope = await getScope();
  if (scope.role !== "admin") return done({ ok: false, error: "Somente administradores." });
  const { sendTestAlert } = await import("@/server/whatsapp-alert");
  return done(await sendTestAlert(scope));
}

export type ImportState = { report?: ImportReport; error?: string } | null;

export async function importAction(_: ImportState, fd: FormData): Promise<ImportState> {
  const scope = await getScope();
  if (scope.role !== "admin") return { error: "Somente administradores." };
  const kind = str(fd, "kind") as ImportKind;
  if (!["produtos", "lojas", "promotores", "metas", "mix", "roteiros"].includes(kind)) return { error: "Tipo de importação inválido." };
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Escolha o arquivo." };
  if (file.size > 10 * 1024 * 1024) return { error: "Arquivo muito grande (máx. 10 MB)." };
  try {
    const rows = await readTable(file);
    if (!rows.length) return { error: "Planilha vazia ou sem cabeçalho na primeira linha." };
    const report = await runImport(scope, kind, rows, bool(fd, "dryRun"));
    if (!report.dryRun) revalidatePath("/painel", "layout");
    return { report };
  } catch (err) {
    console.error("[import]", err);
    return { error: "Não foi possível ler o arquivo. Use .xlsx ou .csv com cabeçalho na primeira linha." };
  }
}

/** Cadastro do promotor: marcas, dias e vezes numa loja (substitui as da loja; vazio = tira a loja). */
export async function moveStoreDayAction(promoterId: string, storeId: string, fromDay: number, toDay: number) {
  const { moveStoreDay } = await import("@/server/portfolio");
  const r = await moveStoreDay(await getScope(), promoterId, storeId, fromDay, toDay);
  if (r.ok) revalidatePath(`/painel/cadastros/usuarios/${promoterId}`);
  return r;
}

export async function saveAssignmentAction(promoterId: string, storeId: string, rows: { brandId: string; perWeek: number; period: "week" | "fortnight" | "month"; weekdays: number[] }[]) {
  const { saveStoreAssignment } = await import("@/server/portfolio");
  const r = await saveStoreAssignment(await getScope(), promoterId, storeId, rows);
  if (r.ok) revalidatePath(`/painel/cadastros/usuarios/${promoterId}`);
  return r;
}
