/**
 * Regras de negócio puras — a MESMA função roda no celular (para orientar o
 * promotor antes de finalizar) e no servidor (que revalida tudo e é quem
 * decide). Nada aqui acessa banco ou rede.
 */
import { hhmmToMinutes } from "./dates";
import {
  EXCEPTION_ITEM_LABEL,
  type ExceptionItem,
  type ExceptionReason,
  type StockState,
  type StopBucket,
  type VisitStatus,
} from "./domain";
import type { AgencySettings } from "./settings";

// ───────────────────────────── Texto ─────────────────────────────

/** Minúsculas, sem acento, só letras/números/espaço. Para busca. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Chave de duplicidade de produto: ignora acento, caixa, espaços, pontuação e
 * a grafia da gramatura ("500 g", "500G", "500gr" → "500g").
 * "Café Tradicional 500 g" e "CAFE TRADICIONAL 500G" geram a mesma chave.
 */
export function productNameKey(name: string): string {
  return normalizeText(name)
    .replace(/(\d+)\s*(gr|grs|gramas|g)\b/g, "$1g")
    .replace(/(\d+)\s*(kgs|kg|quilos?)\b/g, "$1kg")
    .replace(/(\d+)\s*(mls?|ml)\b/g, "$1ml")
    .replace(/(\d+)\s*(lts?|litros?|l)\b/g, "$1l")
    .replace(/\s+/g, "");
}

/** Cada palavra digitada precisa ser prefixo de alguma palavra do texto ("caf trad" acha "Café Tradicional"). */
export function matchesQuery(haystack: string, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const words = normalizeText(haystack).split(" ");
  return q.split(" ").every((t) => words.some((w) => w.startsWith(t)) || haystack.toLowerCase().includes(t));
}

// ───────────────────────────── Estoque ─────────────────────────────

/** Valida um registro de estoque. Vazio NUNCA vira zero: sem estado = pendente. */
export function validateStock(state: StockState, quantity: number | null | undefined): string | null {
  if (state === "quantity") {
    if (quantity === null || quantity === undefined || !Number.isInteger(quantity)) return "Informe a quantidade encontrada.";
    if (quantity <= 0) return "Quantidade deve ser maior que zero. Para nenhuma unidade, use “Estoque zero”.";
    if (quantity > 100_000) return "Quantidade muito alta. Confira o número digitado.";
    return null;
  }
  if (state === "zero") return quantity === 0 || quantity === null || quantity === undefined ? null : "Estoque zero não leva quantidade.";
  return quantity === null || quantity === undefined ? null : "Esta situação não leva quantidade.";
}

/** Quantidade gravada para cada estado (zero é 0; não encontrado/não se aplica não têm número). */
export function storedQuantity(state: StockState, quantity: number | null | undefined): number | null {
  if (state === "quantity") return quantity ?? null;
  if (state === "zero") return 0;
  return null;
}

/** Estoque zero ou produto não encontrado → o app SUGERE registrar ruptura (o promotor confirma). */
export function suggestsRupture(state: StockState | undefined): boolean {
  return state === "zero" || state === "not_found";
}

/** Variação relevante entre dois levantamentos sucessivos do mesmo produto na mesma loja. */
/**
 * Coordenadas digitadas ("-19.93, -43.94", como o Google Maps copia) ou em duas
 * colunas. Vazio = null; inválido = "invalid".
 */
export function parseCoords(lat: string, lng?: string): { lat: number; lng: number } | null | "invalid" {
  const raw = lng === undefined ? lat : `${lat};${lng}`;
  if (!raw.replace(/[;,\s]/g, "")) return null;
  // "-19.93, -43.94", "-19,93; -43,94" ou duas colunas.
  const nums = raw.match(/-?\d+(?:[.,]\d+)?/g)?.map((n) => Number(n.replace(",", ".")));
  if (!nums || nums.length !== 2) return "invalid";
  const [a, b] = nums;
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return "invalid";
  return { lat: a, lng: b };
}

/** Distância em metros (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function isRelevantDivergence(previous: number | null, current: number | null, pct: number): boolean {
  if (previous === null || current === null) return false;
  if (previous === 0) return current >= 10;
  return (Math.abs(current - previous) / previous) * 100 >= pct;
}

// ───────────────────────────── Atendimento ─────────────────────────────

export interface BrandRequirements {
  minBeforePhotos: number;
  minAfterPhotos: number;
  requireStock: boolean;
  rupturePhotoRequired: boolean;
}

export interface AttendanceCheckInput {
  brand: BrandRequirements;
  beforePhotos: number;
  afterPhotos: number;
  /** Produtos que a loja acompanha para a marca. */
  trackedProductIds: string[];
  /** productId → estado registrado (ausente = pendente). */
  stock: Record<string, StockState | undefined>;
  /** Fotos por avaria (modo SUINCO: toda avaria precisa de foto). */
  damages: { productId: string; photos: number }[];
  exceptionItems: ExceptionItem[];
  exceptionReason: ExceptionReason | null;
  exceptionNote: string | null;
  allowExceptions: boolean;
  /** Checklist da execução: todos os itens precisam de OK (só o app confere; o servidor aceita dados antigos). */
  checklist?: { items: string[]; done: string[] };
}

export type MissingKind = ExceptionItem | "damage_photo" | "exception_reason" | "checklist";

export interface MissingItem {
  kind: MissingKind;
  message: string;
  /** Pode ser dispensado com exceção justificada. */
  excusable: boolean;
}

export function exceptionIsValid(reason: ExceptionReason | null, note: string | null): boolean {
  return Boolean(reason) && (note ?? "").trim().length >= 5;
}

/**
 * O que ainda impede a finalização normal do atendimento. Lista vazia = pode
 * finalizar. Itens dispensados por exceção válida não aparecem.
 */
export function attendanceMissing(i: AttendanceCheckInput): MissingItem[] {
  const out: MissingItem[] = [];
  const excused = new Set(i.allowExceptions && exceptionIsValid(i.exceptionReason, i.exceptionNote) ? i.exceptionItems : []);
  const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

  if (i.beforePhotos < i.brand.minBeforePhotos && !excused.has("before_photo")) {
    const falta = i.brand.minBeforePhotos - i.beforePhotos;
    out.push({ kind: "before_photo", message: `Falta ${plural(falta, "foto", "fotos")} do ANTES.`, excusable: i.allowExceptions });
  }
  if (i.afterPhotos < i.brand.minAfterPhotos && !excused.has("after_photo")) {
    const falta = i.brand.minAfterPhotos - i.afterPhotos;
    out.push({ kind: "after_photo", message: `Falta ${plural(falta, "foto", "fotos")} do DEPOIS.`, excusable: i.allowExceptions });
  }
  if (i.brand.requireStock && !excused.has("stock")) {
    const pending = i.trackedProductIds.filter((id) => !i.stock[id]).length;
    if (pending > 0) {
      out.push({
        kind: "stock",
        message: `Estoque: ${plural(pending, "produto", "produtos")} sem informação.`,
        excusable: i.allowExceptions,
      });
    }
  }
  if (i.checklist) {
    const pending = i.checklist.items.filter((x) => !i.checklist!.done.includes(x)).length;
    if (pending > 0) out.push({ kind: "checklist", message: `Execução: ${plural(pending, "item", "itens")} do checklist sem OK.`, excusable: false });
  }
  // Ruptura no modo SUINCO não exige foto; avaria sempre exige.
  const damageNoPhoto = i.damages.filter((d) => d.photos === 0).length;
  if (damageNoPhoto > 0) {
    out.push({ kind: "damage_photo", message: `${plural(damageNoPhoto, "avaria", "avarias")} sem foto.`, excusable: false });
  }
  if (i.exceptionItems.length > 0 && !exceptionIsValid(i.exceptionReason, i.exceptionNote)) {
    out.push({ kind: "exception_reason", message: "A exceção precisa de motivo e justificativa (mínimo 5 letras).", excusable: false });
  }
  return out;
}

export function exceptionSummary(items: ExceptionItem[]): string {
  return items.map((i) => EXCEPTION_ITEM_LABEL[i]).join(", ");
}

// ───────────────────────────── Visita ─────────────────────────────

export interface VisitCloseInput {
  plannedBrandIds: string[];
  /** brandId → status do atendimento (ausente = não iniciado). */
  attendanceStatus: Record<string, string | undefined>;
}

/** Marcas previstas que ainda não foram concluídas (nem canceladas com justificativa). */
export function pendingBrandsForClose(i: VisitCloseInput): string[] {
  return i.plannedBrandIds.filter((b) => {
    const st = i.attendanceStatus[b];
    return st !== "completed" && st !== "cancelled";
  });
}

/** Atendimentos iniciados e não finalizados bloqueiam o encerramento (mesmo com justificativa). */
export function openAttendances(i: VisitCloseInput): string[] {
  return Object.entries(i.attendanceStatus)
    .filter(([, st]) => st === "in_progress")
    .map(([b]) => b);
}

// ───────────────────────────── Programação do dia ─────────────────────────────

export interface StopInput {
  date: string;
  plannedStart: string | null;
  visit: { status: VisitStatus; hasException: boolean } | null;
  today: string;
  nowMinutes: number;
  settings: Pick<AgencySettings, "lateToleranceMin" | "dayEndsAt">;
}

/**
 * Situação de uma loja programada. Cada programação cai em EXATAMENTE um grupo
 * (ver STOP_BUCKET_HELP em domain.ts) — os números do dashboard sempre somam
 * o total programado.
 */
export function stopBucket(i: StopInput): StopBucket {
  const v = i.visit && i.visit.status !== "cancelled" ? i.visit : null;
  if (v) {
    if (v.status === "in_progress") return "in_progress";
    if (v.status === "closed_incomplete" || v.hasException) return "exception";
    return "completed";
  }
  if (i.date < i.today) return "missed";
  if (i.date > i.today) return "pending";
  const dayEnd = hhmmToMinutes(i.settings.dayEndsAt) ?? 24 * 60;
  if (i.nowMinutes >= dayEnd) return "missed";
  const planned = hhmmToMinutes(i.plannedStart);
  if (planned !== null && i.nowMinutes > planned + i.settings.lateToleranceMin) return "late";
  return "pending";
}

/** Percentual com denominador explícito; null quando não há base (nunca "0%" inventado). */
export function pct(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}
