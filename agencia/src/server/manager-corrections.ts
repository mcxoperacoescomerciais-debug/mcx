/**
 * Correção feita pelo gestor no que o promotor preencheu (validade, estoque, ruptura),
 * sem devolver o atendimento ao celular. Só admin/gestor da agência, só em atendimento
 * concluído (em correção ou em andamento o celular ainda envia dados e sobrescreveria),
 * sempre com motivo. O valor anterior fica na trilha de auditoria do atendimento.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { canSeeBrand, canSeePromoter, isStaff } from "./scope";
import type { ActionResult } from "./manager";
import { correctionSummary, parseCorrectionDate, parseCorrectionPrice, parseCorrectionQuantity } from "@/lib/corrections";
import { daysBetween } from "@/lib/dates";
import { UNITS } from "@/lib/domain";
import { classify, formatIsoBr } from "@/lib/validity";

const fail = (error: string): ActionResult => ({ ok: false, error });
const money = (v: string | null) => (v === null ? "sem preço" : `R$ ${Number(v).toFixed(2).replace(".", ",")}`);

async function loadForCorrection(scope: Scope, attendanceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ a: s.attendances, promoterId: s.visits.promoterId, visitDate: s.visits.visitDate })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(eq(s.attendances.id, attendanceId), eq(s.attendances.agencyId, scope.agencyId)));
  if (!row || !canSeeBrand(scope, row.a.brandId) || !canSeePromoter(scope, row.promoterId)) return null;
  return row;
}

function checkReason(reason: string): string | null {
  const text = reason.trim();
  return text.length >= 5 ? text : null;
}

const NOT_COMPLETED = "Só é possível corrigir atendimento concluído. Se há correção aberta com o promotor, cancele o pedido antes.";

async function productName(productId: string): Promise<string> {
  const db = await getDb();
  const [p] = await db.select({ name: s.products.name }).from(s.products).where(eq(s.products.id, productId));
  return p?.name ?? "Produto";
}

/** Validade: data, quantidade e preço. Dias para vencer e severidade são recalculados. */
export async function correctValidity(scope: Scope, validityId: string, raw: { expiryDate: string; quantity: string; price: string }, reason: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const why = checkReason(reason);
  if (!why) return fail("Informe o motivo da correção (mínimo 5 caracteres).");
  const expiryDate = parseCorrectionDate(raw.expiryDate);
  if (!expiryDate) return fail("Data de validade inválida.");
  const quantity = parseCorrectionQuantity(raw.quantity, 1);
  if (quantity === null) return fail("Quantidade inválida (número inteiro, a partir de 1).");
  const price = parseCorrectionPrice(raw.price);
  if (price === undefined) return fail("Preço inválido. Use o formato 12,90.");

  const db = await getDb();
  const [v] = await db.select().from(s.validities).where(and(eq(s.validities.id, validityId), eq(s.validities.agencyId, scope.agencyId), isNull(s.validities.deletedAt)));
  if (!v) return fail("Validade não encontrada.");
  const row = await loadForCorrection(scope, v.attendanceId);
  if (!row) return fail("Atendimento não encontrado.");
  if (row.a.status !== "completed") return fail(NOT_COMPLETED);

  const priceText = price === null ? null : price.toFixed(2);
  const changes = correctionSummary([
    ["validade", formatIsoBr(v.expiryDate), formatIsoBr(expiryDate)],
    ["quantidade", String(v.quantity), String(quantity)],
    ["preço", money(v.price), money(priceText)],
  ]);
  if (!changes) return { ok: true, message: "Nada foi alterado." };
  const daysToExpiry = daysBetween(row.visitDate, expiryDate);
  const severity = classify(daysToExpiry, scope.settings.validityBands);
  const name = await productName(v.productId);
  await db.transaction(async (tx) => {
    await tx.update(s.validities).set({ expiryDate, quantity, price: priceText, daysToExpiry, severity, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.validities.id, v.id));
    await audit(
      { agencyId: scope.agencyId, userId: scope.userId },
      "attendance",
      v.attendanceId,
      "item_corrected",
      {
        before: { validityId: v.id, expiryDate: v.expiryDate, quantity: v.quantity, price: v.price },
        after: { validityId: v.id, expiryDate, quantity, price: priceText },
        reason: `Validade de ${name}: ${changes}. Motivo: ${why}`,
      },
      tx,
    );
  });
  return { ok: true, message: "Validade corrigida." };
}

/** Contagem da área de vendas: quantidade, unidade e preço do produto. */
export async function correctStock(scope: Scope, attendanceId: string, productId: string, raw: { quantity: string; unit: string; price: string }, reason: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const why = checkReason(reason);
  if (!why) return fail("Informe o motivo da correção (mínimo 5 caracteres).");
  const quantity = parseCorrectionQuantity(raw.quantity, 0);
  if (quantity === null) return fail("Quantidade inválida (número inteiro, a partir de 0).");
  const unit = UNITS.find((u) => u === raw.unit);
  if (!unit) return fail("Unidade inválida.");
  const price = parseCorrectionPrice(raw.price);
  if (price === undefined) return fail("Preço inválido. Use o formato 12,90.");

  const row = await loadForCorrection(scope, attendanceId);
  if (!row) return fail("Atendimento não encontrado.");
  if (row.a.status !== "completed") return fail(NOT_COMPLETED);
  const db = await getDb();
  const [st] = await db.select().from(s.stockEntries).where(and(eq(s.stockEntries.attendanceId, attendanceId), eq(s.stockEntries.productId, productId)));
  if (!st) return fail("O promotor não informou este produto; não há o que corrigir.");

  const state = quantity === 0 ? ("zero" as const) : ("quantity" as const);
  const priceText = price === null ? null : price.toFixed(2);
  const changes = correctionSummary([
    ["quantidade", st.quantity === null ? "sem número" : `${st.quantity} ${st.unit}`, `${quantity} ${unit}`],
    ["preço", money(st.price), money(priceText)],
  ]);
  if (!changes) return { ok: true, message: "Nada foi alterado." };
  const name = await productName(productId);
  await db.transaction(async (tx) => {
    await tx.update(s.stockEntries).set({ state, quantity, unit, price: priceText, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.stockEntries.id, st.id));
    await audit(
      { agencyId: scope.agencyId, userId: scope.userId },
      "attendance",
      attendanceId,
      "item_corrected",
      {
        before: { productId, state: st.state, quantity: st.quantity, unit: st.unit, price: st.price },
        after: { productId, state, quantity, unit, price: priceText },
        reason: `Estoque de ${name}: ${changes}. Motivo: ${why}`,
      },
      tx,
    );
  });
  return { ok: true, message: "Estoque corrigido." };
}

/** Ruptura marcada por engano: sai do atendimento (o registro fica guardado como removido). */
export async function removeRuptureByManager(scope: Scope, ruptureId: string, reason: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const why = checkReason(reason);
  if (!why) return fail("Informe o motivo da correção (mínimo 5 caracteres).");
  const db = await getDb();
  const [r] = await db.select().from(s.ruptures).where(and(eq(s.ruptures.id, ruptureId), eq(s.ruptures.agencyId, scope.agencyId), isNull(s.ruptures.deletedAt)));
  if (!r) return fail("Ruptura não encontrada.");
  const row = await loadForCorrection(scope, r.attendanceId);
  if (!row) return fail("Atendimento não encontrado.");
  if (row.a.status !== "completed") return fail(NOT_COMPLETED);
  const name = await productName(r.productId);
  await db.transaction(async (tx) => {
    await tx.update(s.ruptures).set({ deletedAt: new Date(), updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.ruptures.id, r.id));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "attendance", r.attendanceId, "item_corrected", { before: { ruptureId: r.id, productId: r.productId }, reason: `Ruptura de ${name} removida. Motivo: ${why}` }, tx);
  });
  return { ok: true, message: "Ruptura removida." };
}
