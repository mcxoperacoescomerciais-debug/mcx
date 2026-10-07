"use server";

/**
 * Ações dos cadastros. Cada uma valida a permissão, chama o serviço
 * (src/server/admin.ts) e volta para a página com ?ok= ou ?erro= — a página
 * mostra a mensagem sem precisar de estado no navegador.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { saveNetwork, saveProduct, saveSettings, saveStore, saveUser, type Result } from "@/server/admin";
import { getClientSettings } from "@/server/settings";
import { ROLE_LABEL, STORE_FORMAT_LABEL, UNITS, type Role, type StoreFormat } from "@/lib/domain";
import type { ClientSettings } from "@/lib/settings";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(",", ".");
  return v === "" ? null : Number(v);
};

/** "37 99999-8888, +55 31 98888 7777" -> "+5537999998888,+5531988887777" */
function normalizePhones(raw: string): string {
  return raw
    .split(",")
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean)
    .map((d) => "+" + (d.startsWith("55") && d.length >= 12 ? d : "55" + d))
    .join(",");
}

function back(path: string, r: Result, okMsg: string): never {
  revalidatePath("/painel", "layout");
  const sep = path.includes("?") ? "&" : "?";
  redirect(r.ok ? `${path}${sep}ok=${encodeURIComponent(okMsg)}` : `${path}${sep}erro=${encodeURIComponent(r.error)}`);
}

export async function saveSettingsAction(fd: FormData) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const current = await getClientSettings(scope.clientId);
  const n = (k: string, fallback: number) => {
    const v = num(fd, k);
    return v === null || !Number.isFinite(v) || v < 0 ? fallback : Math.round(v);
  };
  const labels = fd.getAll("checklist_label").map(String);
  const keys = fd.getAll("checklist_key").map(String);
  const checklist = labels
    .map((label, i) => ({ key: keys[i] || label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30), label: label.trim() }))
    .filter((c) => c.label);
  const next: ClientSettings = {
    bands: { critical: n("critical", current.bands.critical), high: n("high", current.bands.high), attention: n("attention", current.bands.attention), monitor: n("monitor", current.bands.monitor) },
    weights: {
      expired: n("w_expired", current.weights.expired),
      critical: n("w_critical", current.weights.critical),
      high: n("w_high", current.weights.high),
      attention: n("w_attention", current.weights.attention),
      rupture: n("w_rupture", current.weights.rupture),
      damage: n("w_damage", current.weights.damage),
    },
    storeThresholds: { attention: n("t_attention", current.storeThresholds.attention), critical: n("t_critical", current.storeThresholds.critical) },
    checklist: checklist.length ? checklist : current.checklist,
    staleVisitDays: n("staleVisitDays", current.staleVisitDays),
    promoterEditHours: n("promoterEditHours", current.promoterEditHours),
    alerts: {
      bulkDays: n("alert_bulkDays", current.alerts.bulkDays),
      bulkMinQty: n("alert_bulkMinQty", current.alerts.bulkMinQty),
      whatsappPhone: fd.has("alert_phone") ? normalizePhones(str(fd, "alert_phone")) : current.alerts.whatsappPhone,
      // A chave não volta para a tela: campo vazio mantém a atual; "apagar" remove.
      whatsappApiKey: str(fd, "alert_apikey") === "apagar" ? "" : str(fd, "alert_apikey") || current.alerts.whatsappApiKey,
    },
  };
  back("/painel/configuracoes", await saveSettings(scope, next), "Configurações salvas.");
}

export async function testWhatsAppAction() {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const { sendTestAlert } = await import("@/server/whatsapp-alert");
  back("/painel/configuracoes", await sendTestAlert(scope), "Mensagem de teste enviada. Confira o seu WhatsApp.");
}

export async function saveUserAction(fd: FormData) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const role = str(fd, "role") as Role;
  if (!(role in ROLE_LABEL)) back("/painel/admin/usuarios", { ok: false, error: "Perfil inválido." }, "");
  const id = str(fd, "id") || undefined;
  const r = await saveUser(scope, {
    id,
    name: str(fd, "name"),
    username: str(fd, "username"),
    role,
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    document: str(fd, "document"),
    status: str(fd, "status") === "inactive" ? "inactive" : "active",
    password: str(fd, "password") || null,
    storeIds: fd.has("stores_present") ? fd.getAll("stores").map(String) : undefined,
  });
  back(r.ok ? `/painel/admin/usuarios/${r.id}` : id ? `/painel/admin/usuarios/${id}` : "/painel/admin/usuarios/novo", r, "Usuário salvo.");
}

export async function saveNetworkAction(fd: FormData) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const r = await saveNetwork(scope, { id: str(fd, "id") || undefined, name: str(fd, "name"), status: str(fd, "status") || "active" });
  back("/painel/admin/redes", r, "Rede salva.");
}

export async function saveStoreAction(fd: FormData) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const format = str(fd, "format") as StoreFormat;
  const id = str(fd, "id") || undefined;
  const r = await saveStore(scope, {
    id,
    networkId: str(fd, "networkId"),
    format: format in STORE_FORMAT_LABEL || (format as string) === "" ? format : "varejo",
    name: str(fd, "name"),
    code: str(fd, "code"),
    address: str(fd, "address"),
    city: str(fd, "city"),
    state: str(fd, "state"),
    lat: num(fd, "lat"),
    lng: num(fd, "lng"),
    managerName: str(fd, "managerName"),
    status: str(fd, "status") === "inactive" ? "inactive" : "active",
    promoterId: str(fd, "promoterId") || null,
  });
  back(r.ok ? `/painel/admin/lojas/${r.id}` : id ? `/painel/admin/lojas/${id}` : "/painel/admin/lojas/nova", r, "Loja salva.");
}

export async function saveProductAction(fd: FormData) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const unit = str(fd, "defaultUnit");
  const id = str(fd, "id") || undefined;
  const r = await saveProduct(scope, {
    id,
    code: str(fd, "code"),
    name: str(fd, "name"),
    category: str(fd, "category"),
    presentation: str(fd, "presentation"),
    defaultUnit: (UNITS as readonly string[]).includes(unit) ? unit : "un",
    aliases: str(fd, "aliases").split(/[\n,;]+/),
    referencePrice: num(fd, "referencePrice"),
    status: str(fd, "status") === "inactive" ? "inactive" : "active",
  });
  back(r.ok ? `/painel/admin/produtos/${r.id}` : id ? `/painel/admin/produtos/${id}` : "/painel/admin/produtos/novo", r, "Produto salvo.");
}
