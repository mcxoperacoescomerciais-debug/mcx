/**
 * Degustações: situações, contato com a degustadora, materiais por marca e as
 * contas do resultado (previsto × realizado). Funções puras — usadas no painel,
 * no financeiro e nos testes.
 */

export const TASTING_STATUSES = ["awaiting_taster", "awaiting_confirmation", "confirmed", "in_progress", "completed", "cancelled"] as const;
export type TastingStatus = (typeof TASTING_STATUSES)[number];
export const TASTING_STATUS_LABEL: Record<TastingStatus, string> = {
  awaiting_taster: "Aguardando degustadora",
  awaiting_confirmation: "Aguardando confirmação",
  confirmed: "Confirmada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
};
export const TASTING_STATUS_TONE = {
  awaiting_taster: "danger",
  awaiting_confirmation: "warning",
  confirmed: "info",
  in_progress: "info",
  completed: "success",
  cancelled: "muted",
} as const;
/** Cor do ponto na agenda. */
export const TASTING_STATUS_DOT: Record<TastingStatus, string> = {
  awaiting_taster: "bg-bad",
  awaiting_confirmation: "bg-warn",
  confirmed: "bg-info",
  in_progress: "bg-brand-600",
  completed: "bg-ok",
  cancelled: "bg-muted",
};

/** Filtros extras da agenda (além da situação). */
export const TASTING_FLAGS = ["pending_materials", "pending_docs", "pending_finance"] as const;
export type TastingFlag = (typeof TASTING_FLAGS)[number];
export const TASTING_FLAG_LABEL: Record<TastingFlag, string> = {
  pending_materials: "Materiais pendentes",
  pending_docs: "Pendente de documentação",
  pending_finance: "Pendente de faturamento ou pagamento",
};

export const CONTACT_STATUSES = ["not_contacted", "waiting", "confirmed", "unavailable", "no_answer", "replacement"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  not_contacted: "Contato ainda não realizado",
  waiting: "Contatada, aguardando resposta",
  confirmed: "Disponível e confirmada",
  unavailable: "Indisponível",
  no_answer: "Contato sem retorno",
  replacement: "Substituição necessária",
};
export const CONTACT_STATUS_TONE = {
  not_contacted: "muted",
  waiting: "warning",
  confirmed: "success",
  unavailable: "danger",
  no_answer: "danger",
  replacement: "danger",
} as const;

export const DOC_STATUSES = ["na", "pending", "ok"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];
export const DOC_STATUS_LABEL: Record<DocStatus, string> = { na: "Não exigida", pending: "Pendente", ok: "Entregue" };

export const BILLING_STATUSES = ["not_billed", "billed"] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];
export const RECEIPT_STATUSES = ["pending", "received"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export const PAYMENT_STATUSES = ["pending", "paid"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FILE_KINDS = ["schedule", "guidelines", "proof", "photo", "invoice", "other"] as const;
export type TastingFileKind = (typeof FILE_KINDS)[number];
export const FILE_KIND_LABEL: Record<TastingFileKind, string> = {
  schedule: "Cronograma da marca",
  guidelines: "Orientações da campanha",
  proof: "Comprovante",
  photo: "Foto da execução",
  invoice: "Documento de faturamento",
  other: "Outro",
};

// ───────────────────────────── Materiais por marca ─────────────────────────────

/** Grupos de marca da 1ª versão (só estes; outras marcas recebem só os itens de "todas"). */
export type MaterialGroup = "divinissimo" | "suinco" | "avivar" | "cafe";
const ALL = ["divinissimo", "suinco", "avivar", "cafe", "other"] as const;
/** Itens e marcas aplicáveis — lista definida pela agência; não acrescentar sem autorização. */
export const MATERIAL_RULES: { item: string; groups: readonly (MaterialGroup | "other")[] }[] = [
  { item: "Air fryer", groups: ["divinissimo", "suinco", "avivar"] },
  { item: "Extensão elétrica", groups: ALL },
  { item: "Copinhos descartáveis", groups: ["cafe", "divinissimo"] },
  { item: "Guardanapos", groups: ALL },
  { item: "Máquinas de café", groups: ["cafe"] },
  { item: "Café", groups: ["cafe"] },
  { item: "Açúcar", groups: ["cafe"] },
  { item: "Mexedor", groups: ["cafe"] },
  { item: "Tábua e faca", groups: ["suinco", "avivar"] },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

/** Grupo pelo código/nome da marca: DIVINISSIMO, SUINCO, AVIVAR (não "Feirista Avivar"), CAFE/CAFEBRAVO. */
export function materialGroup(brand: { code: string; name: string }): MaterialGroup | "other" {
  for (const raw of [brand.code, brand.name]) {
    const n = norm(raw);
    if (n === "DIVINISSIMO") return "divinissimo";
    if (n === "SUINCO") return "suinco";
    if (n === "AVIVAR") return "avivar";
    if (n === "CAFE" || n === "CAFEBRAVO") return "cafe";
  }
  return "other";
}

export function materialsFor(brand: { code: string; name: string }): string[] {
  const g = materialGroup(brand);
  return MATERIAL_RULES.filter((r) => r.groups.includes(g)).map((r) => r.item);
}

export type MaterialsState = "none" | "pending" | "partial" | "done";
export const MATERIALS_STATE_LABEL: Record<MaterialsState, string> = { none: "Sem checklist", pending: "Checklist pendente", partial: "Materiais separados em parte", done: "Checklist concluído" };
export function materialsState(items: { checked: boolean }[]): MaterialsState {
  if (!items.length) return "none";
  const n = items.filter((i) => i.checked).length;
  return n === 0 ? "pending" : n === items.length ? "done" : "partial";
}

// ───────────────────────────── Financeiro ─────────────────────────────

export interface TastingMoney {
  revenue: number | null;
  taxes: number | null;
  tasterFee: number | null;
  transport: number | null;
  food: number | null;
  materialsCost: number | null;
  otherCost: number | null;
}

export interface TastingResult {
  revenue: number;
  taxes: number;
  netRevenue: number;
  tasterCost: number;
  otherCosts: number;
  directCost: number;
  /** Resultado de contribuição = receita − custos diretos (não é lucro líquido). */
  contribution: number;
  /** % sobre a receita; null sem receita. */
  margin: number | null;
}

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Receita prevista = valor contratual; custo direto = degustadora + demais custos;
 * contribuição = receita − custo direto; margem = contribuição ÷ receita × 100.
 * Impostos/deduções aparecem à parte (receita líquida) quando informados.
 */
export function tastingResult(m: TastingMoney): TastingResult {
  const revenue = n(m.revenue);
  const taxes = n(m.taxes);
  const tasterCost = n(m.tasterFee);
  const otherCosts = n(m.transport) + n(m.food) + n(m.materialsCost) + n(m.otherCost);
  const directCost = tasterCost + otherCosts;
  const contribution = revenue - directCost;
  return {
    revenue: round2(revenue),
    taxes: round2(taxes),
    netRevenue: round2(revenue - taxes),
    tasterCost: round2(tasterCost),
    otherCosts: round2(otherCosts),
    directCost: round2(directCost),
    contribution: round2(contribution),
    margin: revenue > 0 ? Math.round((contribution / revenue) * 1000) / 10 : null,
  };
}

/** Realizado: cada campo efetivo, quando preenchido, substitui o previsto. */
export function actualMoney(planned: TastingMoney, actual: Partial<Record<keyof TastingMoney, number | null>>): TastingMoney {
  const out = { ...planned };
  for (const k of Object.keys(planned) as (keyof TastingMoney)[]) if (typeof actual[k] === "number") out[k] = actual[k]!;
  return out;
}

/** Cancelada não soma receita prevista — só a multa/cobrança registrada explicitamente. */
export function countedRevenue(status: TastingStatus, revenue: number | null, cancellationFee: number | null): number {
  if (status === "cancelled") return n(cancellationFee);
  return n(revenue);
}

export function brl(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ───────────────────────────── WhatsApp ─────────────────────────────

/** Só dígitos; número brasileiro sem DDI ganha 55. */
export function whatsappNumber(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

export interface InviteData {
  tasterName: string;
  brandName: string;
  date: string; // dd/mm/aaaa
  time: string;
  storeName: string;
  city: string;
  product: string;
  materials: string;
  fee: number | null;
}

export function inviteMessage(d: InviteData): string {
  return [
    `Olá, ${d.tasterName.split(" ")[0]}! Tudo bem?`,
    "",
    `Estamos organizando uma degustação da marca ${d.brandName}, com as seguintes informações:`,
    "",
    `Data: ${d.date}`,
    `Horário: ${d.time}`,
    `Loja: ${d.storeName}`,
    `Cidade: ${d.city}`,
    `Produto: ${d.product || "a confirmar"}`,
    `Materiais e orientações: ${d.materials || "a confirmar"}`,
    "",
    d.fee !== null ? `O valor previsto para esta ação é de ${brl(d.fee)}.` : "O valor desta ação será informado na confirmação.",
    "",
    "Você tem disponibilidade para realizar essa degustação?",
    "",
    "Por favor, confirme para que possamos organizar a programação.",
  ].join("\n");
}

/** Link que ABRE a conversa com a mensagem pronta (o envio é feito por quem clicar). */
export function whatsappLink(phone: string | null | undefined, message: string): string | null {
  const num = whatsappNumber(phone);
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(message)}` : null;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-10" → "outubro de 2026". */
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

/** 52,9% (vírgula decimal). */
export function pct(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—";
}
