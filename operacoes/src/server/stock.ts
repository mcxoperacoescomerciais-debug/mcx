/**
 * Estoque de materiais dos clientes. Regras centrais:
 * - o saldo é sempre a soma das movimentações (nunca editado à mão);
 * - movimentação não se altera nem se apaga — erro se corrige com outra;
 * - saída e perda nunca passam do saldo; item com validade sai por FEFO;
 * - operacional registra entrada, saída, devolução e contagem; ajuste, perda e
 *   cadastro são do gestor e do dono. Tudo grava auditoria.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { addDays, formatBr, isIsoDate, monthEnd, monthLabel, monthStart, todayIso } from "@/lib/dates";
import { isOpen } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { balanceOf, expiringLots, EXPIRY_ALERT_DAYS, fefo, lotBalances, monthSummary, statement, STOCK_CATEGORIES, UNIT_STATUSES, type Move, type MovementKind, type StockCategory, type UnitStatus } from "@/lib/stock";
import { audit } from "./audit";
import { getDb, schema as s, type DB } from "./db";
import { getDemand, type Actor, type Result } from "./demands";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
const DENIED = "Sem permissão.";
const clean = (v: string | null | undefined, max = 160) => (v ?? "").trim().slice(0, max) || null;
const validQty = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 10_000_000;

export type StockItem = typeof s.stockItems.$inferSelect;

async function movesOf(db: DB | Tx, itemIds: string[]) {
  if (!itemIds.length) return [];
  return db.select().from(s.stockMovements).where(inArray(s.stockMovements.itemId, itemIds)).orderBy(asc(s.stockMovements.day), asc(s.stockMovements.createdAt));
}

const asMove = (m: typeof s.stockMovements.$inferSelect): Move => ({ kind: m.kind, delta: m.delta, day: m.day, lot: m.lot, expiresOn: m.expiresOn, counterpart: m.counterpart, city: m.city });

/** Situação de cada item: saldo, abaixo do mínimo, lote mais próximo de vencer. */
function itemStatus(item: StockItem, moves: Move[], today: string) {
  const balance = balanceOf(moves);
  const lots = item.tracksExpiry ? lotBalances(moves) : [];
  const expiring = expiringLots(lots, addDays(today, EXPIRY_ALERT_DAYS));
  return { balance, low: item.category !== "equipment" && item.minQuantity > 0 && balance < item.minQuantity, lots, expiring, nextExpiry: lots.find((l) => l.expiresOn)?.expiresOn ?? null };
}

// --- Consultas -------------------------------------------------------------

export async function stockOverview(actor: Actor) {
  if (!can(actor.role, "stock.view")) return [];
  const db = await getDb();
  const today = todayIso();
  const [clients, items, units] = await Promise.all([
    db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(and(isNull(s.clients.deletedAt), eq(s.clients.status, "active"))).orderBy(asc(s.clients.name)),
    db.select().from(s.stockItems).where(eq(s.stockItems.active, true)),
    db.select().from(s.stockUnits).where(eq(s.stockUnits.active, true)),
  ]);
  const moves = await movesOf(db, items.map((i) => i.id));
  return clients
    .map((c) => {
      const mine = items.filter((i) => i.clientId === c.id);
      const status = mine.map((i) => itemStatus(i, moves.filter((m) => m.itemId === i.id).map(asMove), today));
      const ids = new Set(mine.map((i) => i.id));
      return { ...c, items: mine.length, low: status.filter((x) => x.low).length, expiring: status.filter((x) => x.expiring.length).length, overdue: units.filter((u) => ids.has(u.itemId) && u.status === "in_use" && u.dueBack && u.dueBack < today).length };
    })
    .filter((c) => c.items > 0 || c.name !== "Interno MCX");
}

export async function clientStock(actor: Actor, clientId: string) {
  if (!can(actor.role, "stock.view") || !UUID.test(clientId)) return null;
  const db = await getDb();
  const [client] = await db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(and(eq(s.clients.id, clientId), isNull(s.clients.deletedAt)));
  if (!client) return null;
  const today = todayIso();
  const items = await db.select().from(s.stockItems).where(eq(s.stockItems.clientId, clientId)).orderBy(asc(s.stockItems.category), asc(s.stockItems.name));
  const ids = items.map((i) => i.id);
  const [moves, units, counts, people, brands] = await Promise.all([
    movesOf(db, ids),
    ids.length ? db.select().from(s.stockUnits).where(and(inArray(s.stockUnits.itemId, ids), eq(s.stockUnits.active, true))).orderBy(asc(s.stockUnits.label)) : [],
    ids.length ? db.select().from(s.stockCounts).where(and(inArray(s.stockCounts.itemId, ids), eq(s.stockCounts.status, "pending"))).orderBy(asc(s.stockCounts.createdAt)) : [],
    db.select({ id: s.users.id, name: s.users.name }).from(s.users),
    db.select({ name: s.clientBrands.name }).from(s.clientBrands).where(eq(s.clientBrands.clientId, clientId)).orderBy(asc(s.clientBrands.name)),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const itemNames = new Map(items.map((i) => [i.id, i]));
  return {
    client,
    today,
    brands: brands.map((b) => b.name),
    items: items.map((i) => ({ ...i, ...itemStatus(i, moves.filter((m) => m.itemId === i.id).map(asMove), today), units: units.filter((u) => u.itemId === i.id) })),
    recent: moves.slice(-15).reverse().map((m) => ({ ...m, itemName: itemNames.get(m.itemId)?.name ?? "", unit: itemNames.get(m.itemId)?.unit ?? "", userName: names.get(m.userId) ?? "" })),
    counts: counts.map((c) => ({ ...c, itemName: itemNames.get(c.itemId)?.name ?? "", unit: itemNames.get(c.itemId)?.unit ?? "", userName: names.get(c.userId) ?? "" })),
  };
}

export async function getStockItem(actor: Actor, id: string) {
  if (!can(actor.role, "stock.view") || !UUID.test(id)) return null;
  const db = await getDb();
  const [item] = await db.select().from(s.stockItems).where(eq(s.stockItems.id, id));
  if (!item) return null;
  const [[client], moves, units, counts, people] = await Promise.all([
    db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(eq(s.clients.id, item.clientId)),
    movesOf(db, [id]),
    db.select().from(s.stockUnits).where(eq(s.stockUnits.itemId, id)).orderBy(asc(s.stockUnits.label)),
    db.select().from(s.stockCounts).where(eq(s.stockCounts.itemId, id)).orderBy(desc(s.stockCounts.createdAt)).limit(20),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const today = todayIso();
  return {
    ...item,
    clientName: client?.name ?? "",
    today,
    ...itemStatus(item, moves.map(asMove), today),
    statement: statement(moves).map((m) => ({ ...m, userName: names.get(m.userId) ?? "" })).reverse(),
    units,
    counts: counts.map((c) => ({ ...c, userName: names.get(c.userId) ?? "" })),
  };
}

// --- Cadastro --------------------------------------------------------------

export interface StockItemInput {
  clientId: string;
  brand?: string | null;
  name: string;
  category: StockCategory;
  unit: string;
  minQuantity?: number;
  location?: string | null;
  tracksExpiry?: boolean;
  note?: string | null;
  active?: boolean;
}

export async function saveStockItem(actor: Actor, id: string | null, input: StockItemInput): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "stock.manage")) return fail("Só o gestor cadastra e edita itens do estoque.");
  const name = input.name.trim();
  if (name.length < 2) return fail("Informe o nome do item.");
  if (!STOCK_CATEGORIES.includes(input.category)) return fail("Escolha a categoria.");
  const unit = input.unit.trim().slice(0, 12);
  if (!unit) return fail("Informe a unidade.");
  const minQuantity = input.minQuantity ?? 0;
  if (!Number.isInteger(minQuantity) || minQuantity < 0 || minQuantity > 10_000_000) return fail("Estoque mínimo inválido.");
  if (!UUID.test(input.clientId ?? "")) return fail("Escolha o contratante.");
  const db = await getDb();
  const [client] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.id, input.clientId), isNull(s.clients.deletedAt)));
  if (!client) return fail("Contratante não encontrado.");
  const equipment = input.category === "equipment";
  const values = { brand: clean(input.brand, 80), name: name.slice(0, 120), category: input.category, unit, minQuantity: equipment ? 0 : minQuantity, location: clean(input.location), tracksExpiry: equipment ? false : !!input.tracksExpiry, note: clean(input.note, 500), active: input.active ?? true, updatedAt: new Date() };
  if (!id) {
    const [same] = await db.select({ id: s.stockItems.id }).from(s.stockItems).where(and(eq(s.stockItems.clientId, input.clientId), sql`lower(${s.stockItems.name}) = ${name.toLowerCase()}`, sql`coalesce(${s.stockItems.brand}, '') = ${values.brand ?? ""}`));
    if (same) return fail("Este contratante já tem um item com esse nome.");
    const [row] = await db.insert(s.stockItems).values({ ...values, clientId: input.clientId }).returning({ id: s.stockItems.id });
    await audit(actor.id, "stock_item", row.id, "created", { after: values });
    return { ok: true, id: row.id, message: "Item cadastrado." };
  }
  if (!UUID.test(id)) return fail("Item não encontrado.");
  const [before] = await db.select().from(s.stockItems).where(eq(s.stockItems.id, id));
  if (!before) return fail("Item não encontrado.");
  if ((before.category === "equipment") !== equipment) {
    const [used] = await db.select({ id: s.stockMovements.id }).from(s.stockMovements).where(eq(s.stockMovements.itemId, id)).limit(1);
    const [unit0] = await db.select({ id: s.stockUnits.id }).from(s.stockUnits).where(eq(s.stockUnits.itemId, id)).limit(1);
    if (used || unit0) return fail("Não dá para trocar entre equipamento e material depois que o item já tem movimentação ou unidades.");
  }
  if (before.tracksExpiry && !values.tracksExpiry) {
    const [used] = await db.select({ id: s.stockMovements.id }).from(s.stockMovements).where(eq(s.stockMovements.itemId, id)).limit(1);
    if (used) return fail("Este item já tem lotes com validade; o controle de validade não pode ser desligado.");
  }
  await db.update(s.stockItems).set(values).where(eq(s.stockItems.id, id));
  await audit(actor.id, "stock_item", id, "updated", { before: { name: before.name, minQuantity: before.minQuantity, active: before.active }, after: { name: values.name, minQuantity: values.minQuantity, active: values.active } });
  return { ok: true, id, message: "Item atualizado." };
}

// --- Movimentações ---------------------------------------------------------

export interface MovementInput {
  kind: Exclude<MovementKind, "adjust">;
  quantity: number;
  day?: string;
  counterpart?: string | null;
  reference?: string | null;
  lot?: string | null;
  expiresOn?: string | null;
  city?: string | null;
  store?: string | null;
  promoter?: string | null;
  reason?: string | null;
  demandId?: string | null;
  checklistItemId?: string | null;
}

/** Insere a(s) linha(s) de uma movimentação já validada. Saída/perda de item com validade se divide por lote (FEFO). */
async function writeMovement(tx: Tx, actor: Actor, item: StockItem, input: MovementInput, day: string): Promise<string | null> {
  const moves = (await movesOf(tx, [item.id])).map(asMove);
  const base = { itemId: item.id, kind: input.kind, day, counterpart: clean(input.counterpart), reference: clean(input.reference, 80), city: clean(input.city, 80), store: clean(input.store, 120), promoter: clean(input.promoter, 120), reason: clean(input.reason, 300), demandId: input.demandId && UUID.test(input.demandId) ? input.demandId : null, checklistItemId: input.checklistItemId && UUID.test(input.checklistItemId) ? input.checklistItemId : null, userId: actor.id };
  const lot = clean(input.lot, 60);
  if (input.kind === "in" || input.kind === "return") {
    await tx.insert(s.stockMovements).values({ ...base, delta: input.quantity, lot: item.tracksExpiry ? lot : null, expiresOn: item.tracksExpiry ? (input.expiresOn ?? null) : null });
    return null;
  }
  const balance = balanceOf(moves);
  if (input.quantity > balance) return `Saldo insuficiente de ${item.name}: há ${balance} ${item.unit} e o pedido é de ${input.quantity}. Se a contagem física for outra, peça um ajuste de inventário.`;
  if (!item.tracksExpiry) {
    await tx.insert(s.stockMovements).values({ ...base, delta: -input.quantity, lot: null, expiresOn: null });
    return null;
  }
  let lots = lotBalances(moves);
  if (lot || input.expiresOn) {
    lots = lots.filter((l) => (lot ? l.lot === lot : true) && (input.expiresOn ? l.expiresOn === input.expiresOn : true));
    if (!lots.length) return "Lote não encontrado ou sem saldo.";
  }
  const { picks, shortfall } = fefo(lots, input.quantity);
  if (shortfall > 0) return lot || input.expiresOn ? `O lote escolhido só tem ${input.quantity - shortfall} ${item.unit}.` : `Os lotes somam menos que o saldo (${input.quantity - shortfall} ${item.unit}). Peça um ajuste de inventário.`;
  await tx.insert(s.stockMovements).values(picks.map((p) => ({ ...base, delta: -p.quantity, lot: p.lot, expiresOn: p.expiresOn })));
  return null;
}

function movementError(actor: Actor, item: StockItem, input: MovementInput, day: string, today: string): string | null {
  if (!["in", "out", "return", "loss"].includes(input.kind)) return "Tipo de movimentação inválido.";
  if (input.kind === "loss" ? !can(actor.role, "stock.manage") : !can(actor.role, "stock.move")) return input.kind === "loss" ? "Perda e vencimento são registrados pelo gestor." : DENIED;
  if (!item.active) return "Item desativado.";
  if (item.category === "equipment") return "Equipamento é controlado por unidade (disponível, em uso, manutenção), não por quantidade.";
  if (!validQty(input.quantity)) return "Informe a quantidade (número inteiro maior que zero).";
  if (!isIsoDate(day) || day > today) return "Data inválida (não pode ser no futuro).";
  if (input.kind === "in") {
    if (!clean(input.counterpart)) return "Informe a origem (ex.: recebido do cliente).";
    if (item.tracksExpiry && !isIsoDate(input.expiresOn)) return "Este item controla validade: informe a data de validade do lote.";
  }
  if (input.kind === "out" && !clean(input.counterpart)) return "Informe o destino (ação, degustação ou para quem saiu).";
  if (input.kind === "loss" && !clean(input.reason)) return "Informe o motivo da perda.";
  if (input.expiresOn && !isIsoDate(input.expiresOn)) return "Validade inválida.";
  return null;
}

export async function addMovement(actor: Actor, itemId: string, input: MovementInput): Promise<Result> {
  if (!can(actor.role, "stock.move") || !UUID.test(itemId)) return fail(DENIED);
  const db = await getDb();
  const [item] = await db.select().from(s.stockItems).where(eq(s.stockItems.id, itemId));
  if (!item) return fail("Item não encontrado.");
  const today = todayIso();
  const day = input.day ?? today;
  const error = movementError(actor, item, input, day, today);
  if (error) return fail(error);
  if (input.demandId && !(await getDemand(actor, input.demandId))) return fail("Demanda não encontrada.");
  return db.transaction(async (tx) => {
    const problem = await writeMovement(tx, actor, item, input, day);
    if (problem) return fail(problem);
    await audit(actor.id, "stock_item", itemId, `movement_${input.kind}`, { after: { quantity: input.quantity, day, counterpart: clean(input.counterpart), lot: clean(input.lot, 60), reason: clean(input.reason, 300) } }, tx);
    return { ok: true as const, message: "Movimentação registrada." };
  });
}

/** Ajuste de inventário: informa o CONTADO; o sistema grava a diferença, com motivo. */
async function writeAdjust(tx: Tx, actor: Actor, item: StockItem, counted: number, reason: string): Promise<number> {
  const moves = (await movesOf(tx, [item.id])).map(asMove);
  const diff = counted - balanceOf(moves);
  if (diff === 0) return 0;
  const base = { itemId: item.id, kind: "adjust" as const, day: todayIso(), reason, userId: actor.id };
  if (diff > 0 || !item.tracksExpiry) {
    await tx.insert(s.stockMovements).values({ ...base, delta: diff, lot: null, expiresOn: null });
  } else {
    // Faltou: abate dos lotes que vencem primeiro; o que não couber em lote sai sem lote.
    const { picks, shortfall } = fefo(lotBalances(moves), -diff);
    const rows = picks.map((p) => ({ ...base, delta: -p.quantity, lot: p.lot, expiresOn: p.expiresOn }));
    if (shortfall > 0) rows.push({ ...base, delta: -shortfall, lot: null, expiresOn: null });
    await tx.insert(s.stockMovements).values(rows);
  }
  await audit(actor.id, "stock_item", item.id, "movement_adjust", { before: { balance: counted - diff }, after: { balance: counted }, reason }, tx);
  return diff;
}

/** Contagem: o gestor ajusta na hora; a do operacional fica pendente até o gestor aprovar. */
export async function recordCount(actor: Actor, itemId: string, counted: number, note: string | null): Promise<Result> {
  if (!can(actor.role, "stock.move") || !UUID.test(itemId)) return fail(DENIED);
  if (!Number.isInteger(counted) || counted < 0 || counted > 10_000_000) return fail("Informe a quantidade contada.");
  const db = await getDb();
  const [item] = await db.select().from(s.stockItems).where(eq(s.stockItems.id, itemId));
  if (!item || !item.active) return fail("Item não encontrado.");
  if (item.category === "equipment") return fail("Equipamento é controlado por unidade.");
  const why = clean(note, 300);
  return db.transaction(async (tx) => {
    const balance = balanceOf((await movesOf(tx, [itemId])).map(asMove));
    if (!can(actor.role, "stock.manage")) {
      await tx.update(s.stockCounts).set({ status: "discarded", decidedAt: new Date() }).where(and(eq(s.stockCounts.itemId, itemId), eq(s.stockCounts.status, "pending")));
      await tx.insert(s.stockCounts).values({ itemId, counted, balanceAtCount: balance, note: why, userId: actor.id });
      return { ok: true as const, message: counted === balance ? "Contagem registrada: bate com o sistema." : "Contagem registrada. A diferença vai para o gestor aprovar o ajuste." };
    }
    if (counted !== balance && !why) return fail("A contagem difere do saldo: informe o motivo do ajuste.");
    const diff = await writeAdjust(tx, actor, item, counted, why ?? "Contagem");
    await tx.insert(s.stockCounts).values({ itemId, counted, balanceAtCount: balance, note: why, userId: actor.id, status: "applied", decidedBy: actor.id, decidedAt: new Date() });
    return { ok: true as const, message: diff === 0 ? "Contagem registrada: bate com o sistema." : `Ajuste de ${diff > 0 ? "+" : ""}${diff} ${item.unit} registrado.` };
  });
}

export async function decideCount(actor: Actor, countId: string, apply: boolean, reason: string | null): Promise<Result> {
  if (!can(actor.role, "stock.manage") || !UUID.test(countId)) return fail("Só o gestor aprova ajustes de inventário.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [count] = await tx.select().from(s.stockCounts).where(eq(s.stockCounts.id, countId));
    if (!count || count.status !== "pending") return fail("Contagem não encontrada ou já decidida.");
    const [item] = await tx.select().from(s.stockItems).where(eq(s.stockItems.id, count.itemId));
    if (!item) return fail("Item não encontrado.");
    let message = "Contagem descartada.";
    if (apply) {
      const why = clean(reason, 300) ?? count.note;
      const balance = balanceOf((await movesOf(tx, [item.id])).map(asMove));
      if (count.counted !== balance && !why) return fail("Informe o motivo do ajuste.");
      const diff = await writeAdjust(tx, actor, item, count.counted, `Contagem de ${formatBr(todayIso(count.createdAt))}${why ? `: ${why}` : ""}`);
      message = diff === 0 ? "Contagem confere; nenhum ajuste necessário." : `Ajuste de ${diff > 0 ? "+" : ""}${diff} ${item.unit} registrado.`;
    }
    await tx.update(s.stockCounts).set({ status: apply ? "applied" : "discarded", decidedBy: actor.id, decidedAt: new Date() }).where(eq(s.stockCounts.id, countId));
    return { ok: true as const, message };
  });
}

// --- Equipamentos ----------------------------------------------------------

export async function addStockUnit(actor: Actor, itemId: string, label: string): Promise<Result> {
  if (!can(actor.role, "stock.manage") || !UUID.test(itemId)) return fail("Só o gestor cadastra unidades de equipamento.");
  const name = label.trim().slice(0, 80);
  if (name.length < 2) return fail("Informe a identificação da unidade (ex.: Garrafa térmica 1).");
  const db = await getDb();
  const [item] = await db.select().from(s.stockItems).where(eq(s.stockItems.id, itemId));
  if (!item || item.category !== "equipment") return fail("Unidades só existem para itens da categoria Equipamento.");
  const [row] = await db.insert(s.stockUnits).values({ itemId, label: name }).returning({ id: s.stockUnits.id });
  await audit(actor.id, "stock_unit", row.id, "created", { after: { label: name, itemId } });
  return { ok: true, message: "Unidade cadastrada." };
}

export async function setUnitStatus(actor: Actor, unitId: string, input: { status: UnitStatus; holder?: string | null; dueBack?: string | null; note?: string | null }): Promise<Result> {
  if (!can(actor.role, "stock.move") || !UUID.test(unitId)) return fail(DENIED);
  if (!UNIT_STATUSES.includes(input.status)) return fail("Status inválido.");
  const db = await getDb();
  const [unit] = await db.select().from(s.stockUnits).where(eq(s.stockUnits.id, unitId));
  if (!unit || !unit.active) return fail("Unidade não encontrada.");
  if ((input.status === "maintenance" || unit.status === "maintenance") && !can(actor.role, "stock.manage")) return fail("Manutenção é registrada pelo gestor.");
  const set = { status: input.status, holder: null as string | null, dueBack: null as string | null, note: clean(input.note, 300), updatedAt: new Date() };
  if (input.status === "in_use") {
    if (!clean(input.holder)) return fail("Informe com quem está o equipamento.");
    if (!isIsoDate(input.dueBack) || input.dueBack < todayIso()) return fail("Informe até quando (data de devolução).");
    set.holder = clean(input.holder);
    set.dueBack = input.dueBack;
  }
  await db.update(s.stockUnits).set(set).where(eq(s.stockUnits.id, unitId));
  await audit(actor.id, "stock_unit", unitId, "status_changed", { before: { status: unit.status, holder: unit.holder, dueBack: unit.dueBack }, after: { status: set.status, holder: set.holder, dueBack: set.dueBack } });
  return { ok: true, message: "Equipamento atualizado." };
}

// --- Integração com o checklist da demanda ----------------------------------

/** Para a tela da demanda: itens do checklist com o saldo do estoque e o que já saiu por esta demanda. */
export async function demandStock(actor: Actor, demandId: string) {
  if (!can(actor.role, "stock.view")) return null;
  const demand = await getDemand(actor, demandId);
  if (!demand) return null;
  const db = await getDb();
  const items = await db.select().from(s.stockItems).where(and(eq(s.stockItems.clientId, demand.clientId), eq(s.stockItems.active, true))).orderBy(asc(s.stockItems.name));
  const materials = items.filter((i) => i.category !== "equipment");
  if (!materials.length) return { options: [], lines: [], done: demand.status === "done" };
  const moves = await movesOf(db, materials.map((i) => i.id));
  const balance = new Map(materials.map((i) => [i.id, balanceOf(moves.filter((m) => m.itemId === i.id))]));
  const registered = new Map<string, number>();
  for (const m of moves) if (m.demandId === demandId && m.checklistItemId && m.kind === "out") registered.set(m.checklistItemId, (registered.get(m.checklistItemId) ?? 0) - m.delta);
  const byId = new Map(materials.map((i) => [i.id, i]));
  return {
    done: demand.status === "done",
    options: materials.map((i) => ({ id: i.id, name: i.brand ? `${i.name} (${i.brand})` : i.name, unit: i.unit, balance: balance.get(i.id) ?? 0 })),
    lines: demand.checklist
      .filter((c) => !c.notApplicable)
      .map((c) => {
        const item = c.stockItemId ? byId.get(c.stockItemId) : undefined;
        const available = item ? (balance.get(item.id) ?? 0) : null;
        return { id: c.id, text: c.text, quantity: c.quantity, checked: c.checked, stockItemId: item?.id ?? null, unit: item?.unit ?? c.unit ?? "", balance: available, short: item != null && c.quantity != null && c.quantity > (available ?? 0), registered: registered.get(c.id) ?? 0 };
      }),
  };
}

export async function linkChecklistItem(actor: Actor, checklistItemId: string, stockItemId: string | null): Promise<Result> {
  if (!can(actor.role, "stock.move") || !UUID.test(checklistItemId)) return fail(DENIED);
  const db = await getDb();
  const [line] = await db.select().from(s.demandChecklistItems).where(eq(s.demandChecklistItems.id, checklistItemId));
  const demand = line ? await getDemand(actor, line.demandId) : null;
  if (!line || !demand) return fail("Item não encontrado.");
  if (stockItemId) {
    const [item] = UUID.test(stockItemId) ? await db.select().from(s.stockItems).where(eq(s.stockItems.id, stockItemId)) : [];
    if (!item || item.clientId !== demand.clientId || item.category === "equipment") return fail("Escolha um item do estoque deste contratante.");
  }
  await db.update(s.demandChecklistItems).set({ stockItemId: stockItemId || null }).where(eq(s.demandChecklistItems.id, checklistItemId));
  return { ok: true };
}

/**
 * Registra de uma vez as saídas do checklist da demanda — só quando a pessoa
 * confirma (nunca automático). Cada item do checklist só gera saída uma vez.
 */
export async function registerDemandOutputs(actor: Actor, demandId: string, lines: { checklistItemId: string; quantity: number }[], dest: { counterpart: string; city?: string | null; store?: string | null; promoter?: string | null }): Promise<Result> {
  if (!can(actor.role, "stock.move")) return fail(DENIED);
  const demand = await getDemand(actor, demandId);
  if (!demand) return fail("Demanda não encontrada.");
  if (!clean(dest.counterpart)) return fail("Informe o destino (ação, degustação ou para quem saiu).");
  const chosen = lines.filter((l) => l.quantity !== 0);
  if (!chosen.length) return fail("Nenhuma quantidade informada.");
  if (chosen.some((l) => !validQty(l.quantity))) return fail("Quantidade inválida.");
  const db = await getDb();
  const today = todayIso();
  return db.transaction(async (tx) => {
    for (const l of chosen) {
      const line = demand.checklist.find((c) => c.id === l.checklistItemId);
      if (!line?.stockItemId) throw new StockError("Há item sem vínculo com o estoque.");
      const [item] = await tx.select().from(s.stockItems).where(eq(s.stockItems.id, line.stockItemId));
      if (!item || item.clientId !== demand.clientId) throw new StockError("Item de estoque inválido.");
      const [already] = await tx.select({ id: s.stockMovements.id }).from(s.stockMovements).where(and(eq(s.stockMovements.demandId, demandId), eq(s.stockMovements.checklistItemId, line.id), eq(s.stockMovements.kind, "out"))).limit(1);
      if (already) throw new StockError(`A saída de “${line.text}” já foi registrada nesta demanda.`);
      const input: MovementInput = { kind: "out", quantity: l.quantity, counterpart: dest.counterpart, city: dest.city, store: dest.store ?? demand.store, promoter: dest.promoter ?? demand.promoter, demandId, checklistItemId: line.id };
      const error = movementError(actor, item, input, today, today) ?? (await writeMovement(tx, actor, item, input, today));
      if (error) throw new StockError(error);
    }
    await audit(actor.id, "demand", demandId, "stock_outputs", { after: { lines: chosen, destination: clean(dest.counterpart) } }, tx);
    return { ok: true as const, message: `${chosen.length} ${chosen.length === 1 ? "saída registrada" : "saídas registradas"} no estoque.` };
  }).catch((err: unknown) => {
    // Um item sem saldo desfaz todas as saídas da confirmação: ou sai tudo, ou nada.
    if (err instanceof StockError) return fail(err.message);
    throw err;
  });
}

class StockError extends Error {}

// --- Alertas que viram demanda ----------------------------------------------

async function openAlert(tx: Tx, kind: "low" | "expiry" | "overdue" | "inventory", refKey: string, onceEver = false): Promise<boolean> {
  const rows = await tx.select({ status: s.demands.status, deletedAt: s.demands.deletedAt }).from(s.stockAlerts).innerJoin(s.demands, eq(s.demands.id, s.stockAlerts.demandId)).where(and(eq(s.stockAlerts.kind, kind), eq(s.stockAlerts.refKey, refKey)));
  return onceEver ? rows.length > 0 : rows.some((r) => !r.deletedAt && isOpen(r.status));
}

/**
 * Abre demandas para o gestor: abaixo do mínimo, validade próxima, equipamento
 * não devolvido e a contagem mensal. Idempotente: enquanto a demanda do alerta
 * estiver aberta, não abre outra (e a chave única do dia barra corrida).
 */
export async function generateStockAlerts(today: string = todayIso()): Promise<{ created: number }> {
  const db = await getDb();
  const people = await db.select().from(s.users).where(eq(s.users.status, "active"));
  const assignee = people.find((p) => p.role === "gestor") ?? people.find((p) => p.role === "owner");
  if (!assignee) return { created: 0 };
  const [items, units, clients, categories, [dayRow]] = await Promise.all([
    db.select().from(s.stockItems).where(eq(s.stockItems.active, true)),
    db.select().from(s.stockUnits).where(eq(s.stockUnits.active, true)),
    db.select().from(s.clients).where(isNull(s.clients.deletedAt)),
    db.select().from(s.categories).orderBy(asc(s.categories.position)),
    db.select().from(s.settings).where(eq(s.settings.key, "stock_inventory_day")),
  ]);
  if (!items.length) return { created: 0 };
  const category = categories.find((c) => c.name === "Degustação") ?? categories[0];
  const moves = await movesOf(db, items.map((i) => i.id));
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "";
  type Alert = { kind: "low" | "expiry" | "overdue" | "inventory"; refKey: string; clientId: string; title: string; description: string; onceEver?: boolean; checklist?: { text: string; unit: string }[] };
  const alerts: Alert[] = [];

  for (const item of items) {
    const st = itemStatus(item, moves.filter((m) => m.itemId === item.id).map(asMove), today);
    if (st.low) alerts.push({ kind: "low", refKey: item.id, clientId: item.clientId, title: `Pedir reposição ao cliente: ${item.name} (${clientName(item.clientId)})`, description: `Saldo de ${st.balance} ${item.unit}, abaixo do mínimo de ${item.minQuantity} ${item.unit}.` });
    for (const lot of st.expiring) alerts.push({ kind: "expiry", refKey: `${item.id}|${lot.lot ?? ""}|${lot.expiresOn}`, clientId: item.clientId, title: `Validade próxima: ${item.name} (${clientName(item.clientId)}) vence em ${formatBr(lot.expiresOn)}`, description: `${lot.quantity} ${item.unit}${lot.lot ? ` do lote ${lot.lot}` : ""} com validade em ${formatBr(lot.expiresOn)}. Usar primeiro, avisar o cliente ou registrar a perda.` });
  }
  for (const unit of units) {
    const item = items.find((i) => i.id === unit.itemId);
    if (item && unit.status === "in_use" && unit.dueBack && unit.dueBack < today) alerts.push({ kind: "overdue", refKey: `${unit.id}|${unit.dueBack}`, clientId: item.clientId, title: `Cobrar devolução: ${unit.label} (${clientName(item.clientId)})`, description: `Está com ${unit.holder ?? "—"} e deveria ter voltado em ${formatBr(unit.dueBack)}.` });
  }
  const inventoryDay = dayRow ? Number(dayRow.value) : 1;
  if (inventoryDay >= 1 && Number(today.slice(8)) >= inventoryDay) {
    for (const client of clients) {
      const mine = items.filter((i) => i.clientId === client.id && i.category !== "equipment");
      if (mine.length) alerts.push({ kind: "inventory", refKey: `${client.id}|${today.slice(0, 7)}`, clientId: client.id, onceEver: true, title: `Inventário do estoque — ${client.name} — ${monthLabel(today)}`, description: "Conte cada item e registre a contagem na tela do item (Estoque › item › Contagem). A diferença vira ajuste com motivo.", checklist: mine.map((i) => ({ text: `Contar: ${i.name}`, unit: i.unit })) });
    }
  }

  let created = 0;
  for (const a of alerts) {
    const made = await db
      .transaction(async (tx) => {
        if (await openAlert(tx, a.kind, a.refKey, a.onceEver)) return false;
        const [demand] = await tx
          .insert(s.demands)
          .values({ title: a.title.slice(0, 200), clientId: a.clientId, categoryId: category.id, assigneeId: assignee.id, priority: a.kind === "inventory" ? "medium" : "high", dueDate: addDays(today, a.kind === "inventory" ? 5 : 2), origin: "system", description: a.description, createdBy: assignee.id })
          .returning({ id: s.demands.id });
        await tx.insert(s.stockAlerts).values({ kind: a.kind, refKey: a.refKey, demandId: demand.id, day: today });
        await tx.insert(s.demandHistory).values({ demandId: demand.id, userId: null, field: "created", toValue: "Alerta do estoque" });
        if (a.checklist) await tx.insert(s.demandChecklistItems).values(a.checklist.map((c, position) => ({ demandId: demand.id, text: c.text, unit: c.unit, required: true, position })));
        await audit(null, "demand", demand.id, "created", { after: { alert: a.kind, refKey: a.refKey }, source: "estoque" }, tx);
        return true;
      })
      .catch((err: unknown) => {
        if (String((err as { code?: string }).code) === "23505" || /duplicate key|stock_alerts/i.test(String(err))) return false;
        throw err;
      });
    if (made) created++;
  }
  return { created };
}

export async function inventoryDay(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, "stock_inventory_day"));
  const n = row ? Number(row.value) : 1;
  return Number.isInteger(n) && n >= 0 && n <= 28 ? n : 1;
}

export async function setInventoryDay(actor: Actor, day: number): Promise<Result> {
  if (!can(actor.role, "stock.manage")) return fail(DENIED);
  if (!Number.isInteger(day) || day < 0 || day > 28) return fail("Dia do mês: de 1 a 28 (0 desliga a contagem mensal).");
  const db = await getDb();
  await db.insert(s.settings).values({ key: "stock_inventory_day", value: day }).onConflictDoUpdate({ target: s.settings.key, set: { value: day, updatedAt: new Date() } });
  await audit(actor.id, "setting", "stock_inventory_day", "updated", { after: { day } });
  return { ok: true, message: day === 0 ? "Contagem mensal desligada." : `Contagem mensal no dia ${day}.` };
}

// --- Relatório mensal (prestação de contas ao cliente) -----------------------

export async function monthlyStockReport(actor: Actor, clientId: string, month: string) {
  const data = await clientStock(actor, clientId);
  if (!data) return null;
  const db = await getDb();
  const from = monthStart(month);
  const to = monthEnd(month);
  const materials = data.items.filter((i) => i.category !== "equipment");
  const moves = await movesOf(db, materials.map((i) => i.id));
  return {
    client: data.client,
    from,
    to,
    rows: materials.map((i) => ({ id: i.id, name: i.brand ? `${i.name} (${i.brand})` : i.name, unit: i.unit, ...monthSummary(moves.filter((m) => m.itemId === i.id).map(asMove), from, to) })).filter((r) => r.opening !== 0 || r.closing !== 0 || r.entries || r.outputs || r.returns || r.losses || r.adjustments),
    equipment: data.items.filter((i) => i.category === "equipment").flatMap((i) => i.units.map((u) => ({ id: u.id, item: i.name, label: u.label, status: u.status, holder: u.holder, dueBack: u.dueBack }))),
  };
}

/** Itens de estoque por contratante, para vincular nos modelos de checklist. */
export async function stockItemOptions() {
  const db = await getDb();
  return db.select({ id: s.stockItems.id, clientId: s.stockItems.clientId, name: s.stockItems.name, unit: s.stockItems.unit }).from(s.stockItems).where(and(eq(s.stockItems.active, true), sql`${s.stockItems.category} <> 'equipment'`)).orderBy(asc(s.stockItems.name));
}
