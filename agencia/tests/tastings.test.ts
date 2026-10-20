/**
 * Degustações: materiais por marca, contas do resultado, WhatsApp, fluxo do
 * evento (degustadora, contato, conclusão), faturas sem contar duas vezes,
 * importação com conferência, folha da promotoria e dados de exemplo.
 */
process.env.UPLOADS_DIR ??= ".data/test-uploads";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { memDb } from "../scripts/_memdb";
import * as s from "../src/server/db/schema";
import type { DB } from "../src/server/db";
import type { Scope } from "../src/server/auth";
import { addDays, todayIso } from "../src/lib/dates";
import { inviteMessage, materialsFor, tastingResult, whatsappLink, countedRevenue } from "../src/lib/tasting";

let db: DB;
let auth: typeof import("../src/server/auth");
let ts: typeof import("../src/server/tastings");
let fin: typeof import("../src/server/finance");
let imp: typeof import("../src/server/tasting-import");

async function scopeOf(username: string): Promise<Scope> {
  const [u] = await db.select().from(s.users).where(eq(s.users.username, username));
  return auth.scopeForUser(u);
}

before(async () => {
  db = await memDb();
  auth = await import("../src/server/auth");
  ts = await import("../src/server/tastings");
  fin = await import("../src/server/finance");
  imp = await import("../src/server/tasting-import");
});

const base = (brandId: string, over: Partial<import("../src/server/tastings").TastingInput> = {}) => ({
  brandId,
  storeId: null,
  chainName: "ABC",
  storeName: "ABC LJ 01 SAO JOSE",
  city: "Divinópolis",
  state: "MG",
  date: addDays(todayIso(), 3),
  startTime: "09:00",
  endTime: "15:00",
  product: "Pão de queijo",
  description: null,
  materialsNote: null,
  notes: null,
  responsibleId: null,
  orderRef: null,
  actionCode: null,
  billingTerms: null,
  brandPaymentDue: null,
  tasterPaymentDue: null,
  photoProof: false,
  requiredEvidence: null,
  revenue: 500,
  taxes: null,
  tasterFee: 180,
  transport: 40,
  food: null,
  materialsCost: null,
  otherCost: null,
  ...over,
});

describe("degustações — regras", () => {
  test("materiais por marca (lista da agência)", () => {
    assert.deepEqual(materialsFor({ code: "CAFEBRAVO", name: "Café Bravo" }), ["Extensão elétrica", "Copinhos descartáveis", "Guardanapos", "Máquinas de café", "Café", "Açúcar", "Mexedor"]);
    assert.deepEqual(materialsFor({ code: "DIVINISSIMO", name: "Divinissimo" }), ["Air fryer", "Extensão elétrica", "Copinhos descartáveis", "Guardanapos"]);
    assert.deepEqual(materialsFor({ code: "SUINCO", name: "Suinco" }), ["Air fryer", "Extensão elétrica", "Guardanapos", "Tábua e faca"]);
    assert.deepEqual(materialsFor({ code: "AVIVAR", name: "Avivar" }), ["Air fryer", "Extensão elétrica", "Guardanapos", "Tábua e faca"]);
    // "Feirista Avivar" não é Avivar: só os itens de todas as marcas.
    assert.deepEqual(materialsFor({ code: "FEIRISTA", name: "Feirista Avivar" }), ["Extensão elétrica", "Guardanapos"]);
  });

  test("resultado de contribuição e margem (exemplo do pedido)", () => {
    const r = tastingResult({ revenue: 500, taxes: null, tasterFee: 180, transport: 40, food: null, materialsCost: null, otherCost: null });
    assert.equal(r.contribution, 280);
    assert.equal(r.margin, 56);
    assert.equal(tastingResult({ revenue: null, taxes: null, tasterFee: 100, transport: null, food: null, materialsCost: null, otherCost: null }).margin, null);
    assert.equal(countedRevenue("cancelled", 500, null), 0, "cancelada sem multa não soma receita");
    assert.equal(countedRevenue("cancelled", 500, 150), 150);
  });

  test("WhatsApp: abre conversa com a mensagem pronta", () => {
    const msg = inviteMessage({ tasterName: "Ana Paula", brandName: "Suinco", date: "20/10/2026", time: "09:00 às 15:00", storeName: "ABC 01", city: "Divinópolis", product: "Bacon", materials: "Air fryer", fee: 180 });
    assert.ok(msg.startsWith("Olá, Ana! Tudo bem?"));
    assert.ok(msg.includes("R$"));
    const link = whatsappLink("(37) 99999-0000", msg)!;
    assert.ok(link.startsWith("https://wa.me/5537999990000?text="));
    assert.equal(whatsappLink("123", msg), null);
  });
});

describe("degustações — fluxo", () => {
  test("cadastro, duplicidade, degustadora, contato, conclusão e financeiro", async () => {
    const admin = await scopeOf("admin");
    const [brand] = await db.select().from(s.brands).where(eq(s.brands.agencyId, admin.agencyId));
    const r = await ts.saveTasting(admin, null, base(brand.id));
    assert.ok(r.ok && r.id, JSON.stringify(r));
    const id = r.id!;
    const dup = await ts.saveTasting(admin, null, base(brand.id));
    assert.equal(dup.ok, false, "mesmo evento não entra duas vezes");
    const mats = await db.select().from(s.tastingMaterials).where(eq(s.tastingMaterials.tastingId, id));
    assert.ok(mats.length >= 2, "checklist gerado pela marca");

    const a = await ts.saveTaster(admin, null, { name: "Teste Um", phone: "(37) 98888-1111", city: "Divinópolis", state: "MG", region: null, area: null, availability: null, experience: null, usualFee: 170, notes: null, status: "active" });
    const b = await ts.saveTaster(admin, null, { name: "Teste Dois", phone: "37 97777-2222", city: "Itaúna", state: "MG", region: null, area: null, availability: null, experience: null, usualFee: 160, notes: null, status: "active" });
    assert.ok(a.ok && b.ok);
    const opts = await ts.tasterOptions(admin, "Divinopolis", base(brand.id).date);
    assert.equal(opts[0].id, a.id, "a da cidade do evento vem primeiro");

    assert.ok((await ts.selectTaster(admin, id, a.id!)).ok);
    assert.ok((await ts.setContactStatus(admin, id, "unavailable", "viajando")).ok);
    let t = (await ts.getTasting(admin, id))!;
    assert.equal(t.tasting.status, "awaiting_taster");
    assert.equal(t.tasting.tasterId, null);
    assert.ok((await ts.selectTaster(admin, id, b.id!)).ok);
    assert.ok((await ts.setContactStatus(admin, id, "confirmed", null)).ok);
    t = (await ts.getTasting(admin, id))!;
    assert.equal(t.tasting.status, "confirmed");
    assert.ok(t.contacts.some((c) => c.c.tasterId === a.id && c.c.status === "unavailable"), "tentativa anterior fica no histórico");

    assert.ok((await ts.setTastingStatus(admin, id, "completed")).ok);
    const f = await ts.saveFinance(admin, id, {
      revenueActual: null,
      taxesActual: null,
      tasterFeeActual: 200,
      transportActual: null,
      foodActual: null,
      materialsCostActual: null,
      otherCostActual: null,
      docStatus: "ok",
      billingStatus: "not_billed",
      billedAmount: null,
      receiptStatus: "pending",
      receivedAmount: null,
      receivedAt: null,
      tasterPaymentStatus: "paid",
      paidAmount: 200,
      paidAt: null,
    });
    assert.ok(f.ok, JSON.stringify(f));
    t = (await ts.getTasting(admin, id))!;
    assert.equal(t.planned.contribution, 280);
    assert.equal(t.actual.contribution, 260, "realizado usa o cachê efetivo");

    // Fatura consolidada: a receita não é contada duas vezes.
    const second = await ts.saveTasting(admin, null, base(brand.id, { storeName: "BH LJ 100", startTime: "10:00" }));
    await db.update(s.tastings).set({ status: "completed", tasterId: b.id! }).where(eq(s.tastings.id, second.id!));
    const inv = await fin.createInvoice(admin, { brandId: brand.id, tastingIds: [id, second.id!], number: "NF 1", issueDate: todayIso(), dueDate: null, notes: null });
    assert.ok(inv.ok, JSON.stringify(inv));
    const again = await fin.createInvoice(admin, { brandId: brand.id, tastingIds: [id], number: "NF 2", issueDate: todayIso(), dueDate: null, notes: null });
    assert.equal(again.ok, false, "a mesma degustação não entra em duas faturas");
    assert.ok((await fin.receiveInvoice(admin, inv.id!, todayIso(), null)).ok);
    const ov = await fin.financeOverview(admin, base(brand.id).date.slice(0, 7));
    assert.equal(ov.tastings.revenue, 1000, "duas degustações de 500, contadas uma vez");
    assert.equal(ov.tastings.billed, 1000);
    assert.equal(ov.tastings.received, 1000);
  });

  test("importação: lê o cronograma, aponta problemas e só salva o aprovado", async () => {
    const admin = await scopeOf("admin");
    const [brand] = await db.select().from(s.brands).where(eq(s.brands.agencyId, admin.agencyId));
    const csv = [
      "Cronograma de degustações;;;;;",
      "Data;Horário;Loja;Cidade;Produto;Valor",
      "25/11/2026;09h às 15h;Super Teste Centro;Divinópolis;Bacon;R$ 450,00",
      "26/11/2026;10:00 - 16:00;;Itaúna;Linguiça;400",
      "25/11/2026;09h às 15h;Super Teste Centro;Divinópolis;Bacon;R$ 450,00",
    ].join("\n");
    const file = new File([csv], "cronograma.csv", { type: "text/csv" });
    const p = await imp.previewSchedule(admin, brand.id, file);
    assert.ok(p.ok, JSON.stringify(p));
    assert.equal(p.rows!.length, 3);
    assert.equal(p.rows![0].date, "2026-11-25");
    assert.equal(p.rows![0].startTime, "09:00");
    assert.equal(p.rows![0].endTime, "15:00");
    assert.equal(p.rows![0].revenue, 450);
    assert.ok(p.rows![1].issues.includes("sem loja"));
    assert.equal(p.rows![2].duplicate, true, "linha repetida no arquivo");
    const c = await imp.commitSchedule(admin, p.batchId!, brand.id, p.rows!.slice(0, 2));
    assert.equal(c.created, 1);
    assert.equal(c.skipped!.length, 1);
    const files = await db.select().from(s.tastingFiles).where(eq(s.tastingFiles.batchId, p.batchId!));
    assert.equal(files.length, 1, "arquivo original guardado");
  });

  test("promotoria: receita = VR ATEND (previsto) e VR ATEND × feitas ÷ meta (realizado); folha soma os promotores ativos", async () => {
    assert.equal(fin.monthlyMeta(2, "week"), 8);
    assert.equal(fin.monthlyMeta(1, "fortnight"), 2);
    const admin = await scopeOf("admin");
    const month = todayIso().slice(0, 7);
    const [t] = await db.select().from(s.visitTargets).where(eq(s.visitTargets.agencyId, admin.agencyId)).limit(1);
    if (t) {
      assert.ok((await fin.saveTargetPayValue(admin, t.id, 400)).ok);
      const p = await fin.promotoriaRevenue(admin, month);
      const row = p.rows.find((r) => r.promoterId === t.promoterId && r.brandId === t.brandId)!;
      assert.ok(row.planned >= 400, "previsto = VR ATEND cheio");
      assert.ok(row.realized <= row.planned * Math.max(1, row.visits / Math.max(1, row.meta)) + 0.01);
    }
    // Folha: padrão da agência + ajuste individual; encargos automáticos só para vínculo fixo.
    const withDefaults = { ...admin, settings: { ...admin.settings, promoterCost: { salary: 2000, meal: 400, fuel: 300, other: null, chargesPct: 27.44 } } };
    const promoters = await db.select().from(s.users).where(eq(s.users.role, "promoter"));
    const mine = promoters.filter((u) => u.agencyId === admin.agencyId && u.status === "active");
    const fixed = mine.find((u) => u.employment === "fixed")!;
    assert.ok((await fin.savePromoterCost(admin, fixed.id, { costSalary: 2500, costMeal: null, costFuel: null, costCharges: null, costOther: 100 })).ok);
    const pay = await fin.payrollCost(withDefaults);
    const me = pay.people.find((x) => x.id === fixed.id)!;
    assert.equal(me.cost.salary, 2500);
    assert.equal(me.cost.meal, 400, "alimentação vem do padrão");
    assert.equal(me.cost.charges, 686, "27,44% de 2.500");
    assert.equal(me.cost.total, 2500 + 400 + 300 + 686 + 100);
    const free = pay.people.find((x) => x.employment === "freelancer");
    if (free) assert.equal(free.cost.charges, 0, "freelancer sem encargos");
    assert.equal(pay.people.length, mine.length, "todos os promotores ativos entram na folha");
    const ov = await fin.financeOverview(withDefaults, month);
    assert.equal(ov.dre.planned.payroll, pay.total);
    assert.equal(ov.dre.planned.promotoriaRevenue, (await fin.promotoriaRevenue(admin, month)).planned);
    // Visão estratégica: custo de campo rateado pelos atendimentos; soma das marcas = folha dos promotores com atribuição.
    const [sb] = await db.select({ storeId: s.storeBrands.storeId, brandId: s.storeBrands.brandId, agencyId: s.stores.agencyId }).from(s.storeBrands).innerJoin(s.stores, eq(s.stores.id, s.storeBrands.storeId)).where(eq(s.stores.agencyId, admin.agencyId)).limit(1);
    await db.insert(s.visitTargets).values({ agencyId: admin.agencyId, promoterId: fixed.id, storeId: sb.storeId, brandId: sb.brandId, perWeek: 2, period: "week", weekdays: [], payValue: 300 }).onConflictDoUpdate({ target: [s.visitTargets.promoterId, s.visitTargets.storeId, s.visitTargets.brandId], set: { payValue: 300 } });
    const st = await fin.strategyOverview(withDefaults);
    assert.ok(st.brands.length > 0);
    const withTargets = st.promoters.filter((p) => p.visits > 0).reduce((t, p) => t + p.cost, 0);
    assert.ok(Math.abs(st.totals.fieldCost - withTargets) < 0.05, "todo o custo de quem tem atribuição é rateado nas marcas");
    for (const b of st.brands) assert.equal(b.result, Math.round((b.revenue - b.fieldCost) * 100) / 100);
  });

  test("despesas fixas: vigência por mês e resultado operacional no DRE geral", async () => {
    const admin = await scopeOf("admin");
    const month = todayIso().slice(0, 7);
    const next = fin.shiftMonth(month, 1);
    const base = { category: "occupancy", endMonth: null, notes: null };
    assert.equal((await fin.saveExpense(admin, null, { ...base, name: "Aluguel", amount: 0, startMonth: month, recurring: true })).ok, false, "valor obrigatório");
    assert.ok((await fin.saveExpense(admin, null, { ...base, name: "Aluguel", amount: 3000, startMonth: month, recurring: true })).ok);
    assert.ok((await fin.saveExpense(admin, null, { ...base, name: "Mudança", category: "other", amount: 500, startMonth: month, recurring: false })).ok);
    const now = await fin.monthExpenses(admin, month);
    assert.equal(now.total, 3500);
    assert.equal((await fin.monthExpenses(admin, next)).total, 3000, "a despesa só deste mês não vai para o próximo");
    assert.equal((await fin.monthExpenses(admin, fin.shiftMonth(month, -1))).total, 0);
    const ov = await fin.financeOverview(admin, month);
    const P = ov.dre.planned;
    assert.equal(P.fixed, 3500);
    assert.equal(P.operating, Math.round((P.contribution - 3500) * 100) / 100);
    if (P.margin && P.margin > 0) assert.ok(Math.abs(P.breakEven! - 3500 / (P.margin / 100)) < 0.01);
    // Encerrar a partir do próximo mês mantém este; encerrar no mês inicial remove.
    const rent = now.rows.find((r) => r.name === "Aluguel")!;
    assert.ok((await fin.endExpense(admin, rent.id, next)).ok);
    assert.equal((await fin.monthExpenses(admin, month)).total, 3500);
    assert.equal((await fin.monthExpenses(admin, next)).total, 0);
    for (const r of now.rows) assert.ok((await fin.endExpense(admin, r.id, month)).ok);
    assert.equal((await db.select().from(s.fixedExpenses).where(eq(s.fixedExpenses.agencyId, admin.agencyId))).length, 0);
  });

  test("dados de exemplo: criam e somem por completo", async () => {
    const admin = await scopeOf("admin");
    const { seedSamples } = await import("../src/server/tasting-samples");
    const r = await seedSamples(admin);
    assert.ok(r.ok, JSON.stringify(r));
    const n = (await db.select().from(s.tastings).where(eq(s.tastings.sample, true))).length;
    assert.ok(n >= 15);
    assert.equal((await seedSamples(admin)).ok, false, "não duplica");
    assert.ok((await ts.deleteSamples(admin)).ok);
    assert.equal((await db.select().from(s.tastings).where(eq(s.tastings.sample, true))).length, 0);
    assert.equal((await db.select().from(s.tasters).where(eq(s.tasters.sample, true))).length, 0);
    // Equipe MCX dentro da agência (usuário de outra agência): também cria os exemplos.
    const [mcx] = await db.select().from(s.users).where(eq(s.users.username, "mcx"));
    const asMcx = { ...admin, userId: mcx.id, platform: true };
    const r2 = await seedSamples(asMcx);
    assert.ok(r2.ok, JSON.stringify(r2));
    assert.ok((await db.select().from(s.tastings).where(eq(s.tastings.sample, true))).length >= 15);
    assert.ok((await ts.deleteSamples(asMcx)).ok);
  });
});
