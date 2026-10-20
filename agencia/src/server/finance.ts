/**
 * Financeiro da agência: DRE gerencial do mês (previsto × realizado) com
 * PROMOTORIA — receita = VR ATEND de cada loja × marca (meta cheia no previsto;
 * VR ATEND × visitas feitas ÷ meta do mês no realizado, como o "A PAGAR" da
 * planilha) e FOLHA DE PAGAMENTO (custo mensal de cada promotor ativo) — e
 * DEGUSTAÇÕES (receita e custos de cada evento). Faturas juntam várias
 * degustações sem contar a receita duas vezes.
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
import { promoterCost, type PromoterCost } from "@/lib/promoter-cost";

const fail = (error: string): ActionResult => ({ ok: false, error });
const r2 = (v: number) => Math.round(v * 100) / 100;

export function canSeeFinance(scope: Scope): boolean {
  return scope.role === "admin" && scope.brandIds === null;
}

/** Meta do MÊS de uma atribuição (como na planilha: 2x/semana = 8, quinzenal = 2, 1x/semana = 4). */
export function monthlyMeta(perWeek: number, period: TargetPeriod): number {
  return period === "week" ? perWeek * 4 : period === "fortnight" ? perWeek * 2 : perWeek;
}

export interface RevenueRow {
  promoterId: string;
  promoterName: string;
  brandId: string;
  brandName: string;
  stores: number;
  visits: number;
  meta: number;
  /** % cumprimento (pode passar de 100%, como na planilha). */
  pct: number | null;
  /** Previsto: soma do VR ATEND das lojas (meta cheia). */
  planned: number;
  /** Realizado: Σ VR ATEND × feitas ÷ meta de cada loja. */
  realized: number;
  /** Lojas sem VR ATEND cadastrado (não entram na receita). */
  missingValue: number;
}

/** Receita de promotoria do mês (RESUMO da planilha), a partir das atribuições e das visitas registradas. */
export async function promotoriaRevenue(scope: Scope, month: string) {
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
    .innerJoin(s.users, and(eq(s.users.id, s.visitTargets.promoterId), eq(s.users.status, "active")))
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
  const groups = new Map<string, RevenueRow>();
  for (const t of targets) {
    const k = `${t.promoterId}:${t.brandId}`;
    const g = groups.get(k) ?? { promoterId: t.promoterId, promoterName: t.promoterName, brandId: t.brandId, brandName: t.brandName, stores: 0, visits: 0, meta: 0, pct: null, planned: 0, realized: 0, missingValue: 0 };
    const meta = monthlyMeta(t.perWeek, t.period);
    const n = doneBy.get(`${t.promoterId}:${t.storeId}:${t.brandId}`) ?? 0;
    g.stores++;
    g.visits += n;
    g.meta += meta;
    if (t.payValue === null) g.missingValue++;
    else {
      g.planned += t.payValue;
      g.realized += meta ? (t.payValue * n) / meta : 0;
    }
    groups.set(k, g);
  }
  const rows = [...groups.values()]
    .map((g) => ({ ...g, planned: r2(g.planned), realized: r2(g.realized), pct: g.meta ? Math.round((g.visits / g.meta) * 1000) / 10 : null }))
    .sort((a, b) => a.promoterName.localeCompare(b.promoterName, "pt-BR") || a.brandName.localeCompare(b.brandName, "pt-BR"));
  // Por marca (para a marca: quanto vale o contrato no mês e quanto já foi cumprido).
  const byBrand = new Map<string, { brandId: string; brandName: string; stores: number; planned: number; realized: number; visits: number; meta: number }>();
  for (const r of rows) {
    const b = byBrand.get(r.brandId) ?? { brandId: r.brandId, brandName: r.brandName, stores: 0, planned: 0, realized: 0, visits: 0, meta: 0 };
    b.stores += r.stores;
    b.planned += r.planned;
    b.realized += r.realized;
    b.visits += r.visits;
    b.meta += r.meta;
    byBrand.set(r.brandId, b);
  }
  return {
    from,
    to,
    rows,
    brands: [...byBrand.values()].map((b) => ({ ...b, planned: r2(b.planned), realized: r2(b.realized) })).sort((a, b) => b.planned - a.planned),
    planned: r2(rows.reduce((t, r) => t + r.planned, 0)),
    realized: r2(rows.reduce((t, r) => t + r.realized, 0)),
    missing: rows.reduce((t, r) => t + r.missingValue, 0),
  };
}

/** Folha de pagamento: custo mensal de cada promotor ativo (cadastro dele ou padrão da agência). */
export async function payrollCost(scope: Scope) {
  const db = await getDb();
  const rows = await db
    .select({ id: s.users.id, name: s.users.name, employment: s.users.employment, costSalary: s.users.costSalary, costMeal: s.users.costMeal, costFuel: s.users.costFuel, costCharges: s.users.costCharges, costOther: s.users.costOther })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"), promoterFilter(scope, s.users.id)))
    .orderBy(asc(s.users.name));
  const people = rows.map((u) => ({ id: u.id, name: u.name, employment: u.employment, cost: promoterCost(u, scope.settings.promoterCost) }));
  const sum = (k: keyof Pick<PromoterCost, "salary" | "meal" | "fuel" | "charges" | "other" | "total">) => r2(people.reduce((t, p) => t + p.cost[k], 0));
  return { people, salary: sum("salary"), meal: sum("meal"), fuel: sum("fuel"), charges: sum("charges"), other: sum("other"), total: sum("total"), withoutCost: people.filter((p) => p.cost.total === 0).length };
}

/** Custo do promotor no cadastro (vazio = padrão da agência; encargos vazios = automáticos). */
export async function savePromoterCost(scope: Scope, userId: string, i: { costSalary: number | null; costMeal: number | null; costFuel: number | null; costCharges: number | null; costOther: number | null }): Promise<ActionResult> {
  if (!canSeeFinance(scope)) return fail("Sem permissão.");
  for (const v of Object.values(i)) if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1_000_000)) return fail("Valor inválido.");
  const db = await getDb();
  const [u] = await db.select().from(s.users).where(and(eq(s.users.id, userId), eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter")));
  if (!u) return fail("Promotor não encontrado.");
  await db.update(s.users).set({ ...i, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.users.id, userId));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "user", userId, "cost_saved", { before: { costSalary: u.costSalary, costMeal: u.costMeal, costFuel: u.costFuel, costCharges: u.costCharges, costOther: u.costOther }, after: i });
  return { ok: true, message: "Custos do promotor salvos." };
}

/** VR ATEND de uma loja × marca do promotor. */
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

/** DRE gerencial do mês (previsto × realizado) + degustações por marca + comparação dos últimos 6 meses. */
export async function financeOverview(scope: Scope, month: string) {
  const { from, to, month: m } = monthRange(month);
  const [tastingRows, promo, payroll] = await Promise.all([listTastings(scope, { from, to }), promotoriaRevenue(scope, m), payrollCost(scope)]);
  const tastings = tastingFinance(tastingRows);
  // Degustações: previsto = tudo o que está programado (canceladas só com multa); realizado = concluídas + multas.
  const live = tastingRows.filter((r) => r.status !== "cancelled");
  const done = tastingRows.filter((r) => r.status === "completed");
  const fees = r2(tastingRows.filter((r) => r.status === "cancelled").reduce((t, r) => t + r.revenueCounted, 0));
  const sum = (list: TastingRow[], f: (r: TastingRow) => number) => r2(list.reduce((t, r) => t + f(r), 0));
  const col = (tastingRevenue: number, taxes: number, tasterCost: number, tastingOther: number, promotoria: number) => {
    const revenue = r2(promotoria + tastingRevenue);
    const directCosts = r2(payroll.total + tasterCost + tastingOther);
    const contribution = r2(revenue - taxes - directCosts);
    return { promotoriaRevenue: promotoria, tastingRevenue, revenue, taxes, payroll: payroll.total, tasterCost, tastingOtherCosts: tastingOther, directCosts, contribution, margin: revenue > 0 ? Math.round((contribution / revenue) * 1000) / 10 : null };
  };
  const planned = col(r2(sum(live, (r) => r.planned.revenue) + fees), sum(live, (r) => r.planned.taxes), sum(live, (r) => r.planned.tasterCost), sum(live, (r) => r.planned.otherCosts), promo.planned);
  const realized = col(r2(sum(done, (r) => r.actual.revenue) + fees), sum(done, (r) => r.actual.taxes), sum(done, (r) => r.actual.tasterCost), sum(done, (r) => r.actual.otherCosts), promo.realized);

  const byBrand = new Map<string, { brandId: string; brandName: string; rows: TastingRow[] }>();
  for (const r of tastingRows) {
    const g = byBrand.get(r.brandId) ?? { brandId: r.brandId, brandName: r.brandName, rows: [] };
    g.rows.push(r);
    byBrand.set(r.brandId, g);
  }
  const brands = [...byBrand.values()].map((g) => ({ brandId: g.brandId, brandName: g.brandName, ...tastingFinance(g.rows) })).sort((a, b) => b.contribution - a.contribution);

  const months: { month: string; revenue: number; costs: number; contribution: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const mm = shiftMonth(m, -i);
    const rows = mm === m ? tastingRows : await listTastings(scope, monthRange(mm));
    const f = tastingFinance(rows);
    months.push({ month: mm, revenue: f.revenue, costs: r2(f.tasterCost + f.otherCosts), contribution: f.contribution, count: f.count });
  }

  return { from, to, month: m, dre: { planned, realized }, tastings, brands, months, promo, payroll };
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
