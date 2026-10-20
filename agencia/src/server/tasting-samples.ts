/**
 * Dados FICTÍCIOS de degustação para visualizar agenda, painel e financeiro.
 * Tudo fica marcado como exemplo (sample = true) e sai de uma vez em "Apagar exemplos".
 * Degustadoras de exemplo não têm telefone (ninguém recebe mensagem por engano).
 */
import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import type { ActionResult } from "./manager";
import { canManageTastings, saveTasting, type TastingInput } from "./tastings";
import { createInvoice } from "./finance";
import { materialGroup } from "@/lib/tasting";
import { addDays, todayIso } from "@/lib/dates";

const TASTERS = [
  { name: "Exemplo · Ana Paula Ribeiro", city: "Divinópolis", region: "Centro-Oeste MG", availability: "Seg a sáb, manhã e tarde", experience: "Divinissimo, Suinco", usualFee: 160 },
  { name: "Exemplo · Juliana Costa", city: "Divinópolis", region: "Centro-Oeste MG", availability: "Fins de semana", experience: "Café", usualFee: 150 },
  { name: "Exemplo · Patrícia Alves", city: "Itaúna", region: "Centro-Oeste MG", availability: "Qui a sáb", experience: "Avivar, Suinco", usualFee: 170 },
  { name: "Exemplo · Renata Souza", city: "Nova Serrana", region: "Centro-Oeste MG", availability: "Sex e sáb", experience: "Divinissimo", usualFee: 155 },
  { name: "Exemplo · Camila Mendes", city: "Pará de Minas", region: "Centro-Oeste MG", availability: "Seg a sex, tarde", experience: "Café, Avivar", usualFee: 165 },
  { name: "Exemplo · Fernanda Lima", city: "Formiga", region: "Oeste MG", availability: "Sáb", experience: "Suinco", usualFee: 150 },
];

const STORES = [
  { chain: "ABC", store: "ABC LJ 01 SAO JOSE", city: "Divinópolis" },
  { chain: "BH", store: "BH LJ 100 AUTORAMA", city: "Divinópolis" },
  { chain: "ABC", store: "ABC LJ 11 PRAÇA", city: "Itaúna" },
  { chain: "BH", store: "BH LJ 261 RODOVIA", city: "Nova Serrana" },
  { chain: "BH", store: "BH LJ 144", city: "Pará de Minas" },
  { chain: "ABC", store: "ABC LJ 08", city: "Formiga" },
];

const PRODUCTS: Record<string, string> = {
  divinissimo: "Pão de queijo tradicional 1 kg",
  suinco: "Linguiça toscana e bacon em cubos",
  avivar: "Frango temperado Avivar",
  cafe: "Café torrado e moído 500 g",
  other: "Produto da campanha",
};

type Plan = { day: number; brand: number; store: number; taster: number | null; revenue: number; fee: number; transport: number; food: number; status: "completed" | "confirmed" | "awaiting_confirmation" | "awaiting_taster" | "cancelled"; actual?: { fee?: number; transport?: number }; paid?: boolean; billedSolo?: boolean; received?: boolean };

/** Mês passado (concluídas e faturadas), este mês (mistura) e o próximo (programadas). */
const PLANS: Plan[] = [
  // mês passado
  { day: -40, brand: 0, store: 0, taster: 0, revenue: 500, fee: 180, transport: 30, food: 10, status: "completed", paid: true, received: true },
  { day: -38, brand: 1, store: 2, taster: 2, revenue: 480, fee: 170, transport: 40, food: 15, status: "completed", paid: true, received: true },
  { day: -35, brand: 3, store: 4, taster: 4, revenue: 420, fee: 165, transport: 25, food: 10, status: "completed", paid: true, received: true },
  { day: -33, brand: 2, store: 3, taster: 3, revenue: 520, fee: 175, transport: 45, food: 15, status: "completed", paid: true, billedSolo: true },
  { day: -30, brand: 0, store: 1, taster: 0, revenue: 500, fee: 180, transport: 30, food: 10, status: "completed", paid: false, billedSolo: true, received: true },
  // este mês
  { day: -12, brand: 0, store: 0, taster: 0, revenue: 500, fee: 180, transport: 30, food: 10, status: "completed", actual: { transport: 45 }, paid: true },
  { day: -10, brand: 1, store: 5, taster: 5, revenue: 480, fee: 160, transport: 60, food: 15, status: "completed", paid: false },
  { day: -8, brand: 3, store: 1, taster: 1, revenue: 420, fee: 150, transport: 20, food: 10, status: "completed", actual: { fee: 170 }, paid: false },
  { day: -6, brand: 2, store: 2, taster: 2, revenue: 520, fee: 175, transport: 35, food: 15, status: "cancelled" },
  { day: -3, brand: 0, store: 3, taster: 3, revenue: 500, fee: 155, transport: 50, food: 10, status: "completed", paid: false },
  { day: 1, brand: 1, store: 2, taster: 2, revenue: 480, fee: 170, transport: 40, food: 15, status: "confirmed" },
  { day: 2, brand: 3, store: 4, taster: 4, revenue: 420, fee: 165, transport: 25, food: 10, status: "awaiting_confirmation" },
  { day: 3, brand: 0, store: 0, taster: null, revenue: 500, fee: 180, transport: 30, food: 10, status: "awaiting_taster" },
  { day: 5, brand: 2, store: 3, taster: 3, revenue: 520, fee: 175, transport: 45, food: 15, status: "confirmed" },
  { day: 6, brand: 1, store: 5, taster: null, revenue: 480, fee: 160, transport: 60, food: 15, status: "awaiting_taster" },
  { day: 8, brand: 3, store: 1, taster: 1, revenue: 420, fee: 150, transport: 20, food: 10, status: "confirmed" },
  // próximo mês
  { day: 20, brand: 0, store: 4, taster: 4, revenue: 500, fee: 165, transport: 30, food: 10, status: "awaiting_confirmation" },
  { day: 24, brand: 2, store: 2, taster: null, revenue: 520, fee: 175, transport: 40, food: 15, status: "awaiting_taster" },
];

export async function seedSamples(scope: Scope): Promise<ActionResult> {
  if (!canManageTastings(scope)) return { ok: false, error: "Sem permissão." };
  const db = await getDb();
  const [already] = await db.select({ id: s.tastings.id }).from(s.tastings).where(and(eq(s.tastings.agencyId, scope.agencyId), eq(s.tastings.sample, true))).limit(1);
  if (already) return { ok: false, error: "Os dados de exemplo já foram criados. Apague-os antes de criar de novo." };
  const brands = await db.select().from(s.brands).where(and(eq(s.brands.agencyId, scope.agencyId), eq(s.brands.status, "active")));
  // Divinissimo, Suinco, Avivar e Café (quando existem); senão, as primeiras marcas da agência.
  const order = ["divinissimo", "suinco", "avivar", "cafe"] as const;
  const picked = order.map((g) => brands.find((b) => materialGroup(b) === g)).filter((b): b is (typeof brands)[number] => Boolean(b));
  for (const b of brands) if (picked.length < 4 && !picked.includes(b)) picked.push(b);
  if (!picked.length) return { ok: false, error: "Cadastre ao menos uma marca antes." };

  // Reaproveita as degustadoras de exemplo que já existam (não duplica).
  const existing = await db.select({ id: s.tasters.id, name: s.tasters.name }).from(s.tasters).where(and(eq(s.tasters.agencyId, scope.agencyId), eq(s.tasters.sample, true)));
  const tasterIds: string[] = [];
  for (const t of TASTERS) {
    const found = existing.find((e) => e.name === t.name);
    if (found) {
      tasterIds.push(found.id);
      continue;
    }
    const [row] = await db.insert(s.tasters).values({ ...t, agencyId: scope.agencyId, state: "MG", notes: "Cadastro fictício para demonstração.", sample: true, createdBy: scope.userId }).returning({ id: s.tasters.id });
    tasterIds.push(row.id);
  }
  const today = todayIso();
  const billedIds: { brandId: string; ids: string[] } = { brandId: picked[0].id, ids: [] };
  let created = 0;
  for (const p of PLANS) {
    const brand = picked[p.brand % picked.length];
    const st = STORES[p.store];
    const date = addDays(today, p.day);
    const input: TastingInput = {
      brandId: brand.id,
      storeId: null,
      chainName: st.chain,
      storeName: st.store,
      city: st.city,
      state: "MG",
      date,
      startTime: "09:00",
      endTime: "15:00",
      product: PRODUCTS[materialGroup(brand)],
      description: "Degustação com abordagem dos clientes no corredor (EXEMPLO)",
      materialsNote: null,
      notes: "Dado fictício para demonstração.",
      // Equipe MCX não é usuário da agência: fica sem responsável interno.
      responsibleId: scope.platform ? null : scope.userId,
      orderRef: `EX-${date.slice(5, 7)}${String(p.store + 1).padStart(2, "0")}`,
      actionCode: null,
      billingTerms: "Faturamento após comprovação",
      brandPaymentDue: addDays(date, 30),
      tasterPaymentDue: addDays(date, 7),
      photoProof: true,
      requiredEvidence: "Fotos do ponto montado",
      revenue: p.revenue,
      taxes: Math.round(p.revenue * 0.06 * 100) / 100,
      tasterFee: p.fee,
      transport: p.transport,
      food: p.food,
      materialsCost: 12,
      otherCost: null,
    };
    const r = await saveTasting(scope, null, input, { allowDuplicate: true, sample: true });
    if (!r.ok || !r.id) return { ok: false, error: `Não foi possível criar os exemplos: ${r.ok ? "sem id" : r.error}` };
    created++;
    const taster = p.taster === null ? null : tasterIds[p.taster];
    const done = p.status === "completed";
    await db
      .update(s.tastings)
      .set({
        status: p.status,
        tasterId: taster,
        contactStatus: taster ? (p.status === "awaiting_confirmation" ? "waiting" : "confirmed") : "not_contacted",
        completedAt: done ? new Date(`${date}T18:00:00Z`) : null,
        docStatus: done ? "ok" : "pending",
        cancelReason: p.status === "cancelled" ? "Loja pediu para remarcar (exemplo)" : null,
        cancellationFee: p.status === "cancelled" ? 150 : null,
        tasterFeeActual: p.actual?.fee ?? null,
        transportActual: p.actual?.transport ?? null,
        tasterPaymentStatus: p.paid ? "paid" : "pending",
        paidAmount: p.paid ? (p.actual?.fee ?? p.fee) : null,
        paidAt: p.paid ? addDays(date, 5) : null,
        billingStatus: p.billedSolo ? "billed" : "not_billed",
        billedAmount: p.billedSolo ? p.revenue : null,
        receiptStatus: p.billedSolo && p.received ? "received" : "pending",
        receivedAmount: p.billedSolo && p.received ? p.revenue : null,
        receivedAt: p.billedSolo && p.received ? addDays(date, 25) : null,
      })
      .where(eq(s.tastings.id, r.id));
    if (taster) await db.insert(s.tastingContacts).values({ tastingId: r.id, tasterId: taster, status: p.status === "awaiting_confirmation" ? "waiting" : "confirmed", note: "Exemplo", createdBy: scope.userId });
    if (done) await db.update(s.tastingMaterials).set({ checked: true, checkedAt: new Date(), checkedBy: scope.userId }).where(eq(s.tastingMaterials.tastingId, r.id));
    // Fatura consolidada de exemplo: as concluídas do mês passado da 1ª marca que não foram faturadas sozinhas.
    if (done && p.day <= -35 && !p.billedSolo && brand.id === billedIds.brandId) billedIds.ids.push(r.id);
  }
  if (billedIds.ids.length) {
    const inv = await createInvoice(scope, { brandId: billedIds.brandId, tastingIds: billedIds.ids, number: "EXEMPLO-001", issueDate: addDays(today, -28), dueDate: addDays(today, 2), notes: "Fatura fictícia" }, { sample: true });
    if (inv.ok && inv.id) {
      const { receiveInvoice } = await import("./finance");
      await receiveInvoice(scope, inv.id, addDays(today, -5), null);
    }
  }
  return { ok: true, message: `Criados ${created} eventos e ${TASTERS.length} degustadoras de exemplo.` };
}
