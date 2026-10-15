/**
 * Esquema do banco — MCX Campo (gestão de promotores e execução em loja).
 *
 * Hierarquia operacional:
 *   agência → promotor → programação (roteiro do dia) → VISITA à loja
 *     → ATENDIMENTO de cada marca → fotos, estoque, ruptura, ocorrências.
 *
 * Regras de modelagem:
 * - Toda tabela operacional carrega `agency_id`: o isolamento entre agências é
 *   um filtro direto em todas as consultas (src/server/scope.ts).
 * - Visita, atendimento, ruptura, ocorrência e foto usam UUID gerado no
 *   celular: o envio é idempotente (reenviar não duplica).
 * - Atendimento só guarda `visit_id` + `brand_id`; loja e promotor vêm da
 *   visita (sem duplicar dados que o relacionamento já garante).
 * - Nada operacional é apagado fisicamente (status / deleted_at). Usuário
 *   desativado mantém todos os registros históricos.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  numeric,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Severity } from "../../lib/validity";
import type {
  AttendanceStatus,
  DamageKind,
  CorrectionStatus,
  Employment,
  ExceptionItem,
  ExceptionReason,
  IssueReviewStatus,
  OccurrenceCategory,
  OccurrenceStatus,
  PhotoKind,
  PhotoSource,
  ReviewStatus,
  Role,
  RuptureSituation,
  RuptureStatus,
  StockState,
  Unit,
  ValidityLocation,
  VisitOrigin,
  VisitStatus,
  WorkMode,
} from "../../lib/domain";
import type { TargetPeriod } from "../../lib/portfolio";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};
const authorship = {
  createdBy: uuid("created_by"),
  updatedBy: uuid("updated_by"),
};
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(","));

// ───────────────────────────── Agência e pessoas ─────────────────────────────

/**
 * Agência cliente (AF, ETROS…) ou a plataforma (MCX). Usuários da plataforma
 * (`users.platform`) moram na agência "platform" e entram em qualquer agência
 * cliente pelo seletor do painel; os dados de cada agência nunca se misturam.
 */
export const agencies = pgTable(
  "agencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: text("kind").$type<"client" | "platform">().notNull().default("client"),
    /** Suspensa: ninguém da agência entra (a plataforma continua vendo). */
    status: text("status").$type<"active" | "suspended">().notNull().default("active"),
    /** Logo como data URL (PNG/JPEG/WebP pequeno), exibido no painel, app e PDFs. */
    logo: text("logo"),
    /** Parâmetros operacionais (src/lib/settings.ts). */
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    check("agencies_kind_ck", sql`${t.kind} in ('client','platform')`),
    check("agencies_status_ck", sql`${t.status} in ('active','suspended')`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    role: text("role").$type<Role>().notNull(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    email: text("email"),
    phone: text("phone"),
    internalCode: text("internal_code"),
    employment: text("employment").$type<Employment>(),
    region: text("region"),
    /** Gestor responsável (para promotores). */
    managerId: uuid("manager_id"),
    /** Gestor: enxerga todas as marcas? Se false, só as de `user_brands`. */
    allBrands: boolean("all_brands").notNull().default(true),
    /** Gestor: só os promotores sob sua responsabilidade (`manager_id`)? */
    teamOnly: boolean("team_only").notNull().default(false),
    /** Promotor: "route" (roteiro com dia certo) ou "portfolio" (carteira com meta semanal). null = padrão da agência. */
    workMode: text("work_mode").$type<WorkMode>(),
    /** Equipe MCX: administra todas as agências (nunca definido pela tela da agência). */
    platform: boolean("platform").notNull().default(false),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    /** Incrementar derruba todas as sessões abertas do usuário. */
    sessionVersion: integer("session_version").notNull().default(1),
    lastLoginAt: ts("last_login_at"),
    deactivatedAt: ts("deactivated_at"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("users_username_uq").on(sql`lower(${t.username})`),
    index("users_agency_role_idx").on(t.agencyId, t.role),
    check("users_role_ck", sql`${t.role} in ('admin','manager','promoter')`),
    check("users_employment_ck", sql`${t.employment} is null or ${t.employment} in ('fixed','freelancer')`),
    check("users_work_mode_ck", sql`${t.workMode} is null or ${t.workMode} in ('route','portfolio')`),
  ],
);

// ───────────────────────────── Cadastros ─────────────────────────────

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    minBeforePhotos: integer("min_before_photos").notNull().default(1),
    minAfterPhotos: integer("min_after_photos").notNull().default(1),
    requireStock: boolean("require_stock").notNull().default(true),
    rupturePhotoRequired: boolean("rupture_photo_required").notNull().default(false),
    allowGallery: boolean("allow_gallery").notNull().default(true),
    /** Atividades da etapa "Execução" (checklist curto exibido ao promotor). */
    activities: jsonb("activities").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("brands_agency_code_uq").on(t.agencyId, sql`lower(${t.code})`),
    uniqueIndex("brands_agency_name_uq").on(t.agencyId, sql`lower(${t.name})`),
    check("brands_photos_ck", sql`${t.minBeforePhotos} between 0 and 10 and ${t.minAfterPhotos} between 0 and 10`),
  ],
);

export const chains = pgTable(
  "chains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    name: text("name").notNull(),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("chains_agency_name_uq").on(t.agencyId, sql`lower(${t.name})`)],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    chainId: uuid("chain_id").references(() => chains.id),
    name: text("name").notNull(),
    code: text("code"),
    cnpj: text("cnpj"),
    address: text("address"),
    district: text("district"),
    city: text("city").notNull(),
    state: text("state").notNull().default("MG"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    rules: text("rules"),
    notes: text("notes"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("stores_agency_idx").on(t.agencyId, t.status),
    index("stores_chain_idx").on(t.chainId),
    uniqueIndex("stores_agency_code_uq").on(t.agencyId, t.chainId, t.code).where(sql`${t.code} is not null`),
  ],
);

/** Marcas autorizadas em cada loja. */
export const storeBrands = pgTable(
  "store_brands",
  {
    storeId: uuid("store_id").notNull().references(() => stores.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.brandId] }), index("store_brands_brand_idx").on(t.brandId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    name: text("name").notNull(),
    /** Nome normalizado (sem acento, espaços e pontuação) — impede duplicatas por grafia. */
    nameKey: text("name_key").notNull(),
    sku: text("sku").notNull(),
    ean: text("ean"),
    category: text("category"),
    variant: text("variant"),
    package: text("package"),
    unit: text("unit").$type<Unit>().notNull().default("un"),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("products_brand_sku_uq").on(t.brandId, sql`lower(${t.sku})`),
    uniqueIndex("products_brand_namekey_uq").on(t.brandId, t.nameKey),
    index("products_agency_idx").on(t.agencyId, t.brandId),
    check("products_unit_ck", sql`${t.unit} in ('un','pct','cx','fd','kg','dp')`),
  ],
);

/**
 * Produtos acompanhados em cada loja. Se uma loja não tem NENHUMA linha para
 * uma marca, todos os produtos ativos da marca são acompanhados (padrão).
 */
export const storeProducts = pgTable(
  "store_products",
  {
    storeId: uuid("store_id").notNull().references(() => stores.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.productId] }), index("store_products_product_idx").on(t.productId)],
);

/**
 * Mixes de uma marca por formato de loja numa rede (ex.: ABC VAREJO, PLUS,
 * CASH). Quando a rede tem mais de um, o promotor escolhe o formato da loja no
 * primeiro atendimento; a escolha vira a lista da loja (`store_products`).
 */
export const productMixes = pgTable(
  "product_mixes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    chainId: uuid("chain_id").notNull().references(() => chains.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    name: text("name").notNull(),
    productIds: jsonb("product_ids").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("product_mixes_uq").on(t.chainId, t.brandId, sql`lower(${t.name})`)],
);

/** Formato (mix) escolhido para a loja em cada marca. */
export const storeMixes = pgTable(
  "store_mixes",
  {
    storeId: uuid("store_id").notNull().references(() => stores.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    mixId: uuid("mix_id").notNull().references(() => productMixes.id),
    chosenBy: uuid("chosen_by"),
    chosenAt: ts("chosen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.brandId] })],
);

/** Lojas autorizadas para o promotor. */
export const userStores = pgTable(
  "user_stores",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.storeId] }), index("user_stores_store_idx").on(t.storeId)],
);

/** Marcas autorizadas para o promotor / marcas visíveis para gestor restrito. */
export const userBrands = pgTable(
  "user_brands",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.brandId] }), index("user_brands_brand_idx").on(t.brandId)],
);

/**
 * Carteira com meta: quantas visitas por SEMANA o promotor deve fazer em cada
 * marca de cada loja. O dia é escolha do promotor.
 */
export const visitTargets = pgTable(
  "visit_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    promoterId: uuid("promoter_id").notNull().references(() => users.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    /** Vezes por período (ver `period`). Nome histórico: "per_week". */
    perWeek: integer("per_week").notNull(),
    /** week = por semana; fortnight = a cada 2 semanas (quinzenal); month = por mês. */
    period: text("period").$type<TargetPeriod>().notNull().default("week"),
    /** Dias fixos (0 = domingo … 6 = sábado). Vazio = sem dia fixo: o promotor escolhe (só a quantidade). */
    weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("visit_targets_uq").on(t.promoterId, t.storeId, t.brandId),
    index("visit_targets_agency_idx").on(t.agencyId),
    check("visit_targets_per_week_ck", sql`${t.perWeek} between 1 and 31`),
    check("visit_targets_period_ck", sql`${t.period} in ('week','fortnight','month')`),
  ],
);

// ───────────────────────────── Roteiros e programação ─────────────────────────────

/** Roteiro = modelo reutilizável (lojas + marcas em ordem). Gera programações diárias. */
export const routes = pgTable(
  "routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    name: text("name").notNull(),
    region: text("region"),
    promoterId: uuid("promoter_id").references(() => users.id),
    /** Dias da semana (0 = domingo … 6 = sábado). */
    weekdays: jsonb("weekdays").$type<number[]>().notNull().default([]),
    status: text("status").$type<"active" | "inactive">().notNull().default("active"),
    notes: text("notes"),
    ...timestamps,
    ...authorship,
  },
  (t) => [index("routes_agency_idx").on(t.agencyId)],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id").notNull().references(() => routes.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    seq: integer("seq").notNull().default(0),
    plannedStart: text("planned_start"),
    brandIds: jsonb("brand_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [index("route_stops_route_idx").on(t.routeId), uniqueIndex("route_stops_uq").on(t.routeId, t.storeId)],
);

/** Programação: um promotor, uma loja, um dia, com as marcas a atender. */
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    promoterId: uuid("promoter_id").notNull().references(() => users.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    date: date("date").notNull(),
    seq: integer("seq").notNull().default(0),
    /** HH:MM no fuso de São Paulo; opcional (freelancer sem horário). */
    plannedStart: text("planned_start"),
    plannedEnd: text("planned_end"),
    routeId: uuid("route_id").references(() => routes.id),
    status: text("status").$type<"active" | "cancelled">().notNull().default("active"),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("schedules_agency_date_idx").on(t.agencyId, t.date),
    index("schedules_promoter_date_idx").on(t.promoterId, t.date),
    uniqueIndex("schedules_active_uq").on(t.promoterId, t.date, t.storeId).where(sql`${t.status} = 'active'`),
    check("schedules_time_ck", sql`(${t.plannedStart} is null or ${t.plannedStart} ~ '^[0-2][0-9]:[0-5][0-9]$')`),
  ],
);

export const scheduleBrands = pgTable(
  "schedule_brands",
  {
    scheduleId: uuid("schedule_id").notNull().references(() => schedules.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
  },
  (t) => [primaryKey({ columns: [t.scheduleId, t.brandId] }), index("schedule_brands_brand_idx").on(t.brandId)],
);

// ───────────────────────────── Execução em loja ─────────────────────────────

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    promoterId: uuid("promoter_id").notNull().references(() => users.id),
    storeId: uuid("store_id").notNull().references(() => stores.id),
    scheduleId: uuid("schedule_id").references(() => schedules.id),
    visitDate: date("visit_date").notNull(),
    status: text("status").$type<VisitStatus>().notNull().default("in_progress"),
    origin: text("origin").$type<VisitOrigin>().notNull().default("scheduled"),
    extraReason: text("extra_reason"),
    /** Justificativa ao encerrar com marca prevista não concluída. */
    closeReason: text("close_reason"),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    accuracyM: doublePrecision("accuracy_m"),
    geoStatus: text("geo_status").$type<"captured" | "denied" | "unavailable" | "disabled">(),
    notes: text("notes"),
    /** Última vez que o servidor recebeu dados desta visita. */
    syncedAt: ts("synced_at").notNull().defaultNow(),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("visits_agency_date_idx").on(t.agencyId, t.visitDate),
    index("visits_promoter_date_idx").on(t.promoterId, t.visitDate),
    index("visits_store_date_idx").on(t.storeId, t.visitDate),
    // Uma programação gera no máximo uma visita válida.
    uniqueIndex("visits_schedule_uq").on(t.scheduleId).where(sql`${t.scheduleId} is not null and ${t.status} <> 'cancelled'`),
    // Um promotor só tem uma visita aberta por vez.
    uniqueIndex("visits_one_open_uq").on(t.promoterId).where(sql`${t.status} = 'in_progress'`),
    check("visits_status_ck", sql`${t.status} in ('in_progress','completed','closed_incomplete','cancelled')`),
    check("visits_close_reason_ck", sql`${t.status} <> 'closed_incomplete' or length(coalesce(${t.closeReason}, '')) >= 5`),
    check("visits_extra_ck", sql`${t.origin} <> 'extra' or length(coalesce(${t.extraReason}, '')) >= 5`),
    check("visits_finish_ck", sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`),
  ],
);

export const attendances = pgTable(
  "attendances",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    brandId: uuid("brand_id").notNull().references(() => brands.id),
    status: text("status").$type<AttendanceStatus>().notNull().default("in_progress"),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    /** Atividades da execução marcadas como feitas. */
    activitiesDone: jsonb("activities_done").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    /** Exceção justificada: itens obrigatórios dispensados. */
    exceptionItems: jsonb("exception_items").$type<ExceptionItem[]>().notNull().default([]),
    exceptionReason: text("exception_reason").$type<ExceptionReason>(),
    exceptionNote: text("exception_note"),
    cancelReason: text("cancel_reason"),
    reviewStatus: text("review_status").$type<ReviewStatus>().notNull().default("none"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: ts("reviewed_at"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("attendances_visit_brand_uq").on(t.visitId, t.brandId),
    index("attendances_agency_idx").on(t.agencyId, t.status),
    index("attendances_brand_idx").on(t.brandId),
    check("attendances_status_ck", sql`${t.status} in ('in_progress','completed','correction_requested','cancelled')`),
    check("attendances_finish_ck", sql`${t.finishedAt} is null or ${t.finishedAt} >= ${t.startedAt}`),
    check(
      "attendances_exception_ck",
      sql`jsonb_array_length(${t.exceptionItems}) = 0 or (${t.exceptionReason} is not null and length(coalesce(${t.exceptionNote}, '')) >= 5)`,
    ),
    check("attendances_cancel_ck", sql`${t.status} <> 'cancelled' or length(coalesce(${t.cancelReason}, '')) >= 5`),
  ],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    kind: text("kind").$type<PhotoKind>().notNull(),
    ruptureId: uuid("rupture_id"),
    occurrenceId: uuid("occurrence_id"),
    validityId: uuid("validity_id"),
    damageId: uuid("damage_id"),
    source: text("source").$type<PhotoSource>().notNull().default("camera"),
    /** Momento da captura no aparelho. */
    takenAt: ts("taken_at").notNull(),
    /** null = declarada pelo aparelho, arquivo ainda não chegou ao servidor. */
    uploadedAt: ts("uploaded_at"),
    storageKey: text("storage_key"),
    thumbKey: text("thumb_key"),
    contentType: text("content_type"),
    bytes: integer("bytes"),
    width: integer("width"),
    height: integer("height"),
    /** Substituição/exclusão é lógica: o arquivo original é preservado. */
    deletedAt: ts("deleted_at"),
    deletedBy: uuid("deleted_by"),
    ...timestamps,
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("photos_attendance_idx").on(t.attendanceId, t.kind),
    index("photos_agency_created_idx").on(t.agencyId, t.createdAt),
    check("photos_kind_ck", sql`${t.kind} in ('before','after','rupture','occurrence','validity','damage')`),
    check("photos_upload_ck", sql`${t.uploadedAt} is null or ${t.storageKey} is not null`),
  ],
);

export const stockEntries = pgTable(
  "stock_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    state: text("state").$type<StockState>().notNull(),
    quantity: integer("quantity"),
    unit: text("unit").$type<Unit>().notNull(),
    note: text("note"),
    recordedAt: ts("recorded_at").notNull(),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    uniqueIndex("stock_attendance_product_uq").on(t.attendanceId, t.productId),
    index("stock_product_idx").on(t.productId, t.recordedAt),
    check("stock_state_ck", sql`${t.state} in (${inList(["quantity", "zero", "not_found", "not_applicable"])})`),
    // Coerência: só "quantity" tem número positivo; "zero" é exatamente 0; os demais não têm número.
    check(
      "stock_quantity_ck",
      sql`(${t.state} = 'quantity' and ${t.quantity} > 0) or (${t.state} = 'zero' and ${t.quantity} = 0) or (${t.state} in ('not_found','not_applicable') and ${t.quantity} is null)`,
    ),
  ],
);

/** Produto encontrado na loja mas ausente do cadastro — vai para a fila do gestor. */
export const unregisteredProducts = pgTable(
  "unregistered_products",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    description: text("description").notNull(),
    quantity: integer("quantity"),
    note: text("note"),
    deletedAt: ts("deleted_at"),
    ...timestamps,
    createdBy: uuid("created_by"),
  },
  (t) => [index("unregistered_attendance_idx").on(t.attendanceId)],
);

export const ruptures = pgTable(
  "ruptures",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    situation: text("situation").$type<RuptureSituation>().notNull().default("total"),
    knownStock: integer("known_stock"),
    note: text("note"),
    /** Criada a partir da sugestão "estoque zero → ruptura?" (validada pelo promotor). */
    fromStockSuggestion: boolean("from_stock_suggestion").notNull().default(false),
    status: text("status").$type<RuptureStatus>().notNull().default("new"),
    resolutionAction: text("resolution_action"),
    resolvedAt: ts("resolved_at"),
    recordedAt: ts("recorded_at").notNull(),
    deletedAt: ts("deleted_at"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    // Um produto tem no máximo uma ruptura por atendimento (evita duplicidade).
    uniqueIndex("ruptures_attendance_product_uq").on(t.attendanceId, t.productId).where(sql`${t.deletedAt} is null`),
    index("ruptures_agency_status_idx").on(t.agencyId, t.status),
    index("ruptures_product_idx").on(t.productId),
    check(
      "ruptures_situation_ck",
      sql`${t.situation} in (${inList(["total", "shelf_empty", "backroom_empty", "missing_display", "registered_not_found", "unavailable_other", "unconfirmed"])})`,
    ),
    check("ruptures_status_ck", sql`${t.status} in (${inList(["new", "analysis", "treatment", "resolved", "not_confirmed", "closed"])})`),
    check("ruptures_known_stock_ck", sql`${t.knownStock} is null or ${t.knownStock} >= 0`),
  ],
);

/** Histórico de status da ruptura: quem, quando, de → para, ação. */
export const ruptureEvents = pgTable(
  "rupture_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruptureId: uuid("rupture_id").notNull().references(() => ruptures.id),
    fromStatus: text("from_status").$type<RuptureStatus>(),
    toStatus: text("to_status").$type<RuptureStatus>().notNull(),
    action: text("action"),
    userId: uuid("user_id").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("rupture_events_rupture_idx").on(t.ruptureId, t.createdAt)],
);

export const occurrences = pgTable(
  "occurrences",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    category: text("category").$type<OccurrenceCategory>().notNull(),
    note: text("note"),
    status: text("status").$type<OccurrenceStatus>().notNull().default("open"),
    action: text("action"),
    handledBy: uuid("handled_by"),
    handledAt: ts("handled_at"),
    recordedAt: ts("recorded_at").notNull(),
    deletedAt: ts("deleted_at"),
    ...timestamps,
    createdBy: uuid("created_by"),
  },
  (t) => [index("occurrences_attendance_idx").on(t.attendanceId), index("occurrences_agency_status_idx").on(t.agencyId, t.status)],
);

/**
 * Validade (modo SUINCO): produto com data de vencimento encontrado na área de
 * vendas ou no estoque. Dias para vencer e severidade são calculados no
 * servidor a partir da DATA DA VISITA e das faixas da agência no momento do
 * registro (o histórico guarda a classificação do dia).
 */
export const validities = pgTable(
  "validities",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    location: text("location").$type<ValidityLocation>().notNull().default("sales_floor"),
    quantity: integer("quantity").notNull(),
    unit: text("unit").$type<Unit>().notNull().default("un"),
    expiryDate: date("expiry_date").notNull(),
    daysToExpiry: integer("days_to_expiry").notNull(),
    severity: text("severity").$type<Severity>().notNull(),
    lot: text("lot"),
    price: numeric("price", { precision: 10, scale: 2 }),
    note: text("note"),
    recordedAt: ts("recorded_at").notNull(),
    deletedAt: ts("deleted_at"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("validities_attendance_idx").on(t.attendanceId),
    index("validities_agency_severity_idx").on(t.agencyId, t.severity),
    index("validities_product_idx").on(t.productId),
    check("validities_location_ck", sql`${t.location} in ('sales_floor','stock')`),
    check("validities_quantity_ck", sql`${t.quantity} > 0`),
    check("validities_severity_ck", sql`${t.severity} in ('expired','critical','high','attention','monitor','normal')`),
  ],
);

/** Avaria (modo SUINCO): tipo, quantidade, validade e lote opcionais; foto obrigatória. */
export const damages = pgTable(
  "damages",
  {
    id: uuid("id").primaryKey(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    productId: uuid("product_id").notNull().references(() => products.id),
    kind: text("kind").$type<DamageKind>().notNull(),
    quantity: integer("quantity").notNull(),
    unit: text("unit").$type<Unit>().notNull().default("un"),
    expiryDate: date("expiry_date"),
    lot: text("lot"),
    note: text("note"),
    recordedAt: ts("recorded_at").notNull(),
    deletedAt: ts("deleted_at"),
    ...timestamps,
    ...authorship,
  },
  (t) => [
    index("damages_attendance_idx").on(t.attendanceId),
    index("damages_agency_idx").on(t.agencyId, t.createdAt),
    check("damages_quantity_ck", sql`${t.quantity} > 0`),
    check("damages_kind_ck", sql`${t.kind} in ('damaged_package','violated','no_vacuum','strange_color','liquid','unfit','other')`),
  ],
);

/**
 * Alerta de validade crítica enviado no WhatsApp (um por atendimento). O id
 * aleatório é também o link curto do PDF (/r/<id>), que abre sem login por
 * um tempo limitado.
 */
export const whatsappAlerts = pgTable(
  "whatsapp_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    items: integer("items").notNull(),
    sentAt: ts("sent_at"),
    error: text("error"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("whatsapp_alerts_attendance_uq").on(t.attendanceId)],
);

// ───────────────────────────── Acompanhamento ─────────────────────────────

export const correctionRequests = pgTable(
  "correction_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    attendanceId: uuid("attendance_id").notNull().references(() => attendances.id),
    reason: text("reason").notNull(),
    status: text("status").$type<CorrectionStatus>().notNull().default("open"),
    requestedBy: uuid("requested_by").notNull(),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    answeredAt: ts("answered_at"),
    answeredBy: uuid("answered_by"),
    /** Estado do atendimento no momento do pedido — o original nunca se perde. */
    snapshot: jsonb("snapshot"),
  },
  (t) => [
    index("corrections_attendance_idx").on(t.attendanceId),
    uniqueIndex("corrections_one_open_uq").on(t.attendanceId).where(sql`${t.status} = 'open'`),
  ],
);

/**
 * Análise de uma pendência calculada (ex.: "missing_after:<atendimento>").
 * "analyzed" = o gestor viu e registrou a ação, a pendência continua aberta.
 * "concluded" = decisão explícita do gestor de encerrar o acompanhamento.
 */
export const issueReviews = pgTable(
  "issue_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull().references(() => agencies.id),
    issueKey: text("issue_key").notNull(),
    status: text("status").$type<IssueReviewStatus>().notNull(),
    action: text("action").notNull(),
    userId: uuid("user_id").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("issue_reviews_key_uq").on(t.agencyId, t.issueKey)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id").notNull(),
    userId: uuid("user_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_agency_created_idx").on(t.agencyId, t.createdAt), index("audit_entity_idx").on(t.entity, t.entityId)],
);
