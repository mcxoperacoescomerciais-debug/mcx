/**
 * Banco do MCX Operações — separado do MCX Campo. Vínculos com o Campo são
 * só referências (campo_*_id + nome copiado), nunca chaves estrangeiras.
 */
import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ClientKind, Origin, Priority, Role, Status } from "../../lib/domain";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<Role>().notNull(),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    sessionVersion: integer("session_version").notNull().default(1),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Horas disponíveis por semana (capacidade). */
    weeklyHours: integer("weekly_hours").notNull().default(40),
    /** Custo/hora em centavos — visível só para dono e gestor. */
    costPerHourCents: integer("cost_per_hour_cents"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_username_uq").on(t.username), check("users_role_ck", sql`${t.role} in ('owner','gestor','operacional')`)],
);

export const clients = pgTable(
  "clients",
  {
    id: id(),
    name: text("name").notNull(),
    kind: text("kind").$type<ClientKind>().notNull(),
    document: text("document"),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    notes: text("notes"),
    campoAgencyId: uuid("campo_agency_id"),
    campoAgencyName: text("campo_agency_name"),
    /** Valor mensal do contrato em centavos (até a Fase 5 trazer os contratos). Só dono e gestor. */
    monthlyValueCents: integer("monthly_value_cents"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [check("clients_kind_ck", sql`${t.kind} in ('agency','rep','internal')`)],
);

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    role: text("role"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [index("client_contacts_client_idx").on(t.clientId)],
);

export const clientBrands = pgTable(
  "client_brands",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    campoBrandId: uuid("campo_brand_id"),
    createdAt: createdAt(),
  },
  (t) => [index("client_brands_client_idx").on(t.clientId)],
);

export const categories = pgTable("categories", {
  id: id(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Tipo (subcategoria): entra em uso na Fase 2 (tempo médio por tipo). */
export const demandTypes = pgTable("demand_types", {
  id: id(),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const demands = pgTable(
  "demands",
  {
    id: id(),
    number: serial("number").notNull(),
    title: text("title").notNull(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    typeId: uuid("type_id").references(() => demandTypes.id),
    /** Vazio = "A distribuir" (só acontece em importação; a tela exige responsável). */
    assigneeId: uuid("assignee_id").references(() => users.id),
    status: text("status").$type<Status>().notNull().default("todo"),
    priority: text("priority").$type<Priority>().notNull().default("medium"),
    dueDate: date("due_date"),
    description: text("description"),
    brand: text("brand"),
    store: text("store"),
    promoter: text("promoter"),
    campoBrandId: uuid("campo_brand_id"),
    campoStoreId: uuid("campo_store_id"),
    campoPromoterId: uuid("campo_promoter_id"),
    origin: text("origin").$type<Origin>().notNull().default("manual"),
    waitingFor: text("waiting_for"),
    followUpDate: date("follow_up_date"),
    estimateMinutes: integer("estimate_minutes"),
    routineId: uuid("routine_id"),
    templateId: uuid("template_id"),
    templateVersion: integer("template_version"),
    /** Nº de ações/degustações usado para multiplicar as quantidades do checklist. */
    actionsCount: integer("actions_count"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by").references(() => users.id),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("demands_assignee_idx").on(t.assigneeId, t.status),
    index("demands_client_idx").on(t.clientId, t.status),
    check("demands_status_ck", sql`${t.status} in ('todo','doing','waiting','approval','done','cancelled')`),
    check("demands_priority_ck", sql`${t.priority} in ('low','medium','high','urgent')`),
  ],
);

/** O que o perfil operacional enxerga além das próprias demandas. */
export const demandShares = pgTable(
  "demand_shares",
  {
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.demandId, t.userId] })],
);

export const demandChecklistItems = pgTable(
  "demand_checklist_items",
  {
    id: id(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    text: text("text").notNull(),
    position: integer("position").notNull().default(0),
    section: text("section"),
    quantity: integer("quantity"),
    unit: text("unit"),
    required: boolean("required").notNull().default(false),
    note: text("note"),
    checked: boolean("checked").notNull().default(false),
    checkedBy: uuid("checked_by").references(() => users.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    /** "Não se aplica", com motivo. */
    notApplicable: boolean("not_applicable").notNull().default(false),
    naReason: text("na_reason"),
    /** Conferência dupla ("Conferido"). */
    verified: boolean("verified").notNull().default(false),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    /** Vínculo opcional com um item do estoque do contratante (Fase 4). */
    stockItemId: uuid("stock_item_id"),
    createdAt: createdAt(),
  },
  (t) => [index("demand_checklist_demand_idx").on(t.demandId)],
);

export const demandComments = pgTable(
  "demand_comments",
  {
    id: id(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("demand_comments_demand_idx").on(t.demandId)],
);

/** Quem, quando, de, para — em toda mudança de status, responsável ou prazo. */
export const demandHistory = pgTable(
  "demand_history",
  {
    id: id(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    userId: uuid("user_id").references(() => users.id),
    field: text("field").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: createdAt(),
  },
  (t) => [index("demand_history_demand_idx").on(t.demandId)],
);

/** Trilha de auditoria: só inserção; nenhuma tela edita ou apaga. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    userId: uuid("user_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    source: text("source").notNull().default("tela"),
    reason: text("reason"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_entity_idx").on(t.entity, t.entityId)],
);

// ---------------------------------------------------------------------------
// Fase 2 — tempo, atividade, rotinas e modelos de checklist
// ---------------------------------------------------------------------------

/** Tempo apontado por demanda (conclusão, cronômetro ou lançamento manual). */
export const timeEntries = pgTable(
  "time_entries",
  {
    id: id(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    day: date("day").notNull(),
    minutes: integer("minutes").notNull(),
    source: text("source").$type<"completion" | "timer" | "manual">().notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("time_entries_user_day_idx").on(t.userId, t.day), index("time_entries_demand_idx").on(t.demandId), check("time_entries_minutes_ck", sql`${t.minutes} > 0`)],
);

/** Cronômetro: no máximo um ativo por pessoa. */
export const timers = pgTable("timers", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  demandId: uuid("demand_id").notNull().references(() => demands.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

/** "Tempo no sistema" por dia: só minutos e primeiro/último sinal. Nenhum conteúdo, tela ou URL. */
export const activityDays = pgTable(
  "activity_days",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    day: date("day").notNull(),
    minutes: integer("minutes").notNull().default(0),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

export const checklistTemplates = pgTable("checklist_templates", {
  id: id(),
  name: text("name").notNull(),
  /** Vazio = "Geral MCX". */
  clientId: uuid("client_id").references(() => clients.id),
  categoryId: uuid("category_id").references(() => categories.id),
  typeId: uuid("type_id").references(() => demandTypes.id),
  status: text("status").$type<"draft" | "published" | "archived">().notNull().default("draft"),
  /** Conferência dupla: colunas "Separado" e "Conferido". */
  doubleCheck: boolean("double_check").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Itens por versão: editar o modelo cria uma versão nova; as antigas ficam. */
export const checklistTemplateItems = pgTable(
  "checklist_template_items",
  {
    id: id(),
    templateId: uuid("template_id").notNull().references(() => checklistTemplates.id),
    version: integer("version").notNull(),
    section: text("section"),
    text: text("text").notNull(),
    quantity: integer("quantity"),
    unit: text("unit"),
    /** Quantidade por ação: multiplica pelo nº de ações ao aplicar. */
    perAction: boolean("per_action").notNull().default(false),
    required: boolean("required").notNull().default(false),
    note: text("note"),
    /** Item sugerido, ainda não confirmado pela gestora. */
    toValidate: boolean("to_validate").notNull().default(false),
    /** Vínculo opcional com um item do estoque do contratante (Fase 4). */
    stockItemId: uuid("stock_item_id"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("checklist_template_items_tpl_idx").on(t.templateId, t.version)],
);

/** "Faltou algo": o que foi esquecido numa demanda concluída. */
export const checklistMisses = pgTable(
  "checklist_misses",
  {
    id: id(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    templateId: uuid("template_id").references(() => checklistTemplates.id),
    item: text("item").notNull(),
    quantity: text("quantity"),
    impact: text("impact"),
    addedToTemplate: boolean("added_to_template").notNull().default(false),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("checklist_misses_tpl_idx").on(t.templateId)],
);

export const routines = pgTable("routines", {
  id: id(),
  name: text("name").notNull(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  categoryId: uuid("category_id").notNull().references(() => categories.id),
  typeId: uuid("type_id").references(() => demandTypes.id),
  assigneeId: uuid("assignee_id").notNull().references(() => users.id),
  priority: text("priority").$type<Priority>().notNull().default("medium"),
  frequency: text("frequency").$type<"weekly" | "monthly" | "interval">().notNull(),
  /** weekly: dias da semana (0 = domingo … 6 = sábado). */
  weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),
  /** monthly: dia do mês (1–31; mês curto usa o último dia). */
  monthDay: integer("month_day"),
  /** interval: a cada N dias a partir de start_date. */
  intervalDays: integer("interval_days"),
  startDate: date("start_date").notNull(),
  /** Gerar a demanda N dias antes da ocorrência. */
  leadDays: integer("lead_days").notNull().default(0),
  /** Prazo = ocorrência + N dias. */
  dueOffsetDays: integer("due_offset_days").notNull().default(0),
  templateId: uuid("template_id").references(() => checklistTemplates.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Idempotência: uma demanda por (rotina, data da ocorrência). */
export const routineRuns = pgTable(
  "routine_runs",
  {
    routineId: uuid("routine_id").notNull().references(() => routines.id),
    occurrence: date("occurrence").notNull(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.routineId, t.occurrence] })],
);

// ---------------------------------------------------------------------------
// Fase 3 — Comercial (CRM): funil, leads, interações e modelos de mensagem
// ---------------------------------------------------------------------------

/** Etapas do funil. `key` identifica as etapas com regra própria; etapas criadas depois ficam sem key. */
export const crmStages = pgTable(
  "crm_stages",
  {
    id: id(),
    key: text("key"),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    kind: text("kind").$type<"open" | "won" | "lost" | "nurture">().notNull().default("open"),
    /** Chance de fechar (0–100) — pondera o pipeline. */
    probability: integer("probability").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("crm_stages_key_uq").on(t.key), check("crm_stages_kind_ck", sql`${t.kind} in ('open','won','lost','nurture')`)],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    number: serial("number").notNull(),
    company: text("company").notNull(),
    /** Nome sem acento/pontuação, para achar duplicata. */
    companyKey: text("company_key").notNull(),
    type: text("type").notNull(),
    city: text("city"),
    region: text("region"),
    source: text("source").notNull(),
    referredBy: text("referred_by"),
    /** LGPD: de onde veio o dado de contato. */
    dataSource: text("data_source"),
    products: jsonb("products").$type<string[]>().notNull().default([]),
    promoters: integer("promoters"),
    actionsPerMonth: integer("actions_per_month"),
    /** Valor mensal potencial em centavos (calculado pelo porte ou informado). */
    potentialCents: integer("potential_cents"),
    potentialManual: boolean("potential_manual").notNull().default(false),
    /** Oportunidade de expansão num contratante que já existe. */
    clientId: uuid("client_id").references(() => clients.id),
    ownerId: uuid("owner_id").notNull().references(() => users.id),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    stageId: uuid("stage_id").notNull().references(() => crmStages.id),
    stageSince: timestamp("stage_since", { withTimezone: true }).notNull().defaultNow(),
    nextAction: text("next_action"),
    nextActionDate: date("next_action_date"),
    proposalValueCents: integer("proposal_value_cents"),
    proposalDate: date("proposal_date"),
    proposalValidUntil: date("proposal_valid_until"),
    lossReason: text("loss_reason"),
    lossNote: text("loss_note"),
    firstContactAt: timestamp("first_contact_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    wonAt: timestamp("won_at", { withTimezone: true }),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    wonClientId: uuid("won_client_id").references(() => clients.id),
    wonDemandId: uuid("won_demand_id").references(() => demands.id),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("leads_stage_idx").on(t.stageId), index("leads_next_idx").on(t.nextActionDate), index("leads_company_idx").on(t.companyKey)],
);

export const leadContacts = pgTable(
  "lead_contacts",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id),
    name: text("name").notNull(),
    role: text("role"),
    whatsapp: text("whatsapp"),
    /** Só dígitos, com 55 — para o link do WhatsApp e para achar duplicata. */
    whatsappDigits: text("whatsapp_digits"),
    email: text("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    /** O contato pediu para não receber mensagens. */
    optOut: boolean("opt_out").notNull().default(false),
    optOutAt: timestamp("opt_out_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("lead_contacts_lead_idx").on(t.leadId), index("lead_contacts_wa_idx").on(t.whatsappDigits)],
);

/** Toda mudança de etapa, com data: mede ciclo e conversão. */
export const leadStageHistory = pgTable(
  "lead_stage_history",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id),
    fromStageId: uuid("from_stage_id").references(() => crmStages.id),
    toStageId: uuid("to_stage_id").notNull().references(() => crmStages.id),
    userId: uuid("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("lead_stage_history_lead_idx").on(t.leadId)],
);

export const leadInteractions = pgTable(
  "lead_interactions",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    outcome: text("outcome").notNull(),
    templateId: uuid("template_id"),
    createdAt: createdAt(),
  },
  (t) => [index("lead_interactions_lead_idx").on(t.leadId)],
);

/** Modelos de mensagem por etapa, com status de aprovação. */
export const messageTemplates = pgTable("message_templates", {
  id: id(),
  name: text("name").notNull(),
  stageId: uuid("stage_id").references(() => crmStages.id),
  channel: text("channel").notNull().default("whatsapp"),
  body: text("body").notNull(),
  status: text("status").$type<"draft" | "approved" | "archived">().notNull().default("draft"),
  /** Texto sugerido pelo sistema, ainda não validado pelo dono. */
  toValidate: boolean("to_validate").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Fila para automação futura (API oficial do WhatsApp). Nesta fase NADA é
 * enviado sozinho: a tabela existe só para o envio automático entrar depois.
 */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: id(),
    leadId: uuid("lead_id").notNull().references(() => leads.id),
    contactId: uuid("contact_id").references(() => leadContacts.id),
    templateId: uuid("template_id").references(() => messageTemplates.id),
    channel: text("channel").notNull().default("whatsapp"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").$type<"queued" | "sent" | "cancelled" | "failed">().notNull().default("queued"),
    createdAt: createdAt(),
  },
  (t) => [index("outbound_messages_status_idx").on(t.status, t.scheduledFor)],
);

// ---------------------------------------------------------------------------
// Fase 4 — Estoque de materiais dos clientes
// ---------------------------------------------------------------------------

export const stockItems = pgTable(
  "stock_items",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    brand: text("brand"),
    name: text("name").notNull(),
    category: text("category").$type<"product" | "disposable" | "pdv" | "equipment">().notNull(),
    unit: text("unit").notNull().default("un"),
    minQuantity: integer("min_quantity").notNull().default(0),
    location: text("location"),
    tracksExpiry: boolean("tracks_expiry").notNull().default(false),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stock_items_client_idx").on(t.clientId), check("stock_items_category_ck", sql`${t.category} in ('product','disposable','pdv','equipment')`)],
);

/**
 * Movimentações: o saldo é SEMPRE a soma de `delta` — nunca é editado à mão e
 * nenhuma movimentação é alterada ou apagada (erro se corrige com outra).
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: id(),
    itemId: uuid("item_id").notNull().references(() => stockItems.id),
    kind: text("kind").$type<"in" | "out" | "return" | "adjust" | "loss">().notNull(),
    /** Positivo entra, negativo sai. */
    delta: integer("delta").notNull(),
    day: date("day").notNull(),
    /** Entrada: origem. Saída/devolução: destino (ação, degustação). */
    counterpart: text("counterpart"),
    reference: text("reference"),
    lot: text("lot"),
    expiresOn: date("expires_on"),
    city: text("city"),
    store: text("store"),
    promoter: text("promoter"),
    reason: text("reason"),
    demandId: uuid("demand_id").references(() => demands.id),
    checklistItemId: uuid("checklist_item_id"),
    userId: uuid("user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("stock_movements_item_idx").on(t.itemId, t.day), index("stock_movements_demand_idx").on(t.demandId), check("stock_movements_kind_ck", sql`${t.kind} in ('in','out','return','adjust','loss')`), check("stock_movements_delta_ck", sql`${t.delta} <> 0`)],
);

/** Equipamentos: controle por unidade (garrafa térmica 1, mesa 2…). */
export const stockUnits = pgTable(
  "stock_units",
  {
    id: id(),
    itemId: uuid("item_id").notNull().references(() => stockItems.id),
    label: text("label").notNull(),
    status: text("status").$type<"available" | "in_use" | "maintenance">().notNull().default("available"),
    holder: text("holder"),
    dueBack: date("due_back"),
    demandId: uuid("demand_id").references(() => demands.id),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stock_units_item_idx").on(t.itemId), check("stock_units_status_ck", sql`${t.status} in ('available','in_use','maintenance')`)],
);

/** Contagem feita pelo operacional: vira ajuste só depois que o gestor aprova. */
export const stockCounts = pgTable(
  "stock_counts",
  {
    id: id(),
    itemId: uuid("item_id").notNull().references(() => stockItems.id),
    counted: integer("counted").notNull(),
    balanceAtCount: integer("balance_at_count").notNull(),
    note: text("note"),
    status: text("status").$type<"pending" | "applied" | "discarded">().notNull().default("pending"),
    userId: uuid("user_id").notNull().references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("stock_counts_item_idx").on(t.itemId, t.status)],
);

/** Alertas que viraram demanda. A chave única evita abrir a mesma demanda duas vezes. */
export const stockAlerts = pgTable(
  "stock_alerts",
  {
    id: id(),
    kind: text("kind").$type<"low" | "expiry" | "overdue" | "inventory">().notNull(),
    /** O que disparou (item, item+lote+validade, unidade ou contratante+mês). */
    refKey: text("ref_key").notNull(),
    demandId: uuid("demand_id").notNull().references(() => demands.id),
    day: date("day").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stock_alerts_day_uq").on(t.kind, t.refKey, t.day)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});
