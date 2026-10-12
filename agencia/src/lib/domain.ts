/**
 * Vocabulário do domínio: estados, rótulos e tons visuais.
 *
 * Tudo aqui é puro (sem banco), compartilhado entre servidor, painel e app do
 * promotor. As cores comunicam ESTADO operacional — nunca são decoração — e
 * sempre aparecem junto de texto (e ícone, nas telas), nunca sozinhas.
 */

export const ROLES = ["admin", "manager", "promoter"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  manager: "Gestor da operação",
  promoter: "Promotor",
};

export const EMPLOYMENTS = ["fixed", "freelancer"] as const;
export type Employment = (typeof EMPLOYMENTS)[number];
export const EMPLOYMENT_LABEL: Record<Employment, string> = { fixed: "Fixo", freelancer: "Freelancer" };

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "sync" | "muted";

// ───────────────────────────── Visita ao supermercado ─────────────────────────────

export const VISIT_STATUSES = ["in_progress", "completed", "closed_incomplete", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  in_progress: "Em andamento",
  completed: "Concluída",
  closed_incomplete: "Encerrada incompleta",
  cancelled: "Cancelada",
};
export const VISIT_STATUS_TONE: Record<VisitStatus, Tone> = {
  in_progress: "info",
  completed: "success",
  closed_incomplete: "warning",
  cancelled: "muted",
};

export const VISIT_ORIGINS = ["scheduled", "extra"] as const;
export type VisitOrigin = (typeof VISIT_ORIGINS)[number];
export const VISIT_ORIGIN_LABEL: Record<VisitOrigin, string> = { scheduled: "Programada", extra: "Extraordinária" };

// ───────────────────────────── Atendimento por marca ─────────────────────────────

/**
 * Estados gravados no servidor. "pending" = marca prevista ainda não iniciada
 * (não há linha no banco). "awaiting_sync" existe só no aparelho: o promotor
 * finalizou, mas o servidor ainda não confirmou.
 */
export const ATTENDANCE_STATUSES = ["in_progress", "completed", "correction_requested", "cancelled"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type AttendanceDisplayStatus = AttendanceStatus | "pending" | "awaiting_sync";
export const ATTENDANCE_STATUS_LABEL: Record<AttendanceDisplayStatus, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  awaiting_sync: "Aguardando sincronização",
  completed: "Concluído",
  correction_requested: "Pendente de correção",
  cancelled: "Cancelado",
};
export const ATTENDANCE_STATUS_TONE: Record<AttendanceDisplayStatus, Tone> = {
  pending: "neutral",
  in_progress: "info",
  awaiting_sync: "sync",
  completed: "success",
  correction_requested: "danger",
  cancelled: "muted",
};

export const REVIEW_STATUSES = ["none", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = { none: "Sem avaliação", approved: "Aprovado", rejected: "Reprovado" };

/** Itens obrigatórios que podem ser dispensados por exceção justificada. */
export const EXCEPTION_ITEMS = ["before_photo", "after_photo", "stock"] as const;
export type ExceptionItem = (typeof EXCEPTION_ITEMS)[number];
export const EXCEPTION_ITEM_LABEL: Record<ExceptionItem, string> = {
  before_photo: "Foto do antes",
  after_photo: "Foto do depois",
  stock: "Relatório de estoque",
};

export const EXCEPTION_REASONS = ["camera_unavailable", "product_unavailable", "store_forbids", "area_inaccessible", "other"] as const;
export type ExceptionReason = (typeof EXCEPTION_REASONS)[number];
export const EXCEPTION_REASON_LABEL: Record<ExceptionReason, string> = {
  camera_unavailable: "Câmera ou celular com problema",
  product_unavailable: "Produto indisponível na loja",
  store_forbids: "Loja não permitiu fotografar",
  area_inaccessible: "Setor inacessível",
  other: "Outro motivo",
};

// ───────────────────────────── Fotos ─────────────────────────────

export const PHOTO_KINDS = ["before", "after", "rupture", "occurrence", "validity", "damage"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  before: "Antes",
  after: "Depois",
  rupture: "Evidência de ruptura",
  occurrence: "Ocorrência",
  validity: "Validade",
  damage: "Avaria",
};

export const PHOTO_SOURCES = ["camera", "gallery"] as const;
export type PhotoSource = (typeof PHOTO_SOURCES)[number];

// ───────────────────────────── Estoque ─────────────────────────────

/**
 * "Informação pendente" NÃO é um estado gravado: é a ausência de registro.
 * Assim, campo vazio nunca vira estoque zero por acidente.
 */
export const STOCK_STATES = ["quantity", "zero", "not_found", "not_applicable"] as const;
export type StockState = (typeof STOCK_STATES)[number];
export type StockDisplayState = StockState | "pending" | "awaiting_sync";
export const STOCK_STATE_LABEL: Record<StockDisplayState, string> = {
  quantity: "Estoque informado",
  zero: "Estoque zero",
  not_found: "Produto não encontrado",
  not_applicable: "Não se aplica à loja",
  pending: "Informação pendente",
  awaiting_sync: "Aguardando sincronização",
};
export const STOCK_STATE_SHORT: Record<StockDisplayState, string> = {
  quantity: "Informado",
  zero: "Zero",
  not_found: "Não encontrado",
  not_applicable: "Não se aplica",
  pending: "Pendente",
  awaiting_sync: "Aguardando envio",
};
export const STOCK_STATE_TONE: Record<StockDisplayState, Tone> = {
  quantity: "success",
  zero: "danger",
  not_found: "warning",
  not_applicable: "muted",
  pending: "neutral",
  awaiting_sync: "sync",
};

export const UNITS = ["un", "pct", "cx", "fd", "kg", "dp"] as const;
export type Unit = (typeof UNITS)[number];
/** Unidades que o promotor escolhe ao contar o estoque (além da unidade do produto). */
export const STOCK_COUNT_UNITS = ["un", "cx"] as const satisfies readonly Unit[];
export const UNIT_LABEL: Record<Unit, string> = {
  un: "Unidades",
  pct: "Pacotes",
  cx: "Caixas",
  fd: "Fardos",
  kg: "Quilos",
  dp: "Displays",
};

// ───────────────────────────── Ruptura ─────────────────────────────

/**
 * Ruptura no modo SUINCO: o promotor só marca "Ruptura total" na lista de
 * produtos (um toque). As demais situações existem apenas para registros
 * antigos continuarem legíveis.
 */
export const RUPTURE_SITUATIONS = [
  "total",
  "shelf_empty",
  "backroom_empty",
  "missing_display",
  "registered_not_found",
  "unavailable_other",
  "unconfirmed",
] as const;
export type RuptureSituation = (typeof RUPTURE_SITUATIONS)[number];
export const RUPTURE_SITUATION_LABEL: Record<RuptureSituation, string> = {
  total: "Ruptura total",
  shelf_empty: "Sem estoque na área de venda",
  backroom_empty: "Sem estoque no depósito (verificado)",
  missing_display: "Ausente da exposição",
  registered_not_found: "Cadastrado, mas não localizado",
  unavailable_other: "Indisponível por outro motivo",
  unconfirmed: "Ainda não confirmada",
};

export const RUPTURE_STATUSES = ["new", "analysis", "treatment", "resolved", "not_confirmed", "closed"] as const;
export type RuptureStatus = (typeof RUPTURE_STATUSES)[number];
export const RUPTURE_STATUS_LABEL: Record<RuptureStatus, string> = {
  new: "Nova",
  analysis: "Em análise",
  treatment: "Em tratativa",
  resolved: "Resolvida",
  not_confirmed: "Não confirmada",
  closed: "Encerrada com justificativa",
};
export const RUPTURE_STATUS_TONE: Record<RuptureStatus, Tone> = {
  new: "danger",
  analysis: "warning",
  treatment: "info",
  resolved: "success",
  not_confirmed: "muted",
  closed: "muted",
};
export const RUPTURE_OPEN_STATUSES: RuptureStatus[] = ["new", "analysis", "treatment"];
/** Estados finais exigem a ação tomada (texto) — ver regra 8.4. */
export const RUPTURE_FINAL_STATUSES: RuptureStatus[] = ["resolved", "not_confirmed", "closed"];

// ───────────────────────────── Validade e avaria (modo SUINCO) ─────────────────────────────

export const VALIDITY_LOCATIONS = ["sales_floor", "stock"] as const;
export type ValidityLocation = (typeof VALIDITY_LOCATIONS)[number];
export const VALIDITY_LOCATION_LABEL: Record<ValidityLocation, string> = { sales_floor: "Área de vendas", stock: "Estoque" };

export const DAMAGE_KINDS = ["damaged_package", "violated", "no_vacuum", "strange_color", "liquid", "unfit", "other"] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];
export const DAMAGE_KIND_LABEL: Record<DamageKind, string> = {
  damaged_package: "Embalagem danificada",
  violated: "Embalagem violada",
  no_vacuum: "Sem vácuo",
  strange_color: "Coloração estranha",
  liquid: "Líquido",
  unfit: "Produto impróprio",
  other: "Outro",
};

/** Unidades oferecidas na validade/avaria: un e cx; kg só para produto fracionado (unidade kg). */
export const ITEM_UNITS = ["un", "cx", "kg"] as const;
export type ItemUnit = (typeof ITEM_UNITS)[number];

// ───────────────────────────── Ocorrências ─────────────────────────────

export const OCCURRENCE_CATEGORIES = [
  "no_space",
  "incomplete_display",
  "missing_material",
  "cannot_execute",
  "store_closed",
  "route_divergence",
  "display_problem",
  "other",
] as const;
export type OccurrenceCategory = (typeof OCCURRENCE_CATEGORIES)[number];
export const OCCURRENCE_CATEGORY_LABEL: Record<OccurrenceCategory, string> = {
  no_space: "Produto sem espaço adequado",
  incomplete_display: "Exposição incompleta",
  missing_material: "Material de merchandising ausente",
  cannot_execute: "Impossibilidade de executar",
  store_closed: "Loja fechada ou setor inacessível",
  route_divergence: "Divergência no roteiro",
  display_problem: "Problema com a exposição",
  other: "Outra ocorrência",
};

export const OCCURRENCE_STATUSES = ["open", "analyzed", "resolved"] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];
export const OCCURRENCE_STATUS_LABEL: Record<OccurrenceStatus, string> = {
  open: "Não tratada",
  analyzed: "Analisada",
  resolved: "Tratada",
};

// ───────────────────────────── Programação (dashboard) ─────────────────────────────

/**
 * Situação de uma loja programada no dia. Cada programação cai em EXATAMENTE
 * um destes grupos — ver `stopBucket` em src/lib/rules.ts.
 */
export const STOP_BUCKETS = ["completed", "exception", "in_progress", "late", "pending", "missed"] as const;
export type StopBucket = (typeof STOP_BUCKETS)[number];
export const STOP_BUCKET_LABEL: Record<StopBucket, string> = {
  completed: "Concluída",
  exception: "Concluída com exceção",
  in_progress: "Em andamento",
  late: "Atrasada",
  pending: "Pendente",
  missed: "Não realizada",
};
export const STOP_BUCKET_TONE: Record<StopBucket, Tone> = {
  completed: "success",
  exception: "warning",
  in_progress: "info",
  late: "danger",
  pending: "neutral",
  missed: "danger",
};
export const STOP_BUCKET_HELP: Record<StopBucket, string> = {
  completed: "Visita encerrada com todas as marcas previstas concluídas, sem exceções.",
  exception: "Visita encerrada, mas com marca pendente justificada, exceção de foto/estoque ou correção solicitada.",
  in_progress: "Visita iniciada e ainda não encerrada.",
  late: "Não iniciada e o horário previsto (mais a tolerância configurada) já passou.",
  pending: "Não iniciada e ainda dentro do prazo (ou sem horário previsto).",
  missed: "Dia já encerrado sem a visita ter sido iniciada.",
};

// ───────────────────────────── Pendências ─────────────────────────────

export const ISSUE_KINDS = [
  "missing_before",
  "missing_after",
  "stock_incomplete",
  "visit_open",
  "correction_pending",
  "photo_unsynced",
  "exception",
  "occurrence_open",
  "visit_late",
] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];
export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  missing_before: "Sem foto do antes",
  missing_after: "Sem foto do depois",
  stock_incomplete: "Estoque incompleto",
  visit_open: "Visita não finalizada",
  correction_pending: "Aguardando correção",
  photo_unsynced: "Foto aguardando sincronização",
  exception: "Exceção operacional",
  occurrence_open: "Ocorrência não tratada",
  visit_late: "Visita atrasada",
};
/** Prioridade padrão (1 = mais urgente). Configurável em Configurações. */
export const DEFAULT_ISSUE_PRIORITY: Record<IssueKind, number> = {
  visit_late: 1,
  missing_after: 2,
  missing_before: 2,
  exception: 3,
  correction_pending: 4,
  visit_open: 4,
  stock_incomplete: 5,
  occurrence_open: 5,
  photo_unsynced: 6,
};

export const ISSUE_REVIEW_STATUSES = ["analyzed", "concluded"] as const;
export type IssueReviewStatus = (typeof ISSUE_REVIEW_STATUSES)[number];
export const ISSUE_REVIEW_LABEL: Record<IssueReviewStatus | "open", string> = {
  open: "Não analisada",
  analyzed: "Analisada — acompanhando",
  concluded: "Concluída pelo gestor",
};

export const CORRECTION_STATUSES = ["open", "answered", "cancelled"] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];
