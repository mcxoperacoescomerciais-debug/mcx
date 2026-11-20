/**
 * Demandas: o núcleo do MCX Operações. Toda função recebe quem está agindo e
 * confere a permissão aqui (não na tela). O perfil operacional só enxerga as
 * demandas em que é responsável, que criou ou que foram compartilhadas com ele.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { isIsoDate, todayIso } from "@/lib/dates";
import { isOpen, OPEN_STATUSES, ORIGINS, PRIORITIES, STATUS_LABEL, STATUSES, PRIORITY_LABEL, type Origin, type Priority, type Role, type Status } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { looksDuplicate } from "@/lib/similarity";
import { formatBr } from "@/lib/dates";
import { audit } from "./audit";
import { getDb, schema as s, type DB } from "./db";

export interface Actor {
  id: string;
  role: Role;
}

export type Result<T = object> = ({ ok: true; message?: string } & T) | { ok: false; error: string; duplicate?: { id: string; number: number; title: string } };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Filtro de visibilidade: undefined = vê tudo. */
function visible(actor: Actor): SQL | undefined {
  if (can(actor.role, "demand.viewAll")) return undefined;
  return or(
    eq(s.demands.assigneeId, actor.id),
    eq(s.demands.createdBy, actor.id),
    sql`exists (select 1 from ${s.demandShares} where ${s.demandShares.demandId} = ${s.demands.id} and ${s.demandShares.userId} = ${actor.id})`,
  );
}

export interface DemandFilters {
  assignee?: string; // id do usuário ou "none" (a distribuir)
  client?: string;
  category?: string;
  status?: Status | "open";
  priority?: Priority;
  overdue?: boolean;
  waiting?: boolean;
  q?: string;
}

const listColumns = {
  id: s.demands.id,
  number: s.demands.number,
  title: s.demands.title,
  status: s.demands.status,
  priority: s.demands.priority,
  dueDate: s.demands.dueDate,
  followUpDate: s.demands.followUpDate,
  waitingFor: s.demands.waitingFor,
  assigneeId: s.demands.assigneeId,
  assigneeName: s.users.name,
  clientId: s.demands.clientId,
  clientName: s.clients.name,
  categoryId: s.demands.categoryId,
  categoryName: s.categories.name,
  typeId: s.demands.typeId,
  estimateMinutes: s.demands.estimateMinutes,
  brand: s.demands.brand,
  createdBy: s.demands.createdBy,
  completedAt: s.demands.completedAt,
};

export type DemandRow = Awaited<ReturnType<typeof listDemands>>[number];

export async function listDemands(actor: Actor, f: DemandFilters = {}) {
  const db = await getDb();
  const today = todayIso();
  const where: (SQL | undefined)[] = [isNull(s.demands.deletedAt), visible(actor)];
  if (f.assignee === "none") where.push(isNull(s.demands.assigneeId));
  else if (f.assignee) where.push(eq(s.demands.assigneeId, f.assignee));
  if (f.client) where.push(eq(s.demands.clientId, f.client));
  if (f.category) where.push(eq(s.demands.categoryId, f.category));
  if (f.status === "open") where.push(inArray(s.demands.status, OPEN_STATUSES));
  else if (f.status) where.push(eq(s.demands.status, f.status));
  if (f.priority) where.push(eq(s.demands.priority, f.priority));
  if (f.overdue) where.push(inArray(s.demands.status, OPEN_STATUSES), sql`${s.demands.dueDate} < ${today}`);
  if (f.waiting) where.push(eq(s.demands.status, "waiting"));
  for (const word of (f.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    where.push(sql`(${s.demands.title} ilike ${"%" + word + "%"} or ${s.clients.name} ilike ${"%" + word + "%"})`);
  }
  return db
    .select(listColumns)
    .from(s.demands)
    .innerJoin(s.clients, eq(s.clients.id, s.demands.clientId))
    .innerJoin(s.categories, eq(s.categories.id, s.demands.categoryId))
    .leftJoin(s.users, eq(s.users.id, s.demands.assigneeId))
    .where(and(...where))
    .orderBy(sql`${s.demands.dueDate} asc nulls last`, desc(s.demands.createdAt))
    .limit(500);
}

/** Demanda visível para o ator, ou null (inexistente e "sem permissão" respondem igual). */
async function loadVisible(db: DB | Tx, actor: Actor, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(s.demands).where(and(eq(s.demands.id, id), isNull(s.demands.deletedAt), visible(actor)));
  return row ?? null;
}

export async function getDemand(actor: Actor, id: string) {
  const db = await getDb();
  const demand = await loadVisible(db, actor, id);
  if (!demand) return null;
  const [[client], [category], checklist, comments, history, shares, people] = await Promise.all([
    db.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, demand.clientId)),
    db.select({ name: s.categories.name }).from(s.categories).where(eq(s.categories.id, demand.categoryId)),
    db.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.demandId, id)).orderBy(asc(s.demandChecklistItems.position), asc(s.demandChecklistItems.createdAt)),
    db.select({ id: s.demandComments.id, body: s.demandComments.body, createdAt: s.demandComments.createdAt, userId: s.demandComments.userId }).from(s.demandComments).where(eq(s.demandComments.demandId, id)).orderBy(asc(s.demandComments.createdAt)),
    db.select().from(s.demandHistory).where(eq(s.demandHistory.demandId, id)).orderBy(desc(s.demandHistory.createdAt)),
    db.select({ userId: s.demandShares.userId }).from(s.demandShares).where(eq(s.demandShares.demandId, id)),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  return {
    ...demand,
    clientName: client?.name ?? "",
    categoryName: category?.name ?? "",
    assigneeName: demand.assigneeId ? (names.get(demand.assigneeId) ?? "") : null,
    createdByName: names.get(demand.createdBy) ?? "",
    completedByName: demand.completedBy ? (names.get(demand.completedBy) ?? "") : null,
    checklist: checklist.map((c) => ({ ...c, checkedByName: c.checkedBy ? (names.get(c.checkedBy) ?? "") : null, verifiedByName: c.verifiedBy ? (names.get(c.verifiedBy) ?? "") : null })),
    comments: comments.map((c) => ({ ...c, userName: names.get(c.userId) ?? "" })),
    history: history.map((h) => ({ ...h, userName: h.userId ? (names.get(h.userId) ?? "") : "Sistema" })),
    sharedWith: shares.map((x) => x.userId),
  };
}

export interface DemandInput {
  title: string;
  clientId: string;
  categoryId: string;
  typeId?: string | null;
  assigneeId: string;
  priority?: Priority;
  dueDate: string | null;
  description?: string | null;
  brand?: string | null;
  store?: string | null;
  promoter?: string | null;
  origin?: Origin;
  estimateMinutes?: number | null;
}

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

/** Regras de prazo e prioridade ("Sem prazo" só com prioridade Baixa). */
export function checkDueRule(dueDate: string | null, priority: Priority): string | null {
  if (dueDate !== null && !isIsoDate(dueDate)) return "Prazo inválido.";
  if (dueDate === null && priority !== "low") return "Demanda sem prazo só é aceita com prioridade Baixa. Informe um prazo ou baixe a prioridade.";
  return null;
}

async function checkRefs(db: DB | Tx, i: { clientId?: string; categoryId?: string; typeId?: string | null; assigneeId?: string | null }): Promise<string | null> {
  if (i.clientId !== undefined) {
    const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.id, i.clientId), isNull(s.clients.deletedAt)));
    if (!c) return "Escolha o contratante.";
  }
  if (i.categoryId !== undefined) {
    const [c] = await db.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.id, i.categoryId));
    if (!c) return "Escolha a categoria.";
  }
  if (i.typeId) {
    const [ty] = await db.select({ categoryId: s.demandTypes.categoryId }).from(s.demandTypes).where(eq(s.demandTypes.id, i.typeId));
    if (!ty || (i.categoryId !== undefined && ty.categoryId !== i.categoryId)) return "O tipo escolhido não pertence a esta categoria.";
  }
  if (i.assigneeId) {
    const [u] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.id, i.assigneeId), eq(s.users.status, "active")));
    if (!u) return "Escolha o responsável.";
  }
  return null;
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function createDemand(actor: Actor, input: DemandInput, opts: { confirmDuplicate?: boolean; source?: string } = {}): Promise<Result<{ id: string; number: number }>> {
  if (!can(actor.role, "demand.create")) return fail("Sem permissão.");
  const title = input.title.trim();
  if (title.length < 3) return fail("Escreva o título da demanda.");
  if (![input.clientId, input.categoryId, input.assigneeId].every((v) => UUID.test(v ?? ""))) return fail("Informe contratante, categoria e responsável.");
  const priority = input.priority ?? "medium";
  if (!PRIORITIES.includes(priority)) return fail("Prioridade inválida.");
  const origin = input.origin ?? "manual";
  if (!ORIGINS.includes(origin)) return fail("Origem inválida.");
  const dueError = checkDueRule(input.dueDate, priority);
  if (dueError) return fail(dueError);
  const estimate = input.estimateMinutes ?? null;
  if (estimate !== null && (!Number.isInteger(estimate) || estimate < 0 || estimate > 100_000)) return fail("Tempo estimado inválido.");

  const db = await getDb();
  const refError = await checkRefs(db, input);
  if (refError) return fail(refError);

  if (!opts.confirmDuplicate) {
    // Anti-duplicata: avisa (sem bloquear) se já há demanda aberta parecida do mesmo contratante.
    const open = await db
      .select({ id: s.demands.id, number: s.demands.number, title: s.demands.title })
      .from(s.demands)
      .where(and(eq(s.demands.clientId, input.clientId), inArray(s.demands.status, OPEN_STATUSES), isNull(s.demands.deletedAt)));
    const dup = open.find((d) => looksDuplicate(d.title, title));
    if (dup) return { ok: false, error: `Já existe uma demanda aberta parecida: #${dup.number} "${dup.title}".`, duplicate: dup };
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.demands)
      .values({
        title,
        clientId: input.clientId,
        categoryId: input.categoryId,
        typeId: input.typeId || null,
        assigneeId: input.assigneeId,
        priority,
        dueDate: input.dueDate,
        description: clean(input.description),
        brand: clean(input.brand),
        store: clean(input.store),
        promoter: clean(input.promoter),
        origin,
        estimateMinutes: estimate,
        createdBy: actor.id,
      })
      .returning({ id: s.demands.id, number: s.demands.number });
    await tx.insert(s.demandHistory).values({ demandId: row.id, userId: actor.id, field: "created", toValue: title });
    await audit(actor.id, "demand", row.id, "created", { after: { title, clientId: input.clientId, assigneeId: input.assigneeId, dueDate: input.dueDate, priority }, source: opts.source }, tx);
    return { ok: true as const, id: row.id, number: row.number, message: `Demanda #${row.number} criada.` };
  });
}

export type DemandPatch = Partial<Omit<DemandInput, "assigneeId">> & { assigneeId?: string };

/** Edição dos campos da demanda. Responsável, prazo e prioridade gravam histórico. */
export async function updateDemand(actor: Actor, id: string, patch: DemandPatch): Promise<Result> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const d = await loadVisible(tx, actor, id);
    if (!d) return fail("Demanda não encontrada.");
    const set: Partial<typeof s.demands.$inferInsert> = {};
    const history: { field: string; from: string | null; to: string | null }[] = [];

    if (patch.title !== undefined) {
      const title = patch.title.trim();
      if (title.length < 3) return fail("Escreva o título da demanda.");
      set.title = title;
    }
    if (patch.clientId !== undefined && patch.clientId !== d.clientId) set.clientId = patch.clientId;
    if (patch.categoryId !== undefined && patch.categoryId !== d.categoryId) {
      set.categoryId = patch.categoryId;
      if (patch.typeId === undefined) set.typeId = null; // o tipo antigo era da outra categoria
    }
    if (patch.typeId !== undefined && (patch.typeId || null) !== d.typeId) set.typeId = patch.typeId || null;
    if (patch.assigneeId !== undefined && patch.assigneeId !== d.assigneeId) {
      if (!can(actor.role, "demand.assign")) return fail("Só o gestor troca o responsável de uma demanda.");
      if (!UUID.test(patch.assigneeId)) return fail("Escolha o responsável.");
      set.assigneeId = patch.assigneeId;
    }
    const refError = await checkRefs(tx, { clientId: set.clientId, categoryId: set.typeId ? (set.categoryId ?? d.categoryId) : set.categoryId, typeId: set.typeId, assigneeId: set.assigneeId });
    if (refError) return fail(refError);

    const priority = patch.priority ?? d.priority;
    if (!PRIORITIES.includes(priority)) return fail("Prioridade inválida.");
    const dueDate = patch.dueDate !== undefined ? patch.dueDate : d.dueDate;
    if (patch.priority !== undefined || patch.dueDate !== undefined) {
      const dueError = checkDueRule(dueDate, priority);
      if (dueError) return fail(dueError);
    }
    if (priority !== d.priority) {
      set.priority = priority;
      history.push({ field: "priority", from: PRIORITY_LABEL[d.priority], to: PRIORITY_LABEL[priority] });
    }
    if (dueDate !== d.dueDate) {
      set.dueDate = dueDate;
      history.push({ field: "dueDate", from: formatBr(d.dueDate), to: formatBr(dueDate) });
    }
    if (set.assigneeId) {
      const people = await tx.select({ id: s.users.id, name: s.users.name }).from(s.users);
      const name = (uid: string | null) => (uid ? (people.find((p) => p.id === uid)?.name ?? "") : "A distribuir");
      history.push({ field: "assignee", from: name(d.assigneeId), to: name(set.assigneeId) });
    }
    if (patch.description !== undefined) set.description = clean(patch.description);
    if (patch.brand !== undefined) set.brand = clean(patch.brand);
    if (patch.store !== undefined) set.store = clean(patch.store);
    if (patch.promoter !== undefined) set.promoter = clean(patch.promoter);
    if (patch.origin !== undefined) {
      if (!ORIGINS.includes(patch.origin)) return fail("Origem inválida.");
      set.origin = patch.origin;
    }
    if (patch.estimateMinutes !== undefined) {
      const e = patch.estimateMinutes;
      if (e !== null && (!Number.isInteger(e) || e < 0 || e > 100_000)) return fail("Tempo estimado inválido.");
      set.estimateMinutes = e;
    }
    if (!Object.keys(set).length) return { ok: true as const, message: "Nada foi alterado." };

    await tx.update(s.demands).set({ ...set, updatedAt: new Date() }).where(eq(s.demands.id, id));
    if (history.length) await tx.insert(s.demandHistory).values(history.map((h) => ({ demandId: id, userId: actor.id, field: h.field, fromValue: h.from, toValue: h.to })));
    await audit(actor.id, "demand", id, "updated", { after: set }, tx);
    return { ok: true as const, message: "Demanda atualizada." };
  });
}

/**
 * Mudança de status (lista, detalhe e kanban). "Aguardando retorno" exige de
 * quem se espera e a data de cobrança; reabrir é só para gestor e dono.
 */
export async function changeStatus(actor: Actor, id: string, status: Status, extra: { waitingFor?: string | null; followUpDate?: string | null; minutes?: number | null } = {}, source?: string): Promise<Result> {
  if (!STATUSES.includes(status)) return fail("Status inválido.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const d = await loadVisible(tx, actor, id);
    if (!d) return fail("Demanda não encontrada.");
    if (d.status === status && status !== "waiting") return { ok: true as const, message: "Nada foi alterado." };
    if (!isOpen(d.status) && d.status !== status && !can(actor.role, "demand.reopen")) return fail("Só o gestor reabre uma demanda concluída ou cancelada.");
    if (status !== "cancelled" && status !== "done" && !d.assigneeId) return fail("Defina o responsável antes de mover a demanda.");

    const set: Partial<typeof s.demands.$inferInsert> = { status, updatedAt: new Date() };
    if (status === "waiting") {
      const waitingFor = clean(extra.waitingFor) ?? d.waitingFor;
      const followUpDate = extra.followUpDate ?? d.followUpDate;
      if (!waitingFor) return fail("Informe de quem você está aguardando o retorno.");
      if (!isIsoDate(followUpDate)) return fail("Informe a data de cobrança.");
      set.waitingFor = waitingFor;
      set.followUpDate = followUpDate;
    } else {
      set.waitingFor = null;
      set.followUpDate = null;
    }
    if (status === "done" && d.status !== "done") {
      // Conferência antes de fechar: item obrigatório sem marcar bloqueia a conclusão.
      const items = await tx.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.demandId, id));
      const missing = items.filter((i) => i.required && !i.checked && !i.notApplicable);
      if (missing.length) return fail(`Falta marcar ${missing.length} item(ns) obrigatório(s) do checklist: ${missing.slice(0, 3).map((i) => i.text).join(", ")}${missing.length > 3 ? "…" : ""}.`);
      // "Quanto tempo levou?" — obrigatório. O valor é o tempo TOTAL de quem conclui nesta demanda;
      // o que já foi apontado (cronômetro, lançamentos) é descontado para não contar duas vezes.
      const [timer] = await tx.select().from(s.timers).where(and(eq(s.timers.userId, actor.id), eq(s.timers.demandId, id)));
      const total = extra.minutes;
      if (typeof total !== "number" || !Number.isInteger(total) || total <= 0 || total > 16 * 60) return fail("Informe quanto tempo levou (em minutos).");
      if (timer) await tx.delete(s.timers).where(eq(s.timers.userId, actor.id));
      const [logged] = await tx
        .select({ n: sql<number>`coalesce(sum(${s.timeEntries.minutes}), 0)::int` })
        .from(s.timeEntries)
        .where(and(eq(s.timeEntries.demandId, id), eq(s.timeEntries.userId, actor.id), isNull(s.timeEntries.deletedAt)));
      const extraMinutes = total - (logged?.n ?? 0);
      if (extraMinutes > 0) await tx.insert(s.timeEntries).values({ demandId: id, userId: actor.id, day: todayIso(), minutes: extraMinutes, source: "completion" });
      set.completedAt = new Date();
      set.completedBy = actor.id;
    } else if (status === "done") {
      // já estava concluída
    } else {
      set.completedAt = null;
      set.completedBy = null;
    }
    await tx.update(s.demands).set(set).where(eq(s.demands.id, id));
    if (d.status !== status) {
      await tx.insert(s.demandHistory).values({ demandId: id, userId: actor.id, field: "status", fromValue: STATUS_LABEL[d.status], toValue: STATUS_LABEL[status] });
      await audit(actor.id, "demand", id, "status_changed", { before: { status: d.status }, after: { status }, source }, tx);
    }
    return { ok: true as const, message: status === "done" ? "Demanda concluída." : `Movida para ${STATUS_LABEL[status]}.` };
  });
}

export async function addComment(actor: Actor, id: string, body: string): Promise<Result> {
  const text = body.trim();
  if (!text) return fail("Escreva o comentário.");
  if (text.length > 4000) return fail("Comentário muito longo.");
  const db = await getDb();
  if (!(await loadVisible(db, actor, id))) return fail("Demanda não encontrada.");
  await db.insert(s.demandComments).values({ demandId: id, userId: actor.id, body: text });
  return { ok: true, message: "Comentário registrado." };
}

export async function addChecklistItem(actor: Actor, id: string, text: string): Promise<Result> {
  const item = text.trim();
  if (!item) return fail("Escreva o item.");
  const db = await getDb();
  if (!(await loadVisible(db, actor, id))) return fail("Demanda não encontrada.");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.demandChecklistItems).where(eq(s.demandChecklistItems.demandId, id));
  await db.insert(s.demandChecklistItems).values({ demandId: id, text: item, position: n });
  return { ok: true };
}

async function loadItem(db: DB, actor: Actor, itemId: string) {
  if (!UUID.test(itemId)) return null;
  const [item] = await db.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.id, itemId));
  if (!item || !(await loadVisible(db, actor, item.demandId))) return null;
  return item;
}

export async function toggleChecklistItem(actor: Actor, itemId: string, checked: boolean): Promise<Result> {
  const db = await getDb();
  const item = await loadItem(db, actor, itemId);
  if (!item) return fail("Item não encontrado.");
  await db
    .update(s.demandChecklistItems)
    .set({ checked, checkedBy: checked ? actor.id : null, checkedAt: checked ? new Date() : null })
    .where(eq(s.demandChecklistItems.id, itemId));
  return { ok: true };
}

export async function removeChecklistItem(actor: Actor, itemId: string): Promise<Result> {
  const db = await getDb();
  const item = await loadItem(db, actor, itemId);
  if (!item) return fail("Item não encontrado.");
  await db.delete(s.demandChecklistItems).where(eq(s.demandChecklistItems.id, itemId));
  return { ok: true };
}

/** Compartilhar com pessoas além do responsável (é o que o operacional passa a ver). */
export async function setShares(actor: Actor, id: string, userIds: string[]): Promise<Result> {
  if (!can(actor.role, "demand.viewAll")) return fail("Só o gestor compartilha demandas.");
  const ids = [...new Set(userIds.filter((u) => UUID.test(u)))];
  const db = await getDb();
  return db.transaction(async (tx) => {
    if (!(await loadVisible(tx, actor, id))) return fail("Demanda não encontrada.");
    const valid = ids.length ? await tx.select({ id: s.users.id }).from(s.users).where(inArray(s.users.id, ids)) : [];
    await tx.delete(s.demandShares).where(eq(s.demandShares.demandId, id));
    if (valid.length) await tx.insert(s.demandShares).values(valid.map((u) => ({ demandId: id, userId: u.id })));
    await audit(actor.id, "demand", id, "shared", { after: { userIds: valid.map((u) => u.id) } }, tx);
    return { ok: true as const, message: "Compartilhamento atualizado." };
  });
}

/** Exclusão lógica (a demanda sai das telas; o registro e o histórico ficam). */
export async function deleteDemand(actor: Actor, id: string, reason: string): Promise<Result> {
  if (!can(actor.role, "demand.delete")) return fail("Sem permissão.");
  const why = reason.trim();
  if (why.length < 5) return fail("Informe o motivo da exclusão.");
  const db = await getDb();
  if (!(await loadVisible(db, actor, id))) return fail("Demanda não encontrada.");
  await db.update(s.demands).set({ deletedAt: new Date() }).where(eq(s.demands.id, id));
  await audit(actor.id, "demand", id, "deleted", { reason: why });
  return { ok: true, message: "Demanda excluída." };
}

/** Categoria mais usada por contratante — sugestão na captura rápida. */
export async function categorySuggestions(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db
    .select({ clientId: s.demands.clientId, categoryId: s.demands.categoryId, n: sql<number>`count(*)::int` })
    .from(s.demands)
    .where(isNull(s.demands.deletedAt))
    .groupBy(s.demands.clientId, s.demands.categoryId);
  const best: Record<string, { categoryId: string; n: number }> = {};
  for (const r of rows) if (!best[r.clientId] || r.n > best[r.clientId].n) best[r.clientId] = { categoryId: r.categoryId, n: r.n };
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.categoryId]));
}

/** Opções dos formulários (pessoas ativas, contratantes, categorias ativas). */
export async function formOptions() {
  const db = await getDb();
  const [people, clients, categories, brands, suggestions, types] = await Promise.all([
    db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.status, "active")).orderBy(asc(s.users.name)),
    db.select({ id: s.clients.id, name: s.clients.name, kind: s.clients.kind }).from(s.clients).where(and(isNull(s.clients.deletedAt), eq(s.clients.status, "active"))).orderBy(asc(s.clients.name)),
    db.select({ id: s.categories.id, name: s.categories.name }).from(s.categories).where(eq(s.categories.active, true)).orderBy(asc(s.categories.position)),
    db.select({ clientId: s.clientBrands.clientId, name: s.clientBrands.name }).from(s.clientBrands).orderBy(asc(s.clientBrands.name)),
    categorySuggestions(),
    db.select({ id: s.demandTypes.id, categoryId: s.demandTypes.categoryId, name: s.demandTypes.name }).from(s.demandTypes).where(eq(s.demandTypes.active, true)).orderBy(asc(s.demandTypes.name)),
  ]);
  return { people, clients, categories, brands, suggestions, types };
}
export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
