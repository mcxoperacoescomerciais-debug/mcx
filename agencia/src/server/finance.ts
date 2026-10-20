/**
 * Financeiro da agência: DRE gerencial do mês (resultado de contribuição) com
 * PROMOTORIA (receita contratada por marca × custo com promotores, calculado como
 * na planilha: VR ATEND × visitas feitas ÷ meta do mês) e DEGUSTAÇÕES (receita e
 * custos de cada evento). Faturas juntam várias degustações sem contar a receita
 * duas vezes: a receita é sempre a da degustação; a fatura só registra a cobrança.
 */
import "server-only";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { brandFilter, promoterFilter } from "./scope";
import type { ActionResult } from "./manager";
import { canManageTastings, listTastings, monthRange, type TastingRow } from "./tastings";
import { addDays, isIsoDate, todayIso } from "@/lib/dates";
import type { TargetPeriod } from "@/lib/portfolio";

const fail = (error: string): ActionResult => ({ ok: false, error });
const r2 = (v: number) => Math.round(v * 100) / 100;

export function canSeeFinance(scope: Scope): boolean {
  return scope.role === "admin" && scope.brandIds === null;
}

/** Meta do MÊS de uma atribuição (como na planilha: 2x/semana = 8, quinzenal = 2, 1x/semana = 4). */
export function monthlyMeta(perWeek: number, period: TargetPeriod): number {
  return period === "week" ? perWeek * 4 : period === "fortnight" ? perWeek * 2 : perWeek;
}

export interface PayrollRow {
  promoterId: string;
  promoterName: string;
  brandId: string;
  brandName: string;
  stores: number;
  visits: number;
  meta: number;
  /** % cumprimento (pode passar de 100%, como na planilha). */
  pct: number | null;
  /** Soma do VR ATEND das lojas. */
  value: number;
  /** A pagar = Σ VR ATEND × feitas ÷ meta de cada loja. */
  toPay: number;
  /** Lojas sem VR ATEND cadastrado (não entram no a pagar). */
  missingValue: number;
}

/** Custo com promotores no mês (RESUMO da planilha), a partir das visitas registradas no sistema. */
export async function promoterPayroll(scope: Scope, month: string) {
  const { from, to } = monthRange(month);
  const db = await getDb();
  const targets = await db
    .select({
      promoterId: s.visitTargets.promoterId,
      promoterName: s.users.name,
      storeId: s.visitTargets.storeId,
      brandId: s.visitTargets.brandId,
      brandName: s.brands.name,
      perWeek: s.visitTargets.perWeek,
      period: s.visitTargets.period,
      payValue: s.visitTargets.payValue,
    })
    .from(s.visitTargets)
    .innerJoin(s.users, eq(s.users.id, s.visitTargets.promoterId))
    .innerJoin(s.brands, eq(s.brands.id, s.visitTargets.brandId))
    .where(and(eq(s.visitTargets.agencyId, scope.agencyId), brandFilter(scope, s.visitTargets.brandId), promoterFilter(scope, s.visitTargets.promoterId)));
  const done = targets.length
    ? await db
        .select({ promoterId: s.visits.promoterId, storeId: s.visits.storeId, brandId: s.attendances.brandId, n: sql<number>`count(*)::int` })
        .from(s.attendances)
        .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
        .where(and(eq(s.visits.agencyId, scope.agencyId), gte(s.visits.visitDate, from), lte(s.visits.visitDate, to), inArray(s.attendances.status, ["completed", "correction_requested"])))
        .groupBy(s.visits.promoterId, s.visits.storeId, s.attendances.brandId)
    : [];
  const doneBy = new Map(done.map((d) => [`${d.promoterId}:${d.storeId}:${d.brandId}`, d.n]));
  const groups = new Map<string, PayrollRow>();
  for (const t of targets) {
    const k = `${t.promoterId}:${t.brandId}`;
    const g = groups.get(k) ?? { promoterId: t.promoterId, promoterName: t.promoterName, brandId: t.brandId, brandName: t.brandName, stores: 0, visits: 0, meta: 0, pct: null, value: 0, toPay: 0, missingValue: 0 };
    const meta = monthlyMeta(t.perWeek, t.period);
    const n = doneBy.get(`${t.promoterId}:${t.storeId}:${t.brandId}`) ?? 0;
    g.stores++;
    g.visits += n;
    g.meta += meta;
    if (t.payValue === null) g.missingValue++;
    else {
      g.value += t.payValue;
      g.toPay += meta ? (t.payValue * n) / meta : 0;
    }
    groups.set(k, g);
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, value: r2(g.value), toPay: r2(g.toPay), pct: g.meta ? Math.round((g.visits / g.meta) * 1000) / 10 : null }))
    .sort((a, b) => a.promoterName.localeCompare(b.promoterName, "pt-BR") || a.brandName.localeCompare(b.brandName, "pt-BR"));
  return { from, to, rows, total: r2(rows.reduce((t, r) => t + r.toPay, 0)), missing: rows.reduce((t, r) => t + r.missingValue, 0) };
}

/** Receita contratada de promotoria (valor mensal por marca). */
export async function brandFees(scope: Scope) {
  const db = await getDb();
  return db
    .select({ id: s.brands.id, name: s.brands.name, monthlyFee: s.brands.monthlyFee })
    .from(s.brands)
    .where(and(eq(s.brands.agencyId, scope.agencyId), eq(s.brands.status, "active"), brandFilter(scope, s.brands.id)))
    .orderBy(asc(s.brands.name));
}

export async function saveBrandFee(scope: Scope, brandId: string, fee: number | null): Promise<ActionResult> {
  if (!canSeeFinance(scope)) return fail("Sem permissão.");
  if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 10_000_000)) return fail("Valor inválido.");
  const db = await getDb();
  const [b] = await db.select().from(s.brands).where(and(eq(s.brands.id, brandId), eq(s.brands.agencyId, scope.agencyId)));
  if (!b) return fail("Marca não encontrada.");
  await db.update(s.brands).set({ monthlyFee: fee, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.brands.id, brandId));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "brand", brandId, "monthly_fee", { before: { monthlyFee: b.monthlyFee }, after: { monthlyFee: fee } });
  return { ok: true, message: "Valor mensal salvo." };
}

/** VR ATEND de cada loja × marca do promotor (o que a planilha paga com a meta cheia). */
export async function saveTargetPayValue(scope: Scope, targetId: string, value: number | null): Promise<ActionResult> {
  if (!canSeeFinance(scope)) return fail("Sem permissão.");
  if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1_000_000)) return fail("Valor inválido.");
  const db = await getDb();
  const r = await db.update(s.visitTargets).set({ payValue: value, updatedAt: new Date(), updatedBy: scope.userId }).where(and(eq(s.visitTargets.id, targetId), eq(s.visitTargets.agencyId, scope.agencyId))).returning({ id: s.visitTargets.id });
  return r.length ? { ok: true } : fail("Atribuição não encontrada.");
}

// ───────────────────────────── Degustações no financeiro ─────────────────────────────

export interface TastingFinance {
  count: number;
  revenue: number;
  taxes: number;
  tasterCost: number;
  otherCosts: number;
  contribution: number;
  margin: number | null;
  billed: number;
  received: number;
  toReceive: number;
  paid: number;
  toPay: number;
}

/**
 * Por competência (data da degustação): concluídas pelo realizado; programadas pelo
 * previsto; canceladas só com a multa registrada.
 */
export function tastingFinance(rows: TastingRow[]): TastingFinance {
  let revenue = 0, taxes = 0, tasterCost = 0, otherCosts = 0, billed = 0, received = 0, toReceive = 0, paid = 0, toPay = 0;
  for (const r of rows) {
    const m = r.status === "completed" ? r.actual : r.planned;
    if (r.status === "cancelled") {
      revenue += r.revenueCounted;
    } else {
      revenue += m.revenue;
      taxes += m.taxes;
      tasterCost += m.tasterCost;
      otherCosts += m.otherCosts;
    }
    if (r.billingStatus === "billed") {
      const b = r.billedAmount ?? m.revenue;
      billed += b;
      if (r.receiptStatus === "received") received += r.receivedAmount ?? b;
      else toReceive += b;
    }
    if (r.tasterPaymentStatus === "paid") paid += r.paidAmount ?? m.tasterCost;
    else if (r.status === "completed") toPay += m.tasterCost;
  }
  const contribution = revenue - tasterCost - otherCosts;
  return {
    count: rows.length,
    revenue: r2(revenue),
    taxes: r2(taxes),
    tasterCost: r2(tasterCost),
    otherCosts: r2(otherCosts),
    contribution: r2(contribution),
    margin: revenue > 0 ? Math.round((contribution / revenue) * 1000) / 10 : null,
    billed: r2(billed),
    received: r2(received),
    toReceive: r2(toReceive),
    paid: r2(paid),
    toPay: r2(toPay),
  };
}

/** DRE gerencial do mês + degustações por marca + comparação dos últimos 6 meses. */
export async function financeOverview(scope: Scope, month: string) {
  const { from, to, month: m } = monthRange(month);
  const [tastingRows, payroll, fees] = await Promise.all([listTastings(scope, { from, to }), promoterPayroll(scope, m), brandFees(scope)]);
  const tastings = tastingFinance(tastingRows);
  const promotoriaRevenue = r2(fees.reduce((t, b) => t + (b.monthlyFee ?? 0), 0));
  const revenue = r2(promotoriaRevenue + tastings.revenue);
  const directCosts = r2(payroll.total + tastings.tasterCost + tastings.otherCosts);
  const contribution = r2(revenue - tastings.taxes - directCosts);

  const byBrand = new Map<string, { brandId: string; brandName: string; rows: TastingRow[] }>();
  for (const r of tastingRows) {
    const g = byBrand.get(r.brandId) ?? { brandId: r.brandId, brandName: r.brandName, rows: [] };
    g.rows.push(r);
    byBrand.set(r.brandId, g);
  }
  const brands = [...byBrand.values()].map((g) => ({ brandId: g.brandId, brandName: g.brandName, ...tastingFinance(g.rows) })).sort((a, b) => b.contribution - a.contribution);

  // Comparação mensal (degustações + promotoria contratada; folha só do mês aberto para não pesar).
  const months: { month: string; revenue: number; costs: number; contribution: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const mm = shiftMonth(m, -i);
    const range = monthRange(mm);
    const rows = mm === m ? tastingRows : await listTastings(scope, range);
    const f = tastingFinance(rows);
    months.push({ month: mm, revenue: f.revenue, costs: r2(f.tasterCost + f.otherCosts), contribution: f.contribution, count: f.count });
  }

  return {
    from,
    to,
    month: m,
    dre: { promotoriaRevenue, tastingRevenue: tastings.revenue, revenue, taxes: tastings.taxes, promoterCost: payroll.total, tasterCost: tastings.tasterCost, tastingOtherCosts: tastings.otherCosts, directCosts, contribution, margin: revenue > 0 ? Math.round((contribution / revenue) * 1000) / 10 : null },
    tastings,
    brands,
    months,
    payroll,
    fees,
  };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ───────────────────────────── Faturas ─────────────────────────────

export async function listInvoices(scope: Scope, from: string, to: string) {
  const db = await getDb();
  const rows = await db
    .select({ i: s.tastingInvoices, brandName: s.brands.name, count: sql<number>`(select count(*)::int from ${s.tastings} t where t.invoice_id = ${s.tastingInvoices.id})` })
    .from(s.tastingInvoices)
    .innerJoin(s.brands, eq(s.brands.id, s.tastingInvoices.brandId))
    .where(and(eq(s.tastingInvoices.agencyId, scope.agencyId), gte(s.tastingInvoices.issueDate, from), lte(s.tastingInvoices.issueDate, to)))
    .orderBy(asc(s.tastingInvoices.issueDate));
  return rows.map((r) => ({ ...r.i, brandName: r.brandName, count: r.count }));
}

/** Degustações concluídas e ainda não faturadas (candidatas a uma fatura consolidada). */
export async function unbilledTastings(scope: Scope) {
  const rows = await listTastings(scope, { from: addDays(todayIso(), -365), to: addDays(todayIso(), 60) });
  return rows.filter((r) => r.status === "completed" && r.billingStatus === "not_billed");
}

export async function createInvoice(scope: Scope, i: { brandId: string; tastingIds: string[]; number: string | null; issueDate: string; dueDate: string | null; notes: string | null }, opts: { sample?: boolean } = {}): Promise<ActionResult & { id?: string }> {
  if (!canManageTastings(scope) || !canSeeFinance(scope)) return fail("Sem permissão.");
  if (!i.tastingIds.length) return fail("Escolha as degustações da fatura.");
  if (!isIsoDate(i.issueDate) || (i.dueDate && !isIsoDate(i.dueDate))) return fail("Data inválida.");
  const db = await getDb();
  const list = await db.select().from(s.tastings).where(and(eq(s.tastings.agencyId, scope.agencyId), inArray(s.tastings.id, i.tastingIds)));
  if (list.length !== i.tastingIds.length) return fail("Degustação não encontrada.");
  if (list.some((t) => t.brandId !== i.brandId)) return fail("Uma fatura junta degustações de uma única marca.");
  if (list.some((t) => t.billingStatus === "billed" || t.invoiceId)) return fail("Uma das degustações já foi faturada (não pode entrar em duas cobranças).");
  if (list.some((t) => t.status !== "completed" && t.status !== "cancelled")) return fail("Fature só degustações concluídas (ou canceladas com multa).");
  const valueOf = (t: (typeof list)[number]) => (t.status === "cancelled" ? (t.cancellationFee ?? 0) : (t.revenueActual ?? t.revenue ?? 0));
  const amount = r2(list.reduce((sum, t) => sum + valueOf(t), 0));
  if (amount <= 0) return fail("As degustações escolhidas não têm valor a cobrar.");
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(s.tastingInvoices).values({ id, agencyId: scope.agencyId, brandId: i.brandId, number: i.number?.trim() || null, issueDate: i.issueDate, dueDate: i.dueDate, amount, notes: i.notes, sample: opts.sample ?? false, createdBy: scope.userId, updatedBy: scope.userId });
    for (const t of list) await tx.update(s.tastings).set({ invoiceId: id, billingStatus: "billed", billedAmount: valueOf(t), updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.tastings.id, t.id));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_invoice", id, "created", { after: { ...i, amount } }, tx);
  });
  return { ok: true, message: "Fatura registrada.", id };
}

/** Recebimento da fatura: as degustações dela ficam recebidas (valor de cada uma). */
export async function receiveInvoice(scope: Scope, id: string, receivedAt: string, amount: number | null): Promise<ActionResult> {
  if (!canSeeFinance(scope)) return fail("Sem permissão.");
  if (!isIsoDate(receivedAt)) return fail("Data inválida.");
  const db = await getDb();
  const [inv] = await db.select().from(s.tastingInvoices).where(and(eq(s.tastingInvoices.id, id), eq(s.tastingInvoices.agencyId, scope.agencyId)));
  if (!inv) return fail("Fatura não encontrada.");
  if (inv.status !== "issued") return fail("Fatura já recebida ou cancelada.");
  const value = amount ?? inv.amount;
  if (!Number.isFinite(value) || value < 0) return fail("Valor inválido.");
  await db.transaction(async (tx) => {
    await tx.update(s.tastingInvoices).set({ status: "received", receivedAmount: value, receivedAt, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.tastingInvoices.id, id));
    // Recebido parcial: distribui proporcionalmente ao valor de cada degustação.
    const ratio = inv.amount > 0 ? value / inv.amount : 0;
    const list = await tx.select().from(s.tastings).where(eq(s.tastings.invoiceId, id));
    for (const t of list) await tx.update(s.tastings).set({ receiptStatus: "received", receivedAmount: r2((t.billedAmount ?? 0) * ratio), receivedAt, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.tastings.id, t.id));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_invoice", id, "received", { after: { value, receivedAt } }, tx);
  });
  return { ok: true, message: "Recebimento registrado." };
}

/** Cancela a fatura: as degustações voltam a "não faturada". */
export async function cancelInvoice(scope: Scope, id: string): Promise<ActionResult> {
  if (!canSeeFinance(scope)) return fail("Sem permissão.");
  const db = await getDb();
  const [inv] = await db.select().from(s.tastingInvoices).where(and(eq(s.tastingInvoices.id, id), eq(s.tastingInvoices.agencyId, scope.agencyId)));
  if (!inv) return fail("Fatura não encontrada.");
  if (inv.status === "received") return fail("Fatura já recebida.");
  await db.transaction(async (tx) => {
    await tx.update(s.tastings).set({ invoiceId: null, billingStatus: "not_billed", billedAmount: null, receiptStatus: "pending", receivedAmount: null, receivedAt: null, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.tastings.invoiceId, id));
    await tx.update(s.tastingInvoices).set({ status: "cancelled", updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.tastingInvoices.id, id));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_invoice", id, "cancelled", {}, tx);
  });
  return { ok: true, message: "Fatura cancelada." };
}
