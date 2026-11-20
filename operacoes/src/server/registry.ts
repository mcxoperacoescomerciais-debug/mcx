/** Cadastros: contratantes (com contatos e marcas), categorias e usuários. */
import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { CLIENT_KINDS, ROLES, type ClientKind, type Role } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { hashPassword } from "./auth";
import { getDb, schema as s } from "./db";
import type { Actor, Result } from "./demands";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
const UUID = /^[0-9a-f-]{36}$/i;

// ---------- Contratantes ----------

export async function listClients(actor: Actor) {
  if (!can(actor.role, "client.view")) return [];
  const db = await getDb();
  return db
    .select({
      id: s.clients.id,
      name: s.clients.name,
      kind: s.clients.kind,
      status: s.clients.status,
      open: sql<number>`(select count(*)::int from ${s.demands} where ${s.demands.clientId} = ${s.clients.id} and ${s.demands.deletedAt} is null and ${s.demands.status} in ('todo','doing','waiting','approval'))`,
      brands: sql<string | null>`(select string_agg(${s.clientBrands.name}, ', ' order by ${s.clientBrands.name}) from ${s.clientBrands} where ${s.clientBrands.clientId} = ${s.clients.id})`,
    })
    .from(s.clients)
    .where(isNull(s.clients.deletedAt))
    .orderBy(sql`case when ${s.clients.kind} = 'internal' then 1 else 0 end`, asc(s.clients.name));
}

export async function getClient(actor: Actor, id: string) {
  if (!can(actor.role, "client.view") || !UUID.test(id)) return null;
  const db = await getDb();
  const [client] = await db.select().from(s.clients).where(and(eq(s.clients.id, id), isNull(s.clients.deletedAt)));
  if (!client) return null;
  const [contacts, brands] = await Promise.all([
    db.select().from(s.clientContacts).where(eq(s.clientContacts.clientId, id)).orderBy(asc(s.clientContacts.createdAt)),
    db.select().from(s.clientBrands).where(eq(s.clientBrands.clientId, id)).orderBy(asc(s.clientBrands.name)),
  ]);
  return { ...client, monthlyValueCents: can(actor.role, "cost.view") ? client.monthlyValueCents : null, contacts, brands };
}

export interface ClientInput {
  name: string;
  kind: ClientKind;
  document?: string | null;
  status?: "active" | "inactive";
  notes?: string | null;
  /** Valor mensal do contrato em centavos (só dono e gestor veem e alteram). */
  monthlyValueCents?: number | null;
}

export async function saveClient(actor: Actor, id: string | null, input: ClientInput): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "client.edit")) return fail("Sem permissão.");
  const name = input.name.trim();
  if (name.length < 2) return fail("Informe o nome do contratante.");
  if (!CLIENT_KINDS.includes(input.kind) || input.kind === "internal") return fail("Escolha o tipo: agência ou representante.");
  const db = await getDb();
  const value = input.monthlyValueCents;
  if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0 || value > 100_000_000)) return fail("Valor mensal inválido.");
  const values = { name, kind: input.kind, document: clean(input.document), status: input.status === "inactive" ? ("inactive" as const) : ("active" as const), notes: clean(input.notes), ...(value !== undefined && can(actor.role, "cost.view") ? { monthlyValueCents: value } : {}), updatedAt: new Date() };
  if (!id) {
    const [row] = await db.insert(s.clients).values(values).returning({ id: s.clients.id });
    await audit(actor.id, "client", row.id, "created", { after: values });
    return { ok: true, id: row.id, message: "Contratante criado." };
  }
  const [current] = await db.select().from(s.clients).where(and(eq(s.clients.id, id), isNull(s.clients.deletedAt)));
  if (!current) return fail("Contratante não encontrado.");
  if (current.kind === "internal") return fail("O contratante Interno MCX não pode ser alterado.");
  await db.update(s.clients).set(values).where(eq(s.clients.id, id));
  await audit(actor.id, "client", id, "updated", { before: { name: current.name, kind: current.kind, status: current.status }, after: values });
  return { ok: true, id, message: "Contratante atualizado." };
}

async function editableClient(actor: Actor, clientId: string) {
  if (!can(actor.role, "client.edit") || !UUID.test(clientId)) return null;
  const db = await getDb();
  const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.id, clientId), isNull(s.clients.deletedAt)));
  return c ?? null;
}

export async function addContact(actor: Actor, clientId: string, input: { name: string; role?: string; whatsapp?: string; email?: string }): Promise<Result> {
  if (!(await editableClient(actor, clientId))) return fail("Sem permissão.");
  if (input.name.trim().length < 2) return fail("Informe o nome do contato.");
  const db = await getDb();
  await db.insert(s.clientContacts).values({ clientId, name: input.name.trim(), role: clean(input.role), whatsapp: clean(input.whatsapp), email: clean(input.email) });
  return { ok: true, message: "Contato adicionado." };
}

export async function removeContact(actor: Actor, contactId: string): Promise<Result> {
  if (!can(actor.role, "client.edit") || !UUID.test(contactId)) return fail("Sem permissão.");
  const db = await getDb();
  await db.delete(s.clientContacts).where(eq(s.clientContacts.id, contactId));
  return { ok: true, message: "Contato removido." };
}

export async function addBrand(actor: Actor, clientId: string, name: string): Promise<Result> {
  if (!(await editableClient(actor, clientId))) return fail("Sem permissão.");
  if (name.trim().length < 2) return fail("Informe o nome da marca.");
  const db = await getDb();
  await db.insert(s.clientBrands).values({ clientId, name: name.trim() });
  return { ok: true, message: "Marca adicionada." };
}

export async function removeBrand(actor: Actor, brandId: string): Promise<Result> {
  if (!can(actor.role, "client.edit") || !UUID.test(brandId)) return fail("Sem permissão.");
  const db = await getDb();
  await db.delete(s.clientBrands).where(eq(s.clientBrands.id, brandId));
  return { ok: true, message: "Marca removida." };
}

// ---------- Categorias ----------

export async function listCategories() {
  const db = await getDb();
  return db.select().from(s.categories).orderBy(asc(s.categories.position), asc(s.categories.name));
}

export async function saveCategory(actor: Actor, id: string | null, input: { name: string; active?: boolean }): Promise<Result> {
  if (!can(actor.role, "category.edit")) return fail("Sem permissão.");
  const name = input.name.trim();
  if (name.length < 2) return fail("Informe o nome da categoria.");
  const db = await getDb();
  if (!id) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.categories);
    const [row] = await db.insert(s.categories).values({ name, position: n }).returning({ id: s.categories.id });
    await audit(actor.id, "category", row.id, "created", { after: { name } });
    return { ok: true, message: "Categoria criada." };
  }
  if (!UUID.test(id)) return fail("Categoria não encontrada.");
  await db.update(s.categories).set({ name, active: input.active ?? true }).where(eq(s.categories.id, id));
  await audit(actor.id, "category", id, "updated", { after: { name, active: input.active ?? true } });
  return { ok: true, message: "Categoria atualizada." };
}

// ---------- Tipos (subcategorias) ----------

export async function listTypes() {
  const db = await getDb();
  return db.select().from(s.demandTypes).orderBy(asc(s.demandTypes.name));
}

export async function saveType(actor: Actor, id: string | null, input: { categoryId?: string; name: string; active?: boolean }): Promise<Result> {
  if (!can(actor.role, "category.edit")) return fail("Sem permissão.");
  const name = input.name.trim();
  if (name.length < 2) return fail("Informe o nome do tipo.");
  const db = await getDb();
  if (!id) {
    if (!UUID.test(input.categoryId ?? "")) return fail("Escolha a categoria.");
    const [cat] = await db.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.id, input.categoryId!));
    if (!cat) return fail("Categoria não encontrada.");
    const [row] = await db.insert(s.demandTypes).values({ categoryId: cat.id, name }).returning({ id: s.demandTypes.id });
    await audit(actor.id, "demand_type", row.id, "created", { after: { name } });
    return { ok: true, message: "Tipo criado." };
  }
  if (!UUID.test(id)) return fail("Tipo não encontrado.");
  await db.update(s.demandTypes).set({ name, active: input.active ?? true }).where(eq(s.demandTypes.id, id));
  await audit(actor.id, "demand_type", id, "updated", { after: { name, active: input.active ?? true } });
  return { ok: true, message: "Tipo atualizado." };
}

// ---------- Usuários (só o dono) ----------

export async function listUsers(actor: Actor) {
  if (!can(actor.role, "user.manage")) return [];
  const db = await getDb();
  return db
    .select({ id: s.users.id, name: s.users.name, username: s.users.username, role: s.users.role, status: s.users.status, lastLoginAt: s.users.lastLoginAt, mustChangePassword: s.users.mustChangePassword, weeklyHours: s.users.weeklyHours, costPerHourCents: s.users.costPerHourCents })
    .from(s.users)
    .orderBy(asc(s.users.name));
}

export async function createUser(actor: Actor, input: { name: string; username: string; role: Role; password: string }): Promise<Result> {
  if (!can(actor.role, "user.manage")) return fail("Sem permissão.");
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  if (name.length < 2) return fail("Informe o nome.");
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return fail("Usuário: 3 a 30 letras minúsculas, números, ponto ou hífen.");
  if (!ROLES.includes(input.role)) return fail("Papel inválido.");
  if (input.password.length < 6) return fail("Senha inicial: pelo menos 6 caracteres (a pessoa troca no primeiro acesso).");
  const db = await getDb();
  const [taken] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.username, username));
  if (taken) return fail("Já existe alguém com esse usuário.");
  const [row] = await db.insert(s.users).values({ name, username, role: input.role, passwordHash: await hashPassword(input.password), mustChangePassword: true }).returning({ id: s.users.id });
  await audit(actor.id, "user", row.id, "created", { after: { name, username, role: input.role } });
  return { ok: true, message: `${name} cadastrado(a). A senha inicial deve ser trocada no primeiro acesso.` };
}

export async function updateUser(actor: Actor, id: string, input: { role?: Role; status?: "active" | "inactive"; resetPassword?: string; weeklyHours?: number; costPerHourCents?: number | null }): Promise<Result> {
  if (!can(actor.role, "user.manage") || !UUID.test(id)) return fail("Sem permissão.");
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, id));
  if (!user) return fail("Usuário não encontrado.");
  const set: Partial<typeof s.users.$inferInsert> = {};
  if (input.role && input.role !== user.role) {
    if (!ROLES.includes(input.role)) return fail("Papel inválido.");
    if (user.id === actor.id) return fail("Você não pode mudar o próprio papel.");
    set.role = input.role;
  }
  if (input.status && input.status !== user.status) {
    if (user.id === actor.id) return fail("Você não pode desativar a si mesmo.");
    set.status = input.status;
  }
  if (input.resetPassword) {
    if (input.resetPassword.length < 6) return fail("Senha: pelo menos 6 caracteres.");
    set.passwordHash = await hashPassword(input.resetPassword);
    set.mustChangePassword = true;
  }
  const access = Object.keys(set).length > 0;
  if (input.weeklyHours !== undefined && input.weeklyHours !== user.weeklyHours) {
    if (!Number.isInteger(input.weeklyHours) || input.weeklyHours < 1 || input.weeklyHours > 80) return fail("Horas por semana: 1 a 80.");
    set.weeklyHours = input.weeklyHours;
  }
  if (input.costPerHourCents !== undefined && input.costPerHourCents !== user.costPerHourCents) {
    const c = input.costPerHourCents;
    if (c !== null && (!Number.isInteger(c) || c < 0 || c > 10_000_000)) return fail("Custo/hora inválido.");
    set.costPerHourCents = c;
  }
  if (!Object.keys(set).length) return { ok: true, message: "Nada foi alterado." };
  // Mudança de acesso (papel, status, senha) derruba as sessões abertas da pessoa.
  if (access) set.sessionVersion = user.sessionVersion + 1;
  await db.update(s.users).set(set).where(eq(s.users.id, id));
  await audit(actor.id, "user", id, "updated", { after: { role: set.role, status: set.status, passwordReset: !!input.resetPassword } });
  return { ok: true, message: "Usuário atualizado." };
}
