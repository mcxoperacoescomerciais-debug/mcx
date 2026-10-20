/**
 * Degustações (operação): degustadoras, eventos, contato pelo WhatsApp, materiais,
 * situação, anexos e o financeiro de cada evento. Toda alteração fica na auditoria
 * (entidade "tasting"), que vira o histórico do evento.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { brandFilter } from "./scope";
import { storage } from "./storage";
import type { ActionResult } from "./manager";
import { addDays, isIsoDate, todayIso } from "@/lib/dates";
import {
  actualMoney,
  CONTACT_STATUSES,
  countedRevenue,
  FILE_KINDS,
  materialsFor,
  materialsState,
  tastingResult,
  TASTING_STATUSES,
  type ContactStatus,
  type DocStatus,
  type MaterialsState,
  type TastingFileKind,
  type TastingFlag,
  type TastingMoney,
  type TastingResult,
  type TastingStatus,
} from "@/lib/tasting";

const fail = (error: string): ActionResult => ({ ok: false, error });
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function canManageTastings(scope: Scope): boolean {
  return (scope.role === "admin" || scope.role === "manager") && scope.brandIds === null;
}
const actor = (scope: Scope) => ({ agencyId: scope.agencyId, userId: scope.userId });

// ───────────────────────────── Degustadoras ─────────────────────────────

export interface TasterInput {
  name: string;
  phone: string | null;
  city: string;
  state: string;
  region: string | null;
  area: string | null;
  availability: string | null;
  experience: string | null;
  usualFee: number | null;
  notes: string | null;
  status: "active" | "inactive";
}

export async function listTasters(scope: Scope, f: { q?: string; city?: string; region?: string; availability?: string; status?: string } = {}) {
  const db = await getDb();
  const like = (v: string) => `%${v.trim()}%`;
  const rows = await db
    .select({
      t: s.tasters,
      events: sql<number>`(select count(*)::int from ${s.tastings} x where x.taster_id = "tasters"."id" and x.status = 'completed')`,
      next: sql<string | null>`(select min(x.date)::text from ${s.tastings} x where x.taster_id = "tasters"."id" and x.status in ('confirmed','awaiting_confirmation','in_progress') and x.date >= ${todayIso()})`,
    })
    .from(s.tasters)
    .where(
      and(
        eq(s.tasters.agencyId, scope.agencyId),
        f.status === "inactive" ? eq(s.tasters.status, "inactive") : f.status === "all" ? undefined : eq(s.tasters.status, "active"),
        f.q ? or(ilike(s.tasters.name, like(f.q)), ilike(s.tasters.phone, like(f.q.replace(/\D/g, "") || f.q))) : undefined,
        f.city ? ilike(s.tasters.city, like(f.city)) : undefined,
        f.region ? ilike(s.tasters.region, like(f.region)) : undefined,
        f.availability ? ilike(s.tasters.availability, like(f.availability)) : undefined,
      ),
    )
    .orderBy(asc(s.tasters.city), asc(s.tasters.name));
  return rows.map((r) => ({ ...r.t, events: r.events, next: r.next }));
}

export async function getTaster(scope: Scope, id: string) {
  const db = await getDb();
  const [t] = await db.select().from(s.tasters).where(and(eq(s.tasters.id, id), eq(s.tasters.agencyId, scope.agencyId)));
  if (!t) return null;
  const history = await db
    .select({ id: s.tastings.id, date: s.tastings.date, storeName: s.tastings.storeName, city: s.tastings.city, status: s.tastings.status, brandName: s.brands.name, fee: s.tastings.tasterFee, feeActual: s.tastings.tasterFeeActual, paid: s.tastings.tasterPaymentStatus })
    .from(s.tastings)
    .innerJoin(s.brands, eq(s.brands.id, s.tastings.brandId))
    .where(and(eq(s.tastings.agencyId, scope.agencyId), eq(s.tastings.tasterId, id)))
    .orderBy(desc(s.tastings.date));
  const contacts = await db
    .select({ id: s.tastingContacts.id, status: s.tastingContacts.status, at: s.tastingContacts.createdAt, tastingId: s.tastingContacts.tastingId, date: s.tastings.date, storeName: s.tastings.storeName })
    .from(s.tastingContacts)
    .innerJoin(s.tastings, eq(s.tastings.id, s.tastingContacts.tastingId))
    .where(and(eq(s.tastingContacts.tasterId, id), eq(s.tastings.agencyId, scope.agencyId)))
    .orderBy(desc(s.tastingContacts.createdAt))
    .limit(50);
  return { taster: t, history, contacts };
}

export async function saveTaster(scope: Scope, id: string | null, i: TasterInput): Promise<ActionResult & { id?: string }> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  if (i.name.trim().length < 2) return fail("Informe o nome completo.");
  if (!i.city.trim()) return fail("Informe a cidade.");
  const phone = (i.phone ?? "").replace(/\D/g, "");
  if (phone && (phone.length < 10 || phone.length > 13)) return fail("WhatsApp inválido: use DDD + número (ex.: 37 99999-0000).");
  if (i.usualFee !== null && (i.usualFee < 0 || i.usualFee > 100000)) return fail("Valor habitual inválido.");
  const db = await getDb();
  const values = { ...i, name: i.name.trim(), city: i.city.trim(), state: (i.state || "MG").trim().toUpperCase().slice(0, 2), phone: phone ? (phone.length <= 11 ? `55${phone}` : phone) : null, updatedAt: new Date(), updatedBy: scope.userId };
  if (id) {
    const [prev] = await db.select().from(s.tasters).where(and(eq(s.tasters.id, id), eq(s.tasters.agencyId, scope.agencyId)));
    if (!prev) return fail("Degustadora não encontrada.");
    await db.update(s.tasters).set(values).where(eq(s.tasters.id, id));
    await audit(actor(scope), "taster", id, "updated", { before: prev, after: values });
    return { ok: true, message: "Cadastro salvo.", id };
  }
  const [row] = await db.insert(s.tasters).values({ ...values, agencyId: scope.agencyId, createdBy: scope.userId }).returning({ id: s.tasters.id });
  await audit(actor(scope), "taster", row.id, "created", { after: values });
  return { ok: true, message: "Degustadora cadastrada.", id: row.id };
}

// ───────────────────────────── Degustações ─────────────────────────────

export interface TastingInput {
  brandId: string;
  storeId: string | null;
  chainName: string | null;
  storeName: string;
  city: string;
  state: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  product: string | null;
  description: string | null;
  materialsNote: string | null;
  notes: string | null;
  responsibleId: string | null;
  orderRef: string | null;
  actionCode: string | null;
  billingTerms: string | null;
  brandPaymentDue: string | null;
  tasterPaymentDue: string | null;
  photoProof: boolean;
  requiredEvidence: string | null;
  revenue: number | null;
  taxes: number | null;
  tasterFee: number | null;
  transport: number | null;
  food: number | null;
  materialsCost: number | null;
  otherCost: number | null;
}

function validateTasting(i: TastingInput): string | null {
  if (!i.brandId) return "Escolha a marca contratante.";
  if (!isIsoDate(i.date)) return "Data inválida.";
  if (!i.storeName.trim()) return "Informe a loja (ou escolha uma loja cadastrada).";
  if (!i.city.trim()) return "Informe a cidade.";
  if (i.startTime && !HHMM.test(i.startTime)) return "Horário inicial inválido (HH:MM).";
  if (i.endTime && !HHMM.test(i.endTime)) return "Horário final inválido (HH:MM).";
  if (i.startTime && i.endTime && i.endTime <= i.startTime) return "O horário final deve ser depois do inicial.";
  for (const k of ["revenue", "taxes", "tasterFee", "transport", "food", "materialsCost", "otherCost"] as const) {
    const v = i[k];
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1_000_000)) return "Valor financeiro inválido.";
  }
  for (const d of [i.brandPaymentDue, i.tasterPaymentDue]) if (d && !isIsoDate(d)) return "Prazo inválido.";
  return null;
}

/** Mesmo evento já cadastrado: marca + data + loja + horário (ignora canceladas). */
export async function findDuplicate(scope: Scope, i: Pick<TastingInput, "brandId" | "date" | "storeId" | "storeName" | "startTime">, exceptId?: string): Promise<{ id: string } | null> {
  const db = await getDb();
  const [d] = await db
    .select({ id: s.tastings.id })
    .from(s.tastings)
    .where(
      and(
        eq(s.tastings.agencyId, scope.agencyId),
        eq(s.tastings.brandId, i.brandId),
        eq(s.tastings.date, i.date),
        ne(s.tastings.status, "cancelled"),
        i.storeId ? eq(s.tastings.storeId, i.storeId) : sql`lower(${s.tastings.storeName}) = ${i.storeName.trim().toLowerCase()}`,
        i.startTime ? eq(s.tastings.startTime, i.startTime) : undefined,
        exceptId ? ne(s.tastings.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return d ?? null;
}

export async function saveTasting(scope: Scope, id: string | null, i: TastingInput, opts: { allowDuplicate?: boolean; batchId?: string | null; sample?: boolean } = {}): Promise<ActionResult & { id?: string; duplicateOf?: string }> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const bad = validateTasting(i);
  if (bad) return fail(bad);
  const db = await getDb();
  const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.id, i.brandId), eq(s.brands.agencyId, scope.agencyId)));
  if (!brand) return fail("Marca não encontrada.");
  if (i.storeId) {
    const [st] = await db.select({ id: s.stores.id }).from(s.stores).where(and(eq(s.stores.id, i.storeId), eq(s.stores.agencyId, scope.agencyId)));
    if (!st) return fail("Loja não encontrada.");
  }
  if (i.responsibleId) {
    const [u] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.id, i.responsibleId), eq(s.users.agencyId, scope.agencyId)));
    if (!u) return fail("Responsável não encontrado.");
  }
  if (!opts.allowDuplicate) {
    const dup = await findDuplicate(scope, i, id ?? undefined);
    if (dup) return { ok: false, error: "Já existe uma degustação desta marca nesta loja, data e horário.", duplicateOf: dup.id };
  }
  const values = { ...i, storeName: i.storeName.trim(), city: i.city.trim(), state: (i.state || "MG").toUpperCase().slice(0, 2), updatedAt: new Date(), updatedBy: scope.userId };
  if (id) {
    const [prev] = await db.select().from(s.tastings).where(and(eq(s.tastings.id, id), eq(s.tastings.agencyId, scope.agencyId)));
    if (!prev) return fail("Degustação não encontrada.");
    await db.transaction(async (tx) => {
      await tx.update(s.tastings).set(values).where(eq(s.tastings.id, id));
      // Mudou a marca: o checklist acompanha (mantém o que já foi marcado nos itens em comum).
      if (prev.brandId !== i.brandId) {
        const items = materialsFor(brand);
        await tx.delete(s.tastingMaterials).where(and(eq(s.tastingMaterials.tastingId, id), sql`${s.tastingMaterials.item} not in (${sql.join(items.map((x) => sql`${x}`), sql`, `)})`));
        await tx.insert(s.tastingMaterials).values(items.map((item) => ({ tastingId: id, item }))).onConflictDoNothing();
      }
      await audit(actor(scope), "tasting", id, "updated", { before: prev, after: values }, tx);
    });
    return { ok: true, message: "Degustação salva.", id };
  }
  const newId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(s.tastings).values({ ...values, id: newId, agencyId: scope.agencyId, batchId: opts.batchId ?? null, sample: opts.sample ?? false, docStatus: i.photoProof || i.requiredEvidence ? "pending" : "na", createdBy: scope.userId });
    const items = materialsFor(brand);
    if (items.length) await tx.insert(s.tastingMaterials).values(items.map((item) => ({ tastingId: newId, item })));
    await audit(actor(scope), "tasting", newId, "created", { after: { ...values, batchId: opts.batchId ?? null } }, tx);
  });
  return { ok: true, message: "Degustação cadastrada.", id: newId };
}

async function loadTasting(scope: Scope, id: string) {
  const db = await getDb();
  const [t] = await db.select().from(s.tastings).where(and(eq(s.tastings.id, id), eq(s.tastings.agencyId, scope.agencyId)));
  return t ?? null;
}

/** Seleciona a degustadora (a anterior, se havia, fica no histórico como substituída). */
export async function selectTaster(scope: Scope, id: string, tasterId: string): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const t = await loadTasting(scope, id);
  if (!t) return fail("Degustação não encontrada.");
  if (t.status === "completed" || t.status === "cancelled") return fail("Degustação já encerrada.");
  const db = await getDb();
  const [taster] = await db.select().from(s.tasters).where(and(eq(s.tasters.id, tasterId), eq(s.tasters.agencyId, scope.agencyId), eq(s.tasters.status, "active")));
  if (!taster) return fail("Degustadora não encontrada ou inativa.");
  if (t.tasterId === tasterId) return { ok: true };
  await db.transaction(async (tx) => {
    if (t.tasterId && t.contactStatus !== "unavailable" && t.contactStatus !== "no_answer" && t.contactStatus !== "replacement")
      await tx.insert(s.tastingContacts).values({ tastingId: id, tasterId: t.tasterId, status: "replacement", note: "Substituída por outra degustadora.", createdBy: scope.userId });
    await tx.insert(s.tastingContacts).values({ tastingId: id, tasterId, status: "not_contacted", createdBy: scope.userId });
    await tx
      .update(s.tastings)
      .set({ tasterId, contactStatus: "not_contacted", status: "awaiting_confirmation", tasterFee: t.tasterFee ?? taster.usualFee, updatedAt: new Date(), updatedBy: scope.userId })
      .where(eq(s.tastings.id, id));
    await audit(actor(scope), "tasting", id, "taster_selected", { before: { tasterId: t.tasterId }, after: { tasterId, name: taster.name } }, tx);
  });
  return { ok: true, message: `${taster.name} selecionada. Agora entre em contato pelo WhatsApp.` };
}

/** Situação do contato com a degustadora atual. Indisponível/sem retorno/substituição liberam outra escolha. */
export async function setContactStatus(scope: Scope, id: string, status: ContactStatus, note: string | null): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  if (!(CONTACT_STATUSES as readonly string[]).includes(status)) return fail("Situação inválida.");
  const t = await loadTasting(scope, id);
  if (!t) return fail("Degustação não encontrada.");
  if (!t.tasterId) return fail("Selecione a degustadora primeiro.");
  if (t.status === "completed" || t.status === "cancelled") return fail("Degustação já encerrada.");
  const lost = status === "unavailable" || status === "no_answer" || status === "replacement";
  const next: TastingStatus = status === "confirmed" ? "confirmed" : lost ? "awaiting_taster" : "awaiting_confirmation";
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.insert(s.tastingContacts).values({ tastingId: id, tasterId: t.tasterId!, status, note: note?.trim() || null, createdBy: scope.userId });
    await tx
      .update(s.tastings)
      .set({ contactStatus: lost ? "not_contacted" : status, status: next, tasterId: lost ? null : t.tasterId, updatedAt: new Date(), updatedBy: scope.userId })
      .where(eq(s.tastings.id, id));
    await audit(actor(scope), "tasting", id, "contact", { before: { contactStatus: t.contactStatus, status: t.status }, after: { contactStatus: status, status: next, tasterId: t.tasterId }, reason: note }, tx);
  });
  return { ok: true, message: lost ? "Registrado. Selecione outra degustadora." : "Situação do contato atualizada." };
}

/** Andamento do evento: em andamento, concluída (com data/hora) ou cancelada (motivo + multa opcional). */
export async function setTastingStatus(scope: Scope, id: string, status: TastingStatus, opts: { reason?: string | null; cancellationFee?: number | null } = {}): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  if (!(TASTING_STATUSES as readonly string[]).includes(status)) return fail("Situação inválida.");
  const t = await loadTasting(scope, id);
  if (!t) return fail("Degustação não encontrada.");
  if (status === "cancelled" && (opts.reason ?? "").trim().length < 3) return fail("Informe o motivo do cancelamento.");
  if ((status === "in_progress" || status === "completed") && !t.tasterId) return fail("Sem degustadora confirmada.");
  if (opts.cancellationFee !== undefined && opts.cancellationFee !== null && (opts.cancellationFee < 0 || !Number.isFinite(opts.cancellationFee))) return fail("Multa inválida.");
  const db = await getDb();
  const patch = {
    status,
    completedAt: status === "completed" ? (t.completedAt ?? new Date()) : t.completedAt,
    cancelReason: status === "cancelled" ? opts.reason!.trim() : null,
    cancellationFee: status === "cancelled" ? (opts.cancellationFee ?? null) : t.cancellationFee,
    updatedAt: new Date(),
    updatedBy: scope.userId,
  };
  await db.update(s.tastings).set(patch).where(eq(s.tastings.id, id));
  await audit(actor(scope), "tasting", id, "status", { before: { status: t.status }, after: { status, cancellationFee: patch.cancellationFee }, reason: opts.reason ?? null });
  return { ok: true, message: "Situação atualizada." };
}

export async function toggleMaterial(scope: Scope, id: string, item: string, checked: boolean): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const t = await loadTasting(scope, id);
  if (!t) return fail("Degustação não encontrada.");
  const db = await getDb();
  const r = await db
    .update(s.tastingMaterials)
    .set({ checked, checkedBy: checked ? scope.userId : null, checkedAt: checked ? new Date() : null })
    .where(and(eq(s.tastingMaterials.tastingId, id), eq(s.tastingMaterials.item, item)))
    .returning({ id: s.tastingMaterials.id });
  if (!r.length) return fail("Item não encontrado.");
  await audit(actor(scope), "tasting", id, checked ? "material_checked" : "material_unchecked", { after: { item } });
  return { ok: true };
}

export interface FinanceInput {
  revenueActual: number | null;
  taxesActual: number | null;
  tasterFeeActual: number | null;
  transportActual: number | null;
  foodActual: number | null;
  materialsCostActual: number | null;
  otherCostActual: number | null;
  docStatus: DocStatus;
  billingStatus: "not_billed" | "billed";
  billedAmount: number | null;
  receiptStatus: "pending" | "received";
  receivedAmount: number | null;
  receivedAt: string | null;
  tasterPaymentStatus: "pending" | "paid";
  paidAmount: number | null;
  paidAt: string | null;
}

/** Valores efetivos e situação de faturamento, recebimento e pagamento (nada é presumido: só o que for registrado). */
export async function saveFinance(scope: Scope, id: string, i: FinanceInput): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const t = await loadTasting(scope, id);
  if (!t) return fail("Degustação não encontrada.");
  for (const v of [i.revenueActual, i.taxesActual, i.tasterFeeActual, i.transportActual, i.foodActual, i.materialsCostActual, i.otherCostActual, i.billedAmount, i.receivedAmount, i.paidAmount])
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1_000_000)) return fail("Valor inválido.");
  for (const d of [i.receivedAt, i.paidAt]) if (d && !isIsoDate(d)) return fail("Data inválida.");
  if (i.receiptStatus === "received" && i.billingStatus !== "billed") return fail("Para registrar o recebimento, marque antes como faturada.");
  if (t.invoiceId && i.billingStatus === "not_billed") return fail("Esta degustação está numa fatura consolidada; ajuste pela fatura no Financeiro.");
  const db = await getDb();
  const patch = {
    ...i,
    billedAmount: i.billingStatus === "billed" ? i.billedAmount : null,
    receivedAmount: i.receiptStatus === "received" ? i.receivedAmount : null,
    receivedAt: i.receiptStatus === "received" ? (i.receivedAt ?? todayIso()) : null,
    paidAmount: i.tasterPaymentStatus === "paid" ? i.paidAmount : null,
    paidAt: i.tasterPaymentStatus === "paid" ? (i.paidAt ?? todayIso()) : null,
    updatedAt: new Date(),
    updatedBy: scope.userId,
  };
  await db.update(s.tastings).set(patch).where(eq(s.tastings.id, id));
  await audit(actor(scope), "tasting", id, "finance", { before: t, after: patch });
  return { ok: true, message: "Financeiro da degustação salvo." };
}

// ───────────────────────────── Leitura ─────────────────────────────

export interface TastingFilters {
  from: string;
  to: string;
  brand?: string | null;
  city?: string | null;
  store?: string | null;
  taster?: string | null;
  status?: string | null;
  flag?: string | null;
}

export interface TastingRow {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  brandId: string;
  brandName: string;
  storeName: string;
  chainName: string | null;
  city: string;
  product: string | null;
  status: TastingStatus;
  contactStatus: ContactStatus;
  docStatus: DocStatus;
  tasterId: string | null;
  tasterName: string | null;
  billingStatus: string;
  receiptStatus: string;
  tasterPaymentStatus: string;
  billedAmount: number | null;
  receivedAmount: number | null;
  paidAmount: number | null;
  invoiceId: string | null;
  materials: MaterialsState;
  planned: TastingResult;
  actual: TastingResult;
  /** Receita que conta (cancelada = só multa registrada). */
  revenueCounted: number;
  pendingFinance: boolean;
  sample: boolean;
}

export async function listTastings(scope: Scope, f: TastingFilters): Promise<TastingRow[]> {
  const db = await getDb();
  const like = (v: string) => `%${v.trim()}%`;
  const rows = await db
    .select({ t: s.tastings, brandName: s.brands.name, tasterName: s.tasters.name })
    .from(s.tastings)
    .innerJoin(s.brands, eq(s.brands.id, s.tastings.brandId))
    .leftJoin(s.tasters, eq(s.tasters.id, s.tastings.tasterId))
    .where(
      and(
        eq(s.tastings.agencyId, scope.agencyId),
        gte(s.tastings.date, f.from),
        lte(s.tastings.date, f.to),
        brandFilter(scope, s.tastings.brandId),
        f.brand ? eq(s.tastings.brandId, f.brand) : undefined,
        f.city ? ilike(s.tastings.city, like(f.city)) : undefined,
        f.store ? or(ilike(s.tastings.storeName, like(f.store)), ilike(s.tastings.chainName, like(f.store))) : undefined,
        f.taster ? eq(s.tastings.tasterId, f.taster) : undefined,
        f.status && (TASTING_STATUSES as readonly string[]).includes(f.status) ? eq(s.tastings.status, f.status as TastingStatus) : undefined,
      ),
    )
    .orderBy(asc(s.tastings.date), asc(s.tastings.startTime), asc(s.tastings.storeName));
  const ids = rows.map((r) => r.t.id);
  const mats = ids.length ? await db.select({ tastingId: s.tastingMaterials.tastingId, checked: s.tastingMaterials.checked }).from(s.tastingMaterials).where(inArray(s.tastingMaterials.tastingId, ids)) : [];
  const out = rows.map(({ t, brandName, tasterName }) => toRow(t, brandName, tasterName, mats.filter((m) => m.tastingId === t.id)));
  const flag = f.flag as TastingFlag | null | undefined;
  if (flag === "pending_materials") return out.filter((r) => r.status !== "cancelled" && r.status !== "completed" && (r.materials === "pending" || r.materials === "partial"));
  return flag === "pending_docs" ? out.filter((r) => r.docStatus === "pending" && r.status !== "cancelled") : flag === "pending_finance" ? out.filter((r) => r.pendingFinance) : out;
}

type TastingRecord = typeof s.tastings.$inferSelect;
export function plannedMoney(t: TastingRecord): TastingMoney {
  return { revenue: t.revenue, taxes: t.taxes, tasterFee: t.tasterFee, transport: t.transport, food: t.food, materialsCost: t.materialsCost, otherCost: t.otherCost };
}
export function actualOf(t: TastingRecord): TastingMoney {
  return actualMoney(plannedMoney(t), {
    revenue: t.revenueActual,
    taxes: t.taxesActual,
    tasterFee: t.tasterFeeActual,
    transport: t.transportActual,
    food: t.foodActual,
    materialsCost: t.materialsCostActual,
    otherCost: t.otherCostActual,
  });
}

function toRow(t: TastingRecord, brandName: string, tasterName: string | null, mats: { checked: boolean }[]): TastingRow {
  const planned = tastingResult(plannedMoney(t));
  const actual = tastingResult(actualOf(t));
  const pendingFinance = t.status === "completed" && (t.billingStatus === "not_billed" || t.receiptStatus === "pending" || t.tasterPaymentStatus === "pending");
  return {
    id: t.id,
    date: t.date,
    startTime: t.startTime,
    endTime: t.endTime,
    brandId: t.brandId,
    brandName,
    storeName: t.storeName,
    chainName: t.chainName,
    city: t.city,
    product: t.product,
    status: t.status,
    contactStatus: t.contactStatus,
    docStatus: t.docStatus,
    tasterId: t.tasterId,
    tasterName,
    billingStatus: t.billingStatus,
    receiptStatus: t.receiptStatus,
    tasterPaymentStatus: t.tasterPaymentStatus,
    billedAmount: t.billedAmount,
    receivedAmount: t.receivedAmount,
    paidAmount: t.paidAmount,
    invoiceId: t.invoiceId,
    materials: materialsState(mats),
    planned,
    actual,
    revenueCounted: countedRevenue(t.status, t.status === "completed" ? actual.revenue : planned.revenue, t.cancellationFee),
    pendingFinance,
    sample: t.sample,
  };
}

export async function getTasting(scope: Scope, id: string) {
  const db = await getDb();
  const [r] = await db
    .select({ t: s.tastings, brand: s.brands, taster: s.tasters, responsible: s.users.name })
    .from(s.tastings)
    .innerJoin(s.brands, eq(s.brands.id, s.tastings.brandId))
    .leftJoin(s.tasters, eq(s.tasters.id, s.tastings.tasterId))
    .leftJoin(s.users, eq(s.users.id, s.tastings.responsibleId))
    .where(and(eq(s.tastings.id, id), eq(s.tastings.agencyId, scope.agencyId), brandFilter(scope, s.tastings.brandId)));
  if (!r) return null;
  const [materials, contacts, files, history, invoice] = await Promise.all([
    db.select().from(s.tastingMaterials).where(eq(s.tastingMaterials.tastingId, id)).orderBy(asc(s.tastingMaterials.item)),
    db
      .select({ c: s.tastingContacts, name: s.tasters.name, phone: s.tasters.phone, by: s.users.name })
      .from(s.tastingContacts)
      .innerJoin(s.tasters, eq(s.tasters.id, s.tastingContacts.tasterId))
      .leftJoin(s.users, eq(s.users.id, s.tastingContacts.createdBy))
      .where(eq(s.tastingContacts.tastingId, id))
      .orderBy(desc(s.tastingContacts.createdAt)),
    db
      .select()
      .from(s.tastingFiles)
      .where(and(eq(s.tastingFiles.agencyId, scope.agencyId), r.t.batchId ? or(eq(s.tastingFiles.tastingId, id), eq(s.tastingFiles.batchId, r.t.batchId)) : eq(s.tastingFiles.tastingId, id)))
      .orderBy(desc(s.tastingFiles.createdAt)),
    db
      .select({ a: s.auditLogs, by: s.users.name })
      .from(s.auditLogs)
      .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
      .where(and(eq(s.auditLogs.agencyId, scope.agencyId), eq(s.auditLogs.entity, "tasting"), eq(s.auditLogs.entityId, id)))
      .orderBy(desc(s.auditLogs.createdAt))
      .limit(80),
    r.t.invoiceId ? db.select().from(s.tastingInvoices).where(eq(s.tastingInvoices.id, r.t.invoiceId)).then((x) => x[0] ?? null) : Promise.resolve(null),
  ]);
  return {
    tasting: r.t,
    brand: r.brand,
    taster: r.taster,
    responsibleName: r.responsible,
    materials,
    contacts,
    files,
    history,
    invoice,
    planned: tastingResult(plannedMoney(r.t)),
    actual: tastingResult(actualOf(r.t)),
  };
}

/** Degustadoras para a escolha: primeiro as da cidade do evento, com o que já têm marcado no dia. */
export async function tasterOptions(scope: Scope, city: string, date: string) {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.tasters.id,
      name: s.tasters.name,
      phone: s.tasters.phone,
      city: s.tasters.city,
      region: s.tasters.region,
      availability: s.tasters.availability,
      usualFee: s.tasters.usualFee,
      busy: sql<number>`(select count(*)::int from ${s.tastings} x where x.taster_id = "tasters"."id" and x.date = ${date} and x.status not in ('cancelled'))`,
    })
    .from(s.tasters)
    .where(and(eq(s.tasters.agencyId, scope.agencyId), eq(s.tasters.status, "active")))
    .orderBy(asc(s.tasters.name));
  const norm = (v: string | null) => (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return rows.map((r) => ({ ...r, sameCity: norm(r.city) === norm(city) })).sort((a, b) => Number(b.sameCity) - Number(a.sameCity) || a.name.localeCompare(b.name, "pt-BR"));
}

// ───────────────────────────── Anexos ─────────────────────────────

const MAX_FILE = 15 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|heic)|application\/pdf|text\/csv|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation)|application\/vnd\.ms-excel|application\/msword)$/;

export async function addTastingFile(scope: Scope, target: { tastingId?: string | null; batchId?: string | null }, kind: TastingFileKind, file: File): Promise<ActionResult & { id?: string }> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  if (!(FILE_KINDS as readonly string[]).includes(kind)) return fail("Tipo de anexo inválido.");
  if (!file.size) return fail("Arquivo vazio.");
  if (file.size > MAX_FILE) return fail("Arquivo maior que 15 MB.");
  const type = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.test(type)) return fail("Formato não aceito (use PDF, imagem, planilha ou documento).");
  const db = await getDb();
  if (target.tastingId && !(await loadTasting(scope, target.tastingId))) return fail("Degustação não encontrada.");
  const id = randomUUID();
  const safe = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "arquivo";
  const [y, m] = todayIso().split("-");
  const key = `${scope.agencyId}/degustacoes/${y}/${m}/${id}-${safe}`;
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), type);
  await db.insert(s.tastingFiles).values({ id, agencyId: scope.agencyId, tastingId: target.tastingId ?? null, batchId: target.batchId ?? null, kind, name: file.name.slice(0, 200), storageKey: key, contentType: type, bytes: file.size, createdBy: scope.userId });
  if (target.tastingId) await audit(actor(scope), "tasting", target.tastingId, "file_added", { after: { kind, name: file.name } });
  return { ok: true, message: "Arquivo anexado.", id };
}

export async function readTastingFile(scope: Scope, id: string) {
  const db = await getDb();
  const [f] = await db.select().from(s.tastingFiles).where(and(eq(s.tastingFiles.id, id), eq(s.tastingFiles.agencyId, scope.agencyId)));
  if (!f) return null;
  const bytes = await storage().get(f.storageKey);
  return bytes ? { file: f, bytes } : null;
}

// ───────────────────────────── Painel do menu Degustações ─────────────────────────────

export async function tastingDashboard(scope: Scope, from: string, to: string) {
  const rows = await listTastings(scope, { from, to });
  const live = rows.filter((r) => r.status !== "cancelled");
  const confirmedSet = rows.filter((r) => r.status === "confirmed" || r.status === "in_progress" || r.status === "completed");
  const done = rows.filter((r) => r.status === "completed");
  const sum = (list: TastingRow[], f: (r: TastingRow) => number) => Math.round(list.reduce((t, r) => t + f(r), 0) * 100) / 100;
  return {
    rows,
    ops: {
      total: rows.length,
      confirmed: rows.filter((r) => r.status === "confirmed").length,
      awaitingConfirmation: rows.filter((r) => r.status === "awaiting_confirmation").length,
      noTaster: rows.filter((r) => r.status === "awaiting_taster").length,
      completed: done.length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      materialsPending: live.filter((r) => r.status !== "completed" && (r.materials === "pending" || r.materials === "partial")).length,
      docsPending: live.filter((r) => r.docStatus === "pending").length,
    },
    fin: {
      revenuePlanned: sum(live, (r) => r.planned.revenue),
      revenueConfirmed: sum(confirmedSet, (r) => r.planned.revenue),
      tasterCostPlanned: sum(live, (r) => r.planned.tasterCost),
      otherCostPlanned: sum(live, (r) => r.planned.otherCosts),
      contributionPlanned: sum(live, (r) => r.planned.contribution),
      cancellationFees: sum(rows.filter((r) => r.status === "cancelled"), (r) => r.revenueCounted),
      billed: sum(rows, (r) => (r.billingStatus === "billed" ? (r.billedAmount ?? r.actual.revenue) : 0)),
      received: sum(rows, (r) => (r.receiptStatus === "received" ? (r.receivedAmount ?? 0) : 0)),
      toReceive: sum(rows, (r) => (r.billingStatus === "billed" && r.receiptStatus !== "received" ? (r.billedAmount ?? r.actual.revenue) : 0)),
      tasterPending: sum(done, (r) => (r.tasterPaymentStatus === "paid" ? 0 : r.actual.tasterCost)),
      tasterPaid: sum(rows, (r) => (r.tasterPaymentStatus === "paid" ? (r.paidAmount ?? 0) : 0)),
      contributionActual: sum(done, (r) => r.actual.contribution),
      revenueActual: sum(done, (r) => r.actual.revenue),
    },
  };
}

// ───────────────────────────── Dados de exemplo ─────────────────────────────

/** Remove TUDO o que foi criado como exemplo (degustações, degustadoras e faturas marcadas como exemplo). */
export async function deleteSamples(scope: Scope): Promise<ActionResult> {
  if (!canManageTastings(scope)) return fail("Sem permissão.");
  const db = await getDb();
  const ids = (await db.select({ id: s.tastings.id }).from(s.tastings).where(and(eq(s.tastings.agencyId, scope.agencyId), eq(s.tastings.sample, true)))).map((r) => r.id);
  await db.transaction(async (tx) => {
    if (ids.length) {
      await tx.delete(s.tastingMaterials).where(inArray(s.tastingMaterials.tastingId, ids));
      await tx.delete(s.tastingContacts).where(inArray(s.tastingContacts.tastingId, ids));
      await tx.update(s.tastingFiles).set({ tastingId: null }).where(inArray(s.tastingFiles.tastingId, ids));
      await tx.delete(s.tastings).where(inArray(s.tastings.id, ids));
    }
    await tx.delete(s.tastingInvoices).where(and(eq(s.tastingInvoices.agencyId, scope.agencyId), eq(s.tastingInvoices.sample, true)));
    const sampleTasters = (await tx.select({ id: s.tasters.id }).from(s.tasters).where(and(eq(s.tasters.agencyId, scope.agencyId), eq(s.tasters.sample, true)))).map((r) => r.id);
    if (sampleTasters.length) {
      await tx.delete(s.tastingContacts).where(inArray(s.tastingContacts.tasterId, sampleTasters));
      await tx.update(s.tastings).set({ tasterId: null }).where(inArray(s.tastings.tasterId, sampleTasters));
      await tx.delete(s.tasters).where(inArray(s.tasters.id, sampleTasters));
    }
    await audit(actor(scope), "tasting", "exemplos", "samples_deleted", { after: { tastings: ids.length } }, tx);
  });
  return { ok: true, message: `Dados de exemplo apagados (${ids.length} degustações).` };
}

export function monthRange(month: string | null | undefined): { from: string; to: string; month: string } {
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : todayIso().slice(0, 7);
  const from = `${m}-01`;
  const to = addDays(`${addDays(from, 31).slice(0, 7)}-01`, -1);
  return { from, to, month: m };
}



/** Opções do formulário: marcas, lojas cadastradas e responsáveis internos. */
export async function tastingFormOptions(scope: Scope) {
  const db = await getDb();
  const [brands, stores, users] = await Promise.all([
    db.select({ id: s.brands.id, name: s.brands.name, code: s.brands.code }).from(s.brands).where(and(eq(s.brands.agencyId, scope.agencyId), eq(s.brands.status, "active"))).orderBy(asc(s.brands.name)),
    db
      .select({ id: s.stores.id, name: s.stores.name, chain: s.chains.name, city: s.stores.city, state: s.stores.state })
      .from(s.stores)
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .where(and(eq(s.stores.agencyId, scope.agencyId), eq(s.stores.status, "active")))
      .orderBy(asc(s.stores.name)),
    db
      .select({ id: s.users.id, name: s.users.name })
      .from(s.users)
      .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.status, "active"), inArray(s.users.role, ["admin", "manager"])))
      .orderBy(asc(s.users.name)),
  ]);
  return { brands, stores, users };
}
