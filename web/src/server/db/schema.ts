/**
 * Esquema do banco — plataforma MCX (multi-tenant).
 *
 * Hierarquia: tenant (agência, ex.: AF Merchandising) → client (marca, ex.: SUINCO)
 * → redes / lojas / produtos / visitas / ocorrências.
 *
 * Toda tabela operacional carrega `tenant_id` e `client_id` (desnormalizados de
 * propósito): o isolamento entre clientes é feito por filtro direto, sem JOIN,
 * em todas as consultas (ver src/server/scope.ts).
 *
 * Nada é apagado fisicamente: registros têm `status` ou `deleted_at`.
 */
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  doublePrecision,
} from "drizzle-orm/pg-core";
import type {
  DamageKind,
  Location,
  OccurrenceStatus,
  OccurrenceType,
  RuptureKind,
  Severity,
} from "../../lib/domain";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const authorship = {
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
};

// ───────────────────────────── Organização ─────────────────────────────

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("clients_tenant_slug_uq").on(t.tenantId, t.slug)],
);

/** Parâmetros que o gestor ajusta sem precisar de deploy. Ver src/lib/validity.ts. */
export const clientSettings = pgTable("client_settings", {
  clientId: uuid("client_id").primaryKey().references(() => clients.id),
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
  ...authorship,
});

// ───────────────────────────── Pessoas e acesso ─────────────────────────────

export const USER_ROLES = ["admin", "agency_manager", "client_manager", "promoter"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    role: text("role").$type<UserRole>().notNull(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    email: text("email"),
    phone: text("phone"),
    document: text("document"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"), // active | inactive
    /** Incrementar derruba todas as sessões abertas do usuário. */
    sessionVersion: integer("session_version").notNull().default(1),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("users_username_uq").on(sql`lower(${t.username})`),
    check("users_role_ck", sql`${t.role} in ('admin','agency_manager','client_manager','promoter')`),
  ],
);

/** Quais marcas cada usuário enxerga (gestor da marca, promotor). */
export const userClients = pgTable(
  "user_clients",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.clientId] })],
);

// ───────────────────────────── Cadastros ─────────────────────────────

export const networks = pgTable(
  "networks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
    ...authorship,
  },
  (t) => [uniqueIndex("networks_client_name_uq").on(t.clientId, sql`lower(${t.name})`)],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    networkId: uuid("network_id").notNull().references(() => networks.id),
    /** Formato/bandeira dentro da rede (ABC Varejo, Plus, Cash): define o mix de produtos da loja. */
    format: text("format").notNull().default("varejo"),
    name: text("name").notNull(),
    code: text("code"),
    address: text("address"),
    city: text("city").notNull(),
    state: text("state").notNull().default("MG"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    managerName: text("manager_name"),
    status: text("status").notNull().default("active"),
    ...timestamps,
    ...authorship,
  },
  (t) => [index("stores_client_idx").on(t.clientId), index("stores_city_idx").on(t.clientId, t.city)],
);

export const storeAssignments = pgTable(
  "store_assignments",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storeId] }), index("store_assignments_store_idx").on(t.storeId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    code: text("code"),
    name: text("name").notNull(),
    category: text("category").notNull().default("Outros"),
    brand: text("brand").notNull().default("SUINCO"),
    presentation: text("presentation"),
    defaultUnit: text("default_unit").notNull().default("un"),
    /** Preço da tabela vigente da SUINCO (referência; o promotor informa o preço praticado na loja). */
    referencePrice: numeric("reference_price", { precision: 10, scale: 2 }),
    /** Como os promotores escrevem o produto ("ling embutido", "pe salgado"). Alimenta a busca. */
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("active"),
    ...timestamps,
    ...authorship,
  },
  (t) => [index("products_client_idx").on(t.clientId), uniqueIndex("products_client_code_uq").on(t.clientId, t.code)],
);

/**
 * Mix de produtos por rede + formato (ex.: Super ABC / Plus). Vem das planilhas
 * de MIX da SUINCO. Define a lista que o promotor vê na loja e serve de base
 * para a ruptura (produto do mix que não está na gôndola).
 */
export const productMixes = pgTable(
  "product_mixes",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    networkId: uuid("network_id").notNull().references(() => networks.id),
    format: text("format").notNull(),
    productId: uuid("product_id").notNull().references(() => products.id),
    /** Código do produto no sistema da rede (o que aparece na etiqueta da gôndola). */
    chainCode: text("chain_code"),
    seq: integer("seq").notNull().default(0),
    note: text("note"),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.networkId, t.format, t.productId] }), index("mixes_client_idx").on(t.clientId)],
);

// ───────────────────────────── Operação ─────────────────────────────

export const VISIT_STATUSES = ["in_progress", "finished", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const visits = pgTable(
  "visits",
  {
    /** Gerado no celular: permite criar a visita offline e reenviar sem duplicar. */
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    promoterId: uuid("promoter_id").notNull().references(() => users.id),
    /** Data da visita (fuso de Brasília) — base do cálculo de dias para vencer. */
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").$type<VisitStatus>().notNull().default("in_progress"),
    /** { sales_floor: true, stock: true, ... } — o que o promotor confirmou ter verificado. */
    checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull().default({}),
    notes: text("notes"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("visits_client_date_idx").on(t.clientId, t.visitDate),
    index("visits_store_idx").on(t.storeId, t.visitDate),
    index("visits_promoter_idx").on(t.promoterId, t.visitDate),
  ],
);

export const occurrences = pgTable(
  "occurrences",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    type: text("type").$type<OccurrenceType>().notNull(),
    location: text("location").$type<Location>().notNull().default("sales_floor"),
    quantity: integer("quantity"),
    unit: text("unit").notNull().default("un"),
    expiryDate: date("expiry_date", { mode: "string" }),
    /** Dias para vencer na DATA DA VISITA (fotografia histórica). */
    daysToExpiry: integer("days_to_expiry"),
    /** Classificação na data da visita, com as faixas vigentes naquele momento. */
    severity: text("severity").$type<Severity>(),
    lot: text("lot"),
    price: numeric("price", { precision: 10, scale: 2 }),
    ruptureKind: text("rupture_kind").$type<RuptureKind>(),
    damageKind: text("damage_kind").$type<DamageKind>(),
    notes: text("notes"),
    status: text("status").$type<OccurrenceStatus>().notNull().default("open"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("occ_client_type_idx").on(t.clientId, t.type),
    index("occ_visit_idx").on(t.visitId),
    index("occ_store_idx").on(t.storeId),
    index("occ_product_idx").on(t.productId),
    index("occ_expiry_idx").on(t.clientId, t.expiryDate),
    check(
      "occ_validity_ck",
      sql`${t.type} <> 'validity' or (${t.expiryDate} is not null and ${t.quantity} > 0)`,
    ),
    check("occ_damage_ck", sql`${t.type} <> 'damage' or (${t.damageKind} is not null and ${t.quantity} > 0)`),
    check("occ_rupture_ck", sql`${t.type} <> 'rupture' or ${t.ruptureKind} is not null`),
  ],
);

export const occurrencePhotos = pgTable(
  "occurrence_photos",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    occurrenceId: uuid("occurrence_id").references(() => occurrences.id),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull().default("image/jpeg"),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    ...timestamps,
    ...authorship,
  },
  (t) => [index("photos_occ_idx").on(t.occurrenceId), index("photos_visit_idx").on(t.visitId)],
);

/** Tratamento da ocorrência: cada mudança de status é uma linha (histórico completo). */
export const occurrenceActions = pgTable(
  "occurrence_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    occurrenceId: uuid("occurrence_id").notNull().references(() => occurrences.id),
    fromStatus: text("from_status").$type<OccurrenceStatus>().notNull(),
    toStatus: text("to_status").$type<OccurrenceStatus>().notNull(),
    actionText: text("action_text"),
    actionDate: date("action_date", { mode: "string" }),
    responsibleId: uuid("responsible_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [index("actions_occ_idx").on(t.occurrenceId)],
);

// ───────────────────────────── Relatórios, auditoria, notificações ─────────────────────────────

/** Snapshot imutável do relatório de um período: o que foi enviado continua igual mesmo se alguém corrigir dados depois. */
export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    data: jsonb("data").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    generatedBy: uuid("generated_by"), // null = rotina automática
  },
  (t) => [uniqueIndex("weekly_client_period_uq").on(t.clientId, t.periodStart, t.periodEnd)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(), // create | update | delete | status | login ...
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_tenant_idx").on(t.tenantId, t.createdAt)],
);

/** Estrutura pronta para alertas por e-mail/WhatsApp/push (versão 2). */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").references(() => users.id),
    kind: text("kind").notNull(),
    channel: text("channel").notNull().default("in_app"), // in_app | email | whatsapp | push
    payload: jsonb("payload").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

