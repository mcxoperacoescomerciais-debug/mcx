/**
 * Biblioteca de modelos de checklist. Editar um modelo cria uma versão nova;
 * as demandas antigas guardam a versão que usaram. "Faltou algo" registra o
 * item esquecido e, com um clique do gestor, ele entra na próxima versão.
 */
import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { getDb, schema as s, type DB } from "./db";
import type { Actor, Result } from "./demands";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v: string | null | undefined) => (v ?? "").trim() || null;
type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export interface TemplateItemInput {
  section?: string | null;
  text: string;
  quantity?: number | null;
  unit?: string | null;
  perAction?: boolean;
  required?: boolean;
  note?: string | null;
  toValidate?: boolean;
  stockItemId?: string | null;
}

export interface TemplateInput {
  name: string;
  clientId?: string | null;
  categoryId?: string | null;
  typeId?: string | null;
  doubleCheck?: boolean;
  status?: "draft" | "published" | "archived";
  items: TemplateItemInput[];
}

/** Quantidade ao aplicar: por ação × nº de ações, ou a quantidade fixa. */
export function appliedQuantity(item: { quantity: number | null; perAction: boolean }, actions: number): number | null {
  if (item.quantity === null) return null;
  return item.perAction ? item.quantity * Math.max(1, actions) : item.quantity;
}

function checkItems(items: TemplateItemInput[]): string | null {
  if (items.length > 200) return "Modelo com itens demais (máximo 200).";
  for (const i of items) {
    if (!i.text?.trim()) return "Há item sem descrição.";
    const q = i.quantity ?? null;
    if (q !== null && (!Number.isInteger(q) || q < 0 || q > 1_000_000)) return `Quantidade inválida em "${i.text}".`;
  }
  return null;
}

async function insertItems(tx: Tx | DB, templateId: string, version: number, items: TemplateItemInput[]) {
  if (!items.length) return;
  await tx.insert(s.checklistTemplateItems).values(
    items.map((i, position) => ({
      templateId,
      version,
      section: clean(i.section),
      text: i.text.trim(),
      quantity: i.quantity ?? null,
      unit: clean(i.unit),
      perAction: !!i.perAction,
      required: !!i.required,
      note: clean(i.note),
      toValidate: !!i.toValidate,
      stockItemId: i.stockItemId && UUID.test(i.stockItemId) ? i.stockItemId : null,
      position,
    })),
  );
}

/** Publicados para todos; rascunhos e arquivados só para quem gerencia modelos. */
export async function listTemplates(actor: Actor) {
  const db = await getDb();
  const manage = can(actor.role, "template.manage");
  return db
    .select({
      id: s.checklistTemplates.id,
      name: s.checklistTemplates.name,
      status: s.checklistTemplates.status,
      version: s.checklistTemplates.version,
      doubleCheck: s.checklistTemplates.doubleCheck,
      clientId: s.checklistTemplates.clientId,
      clientName: s.clients.name,
      items: sql<number>`(select count(*)::int from ${s.checklistTemplateItems} where ${s.checklistTemplateItems.templateId} = ${s.checklistTemplates.id} and ${s.checklistTemplateItems.version} = ${s.checklistTemplates.version})`,
      uses: sql<number>`(select count(*)::int from ${s.demands} where ${s.demands.templateId} = ${s.checklistTemplates.id})`,
      misses: sql<number>`(select count(*)::int from ${s.checklistMisses} where ${s.checklistMisses.templateId} = ${s.checklistTemplates.id})`,
    })
    .from(s.checklistTemplates)
    .leftJoin(s.clients, eq(s.clients.id, s.checklistTemplates.clientId))
    .where(manage ? undefined : eq(s.checklistTemplates.status, "published"))
    .orderBy(asc(s.checklistTemplates.name));
}

export async function getTemplate(actor: Actor, id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [tpl] = await db.select().from(s.checklistTemplates).where(eq(s.checklistTemplates.id, id));
  if (!tpl || (tpl.status !== "published" && !can(actor.role, "template.manage"))) return null;
  const [items, uses, misses] = await Promise.all([
    db.select().from(s.checklistTemplateItems).where(and(eq(s.checklistTemplateItems.templateId, id), eq(s.checklistTemplateItems.version, tpl.version))).orderBy(asc(s.checklistTemplateItems.position)),
    db
      .select({ id: s.demands.id, number: s.demands.number, title: s.demands.title, version: s.demands.templateVersion, actions: s.demands.actionsCount, createdAt: s.demands.createdAt, assigneeName: s.users.name })
      .from(s.demands)
      .leftJoin(s.users, eq(s.users.id, s.demands.assigneeId))
      .where(and(eq(s.demands.templateId, id), isNull(s.demands.deletedAt)))
      .orderBy(desc(s.demands.createdAt))
      .limit(50),
    db.select().from(s.checklistMisses).where(eq(s.checklistMisses.templateId, id)).orderBy(desc(s.checklistMisses.createdAt)),
  ]);
  return { ...tpl, items, uses, misses };
}

export async function saveTemplate(actor: Actor, id: string | null, input: TemplateInput): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "template.manage")) return fail("Sem permissão.");
  const name = input.name.trim();
  if (name.length < 3) return fail("Informe o nome do modelo.");
  const itemError = checkItems(input.items);
  if (itemError) return fail(itemError);
  const status = input.status ?? "draft";
  if (status === "published" && input.items.some((i) => i.toValidate)) return fail("Há itens marcados como “a validar”. Confirme ou remova cada um antes de publicar.");
  if (status === "published" && !input.items.length) return fail("Um modelo publicado precisa de pelo menos um item.");
  const base = { name, clientId: input.clientId || null, categoryId: input.categoryId || null, typeId: input.typeId || null, doubleCheck: !!input.doubleCheck, status, updatedAt: new Date() };
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (!id) {
      const [row] = await tx.insert(s.checklistTemplates).values({ ...base, version: 1, createdBy: actor.id }).returning({ id: s.checklistTemplates.id });
      await insertItems(tx, row.id, 1, input.items);
      await audit(actor.id, "checklist_template", row.id, "created", { after: { name, status } }, tx);
      return { ok: true as const, id: row.id, message: "Modelo criado." };
    }
    if (!UUID.test(id)) return fail("Modelo não encontrado.");
    const [current] = await tx.select().from(s.checklistTemplates).where(eq(s.checklistTemplates.id, id));
    if (!current) return fail("Modelo não encontrado.");
    const version = current.version + 1;
    await tx.update(s.checklistTemplates).set({ ...base, version }).where(eq(s.checklistTemplates.id, id));
    await insertItems(tx, id, version, input.items);
    await audit(actor.id, "checklist_template", id, "updated", { before: { version: current.version, status: current.status }, after: { version, status } }, tx);
    return { ok: true as const, id, message: `Modelo salvo (versão ${version}).` };
  });
}

export async function duplicateTemplate(actor: Actor, id: string): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "template.manage")) return fail("Sem permissão.");
  const tpl = await getTemplate(actor, id);
  if (!tpl) return fail("Modelo não encontrado.");
  return saveTemplate(actor, null, { name: `${tpl.name} (cópia)`, clientId: tpl.clientId, categoryId: tpl.categoryId, typeId: tpl.typeId, doubleCheck: tpl.doubleCheck, status: "draft", items: tpl.items });
}

async function visibleDemand(db: DB | Tx, actor: Actor, demandId: string) {
  if (!UUID.test(demandId)) return null;
  const [d] = await db.select().from(s.demands).where(and(eq(s.demands.id, demandId), isNull(s.demands.deletedAt)));
  if (!d) return null;
  if (can(actor.role, "demand.viewAll") || d.assigneeId === actor.id || d.createdBy === actor.id) return d;
  const [share] = await db.select({ u: s.demandShares.userId }).from(s.demandShares).where(and(eq(s.demandShares.demandId, demandId), eq(s.demandShares.userId, actor.id)));
  return share ? d : null;
}

/** Copia os itens do modelo (versão atual) para a demanda. Mexer depois na demanda não altera o modelo. */
export async function copyTemplateInto(tx: Tx | DB, demandId: string, templateId: string, actions: number): Promise<{ version: number; count: number } | null> {
  const [tpl] = await tx.select().from(s.checklistTemplates).where(eq(s.checklistTemplates.id, templateId));
  if (!tpl || tpl.status !== "published") return null;
  const items = await tx.select().from(s.checklistTemplateItems).where(and(eq(s.checklistTemplateItems.templateId, templateId), eq(s.checklistTemplateItems.version, tpl.version))).orderBy(asc(s.checklistTemplateItems.position));
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.demandChecklistItems).where(eq(s.demandChecklistItems.demandId, demandId));
  if (items.length) {
    await tx.insert(s.demandChecklistItems).values(
      items.map((i, idx) => ({ demandId, text: i.text, position: n + idx, section: i.section, quantity: appliedQuantity(i, actions), unit: i.unit, required: i.required, note: i.note, stockItemId: i.stockItemId })),
    );
  }
  await tx.update(s.demands).set({ templateId, templateVersion: tpl.version, actionsCount: Math.max(1, actions), updatedAt: new Date() }).where(eq(s.demands.id, demandId));
  return { version: tpl.version, count: items.length };
}

export async function applyTemplate(actor: Actor, demandId: string, templateId: string, actions: number): Promise<Result> {
  if (!UUID.test(templateId)) return fail("Escolha o modelo.");
  if (!Number.isInteger(actions) || actions < 1 || actions > 500) return fail("Informe o número de ações (1 ou mais).");
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (!(await visibleDemand(tx, actor, demandId))) return fail("Demanda não encontrada.");
    const applied = await copyTemplateInto(tx, demandId, templateId, actions);
    if (!applied) return fail("Modelo não encontrado ou ainda não publicado.");
    await audit(actor.id, "demand", demandId, "template_applied", { after: { templateId, version: applied.version, actions } }, tx);
    return { ok: true as const, message: `${applied.count} itens adicionados do modelo.` };
  });
}

/** Transforma o checklist de uma demanda num modelo novo (rascunho). */
export async function saveAsTemplate(actor: Actor, demandId: string, name: string): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "template.manage")) return fail("Só o gestor cria modelos.");
  const db = await getDb();
  const d = await visibleDemand(db, actor, demandId);
  if (!d) return fail("Demanda não encontrada.");
  const items = await db.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.demandId, demandId)).orderBy(asc(s.demandChecklistItems.position));
  if (!items.length) return fail("Esta demanda não tem checklist.");
  return saveTemplate(actor, null, { name, clientId: d.clientId, categoryId: d.categoryId, typeId: d.typeId, status: "draft", items: items.map((i) => ({ section: i.section, text: i.text, quantity: i.quantity, unit: i.unit, required: i.required, note: i.note, stockItemId: i.stockItemId })) });
}

async function visibleItem(db: DB, actor: Actor, itemId: string) {
  if (!UUID.test(itemId)) return null;
  const [item] = await db.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.id, itemId));
  return item && (await visibleDemand(db, actor, item.demandId)) ? item : null;
}

/** "Não se aplica", com motivo (libera a conclusão sem marcar o item). */
export async function setItemNotApplicable(actor: Actor, itemId: string, reason: string | null): Promise<Result> {
  const db = await getDb();
  const item = await visibleItem(db, actor, itemId);
  if (!item) return fail("Item não encontrado.");
  const why = clean(reason);
  if (reason !== null && (!why || why.length < 3)) return fail("Informe o motivo de não se aplicar.");
  await db
    .update(s.demandChecklistItems)
    .set(why ? { notApplicable: true, naReason: why, checked: false, checkedBy: null, checkedAt: null, verified: false, verifiedBy: null, verifiedAt: null } : { notApplicable: false, naReason: null })
    .where(eq(s.demandChecklistItems.id, itemId));
  return { ok: true };
}

/** Conferência dupla: "Conferido" só depois de "Separado". */
export async function verifyItem(actor: Actor, itemId: string, verified: boolean): Promise<Result> {
  const db = await getDb();
  const item = await visibleItem(db, actor, itemId);
  if (!item) return fail("Item não encontrado.");
  if (verified && !item.checked) return fail("Marque o item como separado antes de conferir.");
  await db.update(s.demandChecklistItems).set({ verified, verifiedBy: verified ? actor.id : null, verifiedAt: verified ? new Date() : null }).where(eq(s.demandChecklistItems.id, itemId));
  return { ok: true };
}

/** "Faltou algo": registra o que foi esquecido numa demanda concluída. */
export async function reportMiss(actor: Actor, demandId: string, input: { item: string; quantity?: string | null; impact?: string | null }): Promise<Result> {
  const item = input.item.trim();
  if (item.length < 2) return fail("Informe o item que faltou.");
  const db = await getDb();
  const d = await visibleDemand(db, actor, demandId);
  if (!d) return fail("Demanda não encontrada.");
  if (d.status !== "done") return fail("“Faltou algo” é registrado depois de concluir a demanda.");
  await db.insert(s.checklistMisses).values({ demandId, templateId: d.templateId, item, quantity: clean(input.quantity), impact: clean(input.impact), createdBy: actor.id });
  return { ok: true, message: d.templateId ? "Registrado. O gestor pode adicionar este item ao modelo." : "Registrado." };
}

/** Um clique: o item que faltou entra na próxima versão do modelo. */
export async function addMissToTemplate(actor: Actor, missId: string): Promise<Result> {
  if (!can(actor.role, "template.manage")) return fail("Sem permissão.");
  if (!UUID.test(missId)) return fail("Registro não encontrado.");
  const db = await getDb();
  const [miss] = await db.select().from(s.checklistMisses).where(eq(s.checklistMisses.id, missId));
  if (!miss?.templateId) return fail("Este registro não está ligado a um modelo.");
  if (miss.addedToTemplate) return { ok: true, message: "Este item já foi adicionado ao modelo." };
  const tpl = await getTemplate(actor, miss.templateId);
  if (!tpl) return fail("Modelo não encontrado.");
  const saved = await saveTemplate(actor, tpl.id, {
    name: tpl.name,
    clientId: tpl.clientId,
    categoryId: tpl.categoryId,
    typeId: tpl.typeId,
    doubleCheck: tpl.doubleCheck,
    status: tpl.status,
    items: [...tpl.items, { text: miss.item, note: miss.quantity ? `Faltou em uma saída (${miss.quantity}).` : "Faltou em uma saída.", required: true }],
  });
  if (!saved.ok) return saved;
  await db.update(s.checklistMisses).set({ addedToTemplate: true }).where(eq(s.checklistMisses.id, missId));
  return { ok: true, message: `“${miss.item}” entrou no modelo (${saved.message}).` };
}

/** Itens que mais faltaram, por modelo. */
export async function missesReport(actor: Actor) {
  if (!can(actor.role, "template.manage")) return [];
  const db = await getDb();
  return db
    .select({ templateName: s.checklistTemplates.name, clientName: s.clients.name, item: sql<string>`lower(${s.checklistMisses.item})`, n: sql<number>`count(*)::int` })
    .from(s.checklistMisses)
    .leftJoin(s.checklistTemplates, eq(s.checklistTemplates.id, s.checklistMisses.templateId))
    .innerJoin(s.demands, eq(s.demands.id, s.checklistMisses.demandId))
    .innerJoin(s.clients, eq(s.clients.id, s.demands.clientId))
    .groupBy(s.checklistTemplates.name, s.clients.name, sql`lower(${s.checklistMisses.item})`)
    .orderBy(desc(sql`count(*)`))
    .limit(30);
}

export async function demandMisses(demandId: string) {
  const db = await getDb();
  return db.select().from(s.checklistMisses).where(eq(s.checklistMisses.demandId, demandId)).orderBy(asc(s.checklistMisses.createdAt));
}
