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
    checked: boolean("checked").notNull().default(false),
    checkedBy: uuid("checked_by").references(() => users.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
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

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});
