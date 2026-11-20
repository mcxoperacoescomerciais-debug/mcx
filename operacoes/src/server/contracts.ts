/**
 * Contratos, aditivos e ficha operacional do contratante. Contrato e valores são
 * de gestor e dono; o operacional não lê nada daqui. Exclusão é lógica.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { addDays, formatBr, isIsoDate, todayIso } from "@/lib/dates";
import { CONTRACT_STATUSES, contractAlertsDue, contractEnd, looksLikePassword, PROFILE_SECTIONS, type ContractStatus } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { getDb, schema as s, type DB } from "./db";
import type { Actor, Result } from "./demands";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
const clean = (v: string | null | undefined, max = 2000) => (v ?? "").trim().slice(0, max) || null;

export interface ContractInput {
  clientId: string;
  services: string;
  monthlyValueCents: number;
  dueDay?: number | null;
  startDate?: string | null;
  termMonths?: number;
  autoRenew?: boolean;
  status?: ContractStatus;
  notes?: string | null;
}

/** O valor mensal do contratante (usado em Horas × Receita) passa a ser a soma dos contratos vigentes. */
async function syncClientValue(tx: Tx | DB, clientId: string) {
  const active = await tx.select({ v: s.contracts.monthlyValueCents }).from(s.contracts).where(and(eq(s.contracts.clientId, clientId), eq(s.contracts.status, "active"), isNull(s.contracts.deletedAt)));
  if (active.length) await tx.update(s.clients).set({ monthlyValueCents: active.reduce((sum, c) => sum + c.v, 0), updatedAt: new Date() }).where(eq(s.clients.id, clientId));
}

export async function listContracts(actor: Actor, clientId?: string) {
  if (!can(actor.role, "contract.view")) return [];
  const db = await getDb();
  const where = [isNull(s.contracts.deletedAt)];
  if (clientId && UUID.test(clientId)) where.push(eq(s.contracts.clientId, clientId));
  return db.select({ c: s.contracts, clientName: s.clients.name }).from(s.contracts).innerJoin(s.clients, eq(s.clients.id, s.contracts.clientId)).where(and(...where)).orderBy(asc(s.clients.name), desc(s.contracts.createdAt));
}

export async function getContract(actor: Actor, id: string) {
  if (!can(actor.role, "contract.view") || !UUID.test(id)) return null;
  const db = await getDb();
  const [row] = await db.select({ c: s.contracts, clientName: s.clients.name }).from(s.contracts).innerJoin(s.clients, eq(s.clients.id, s.contracts.clientId)).where(and(eq(s.contracts.id, id), isNull(s.contracts.deletedAt)));
  if (!row) return null;
  const amendments = await db.select({ a: s.contractAmendments, userName: s.users.name }).from(s.contractAmendments).innerJoin(s.users, eq(s.users.id, s.contractAmendments.createdBy)).where(eq(s.contractAmendments.contractId, id)).orderBy(desc(s.contractAmendments.day), desc(s.contractAmendments.createdAt));
  return { ...row.c, clientName: row.clientName, amendments };
}

export async function saveContract(actor: Actor, id: string | null, input: ContractInput): Promise<Result<{ id: string }>> {
  if (!can(actor.role, "contract.manage")) return fail("Só o gestor e o dono cadastram contratos.");
  const services = clean(input.services, 500);
  if (!services || services.length < 3) return fail("Descreva os serviços do contrato.");
  if (!Number.isInteger(input.monthlyValueCents) || input.monthlyValueCents < 0 || input.monthlyValueCents > 100_000_000) return fail("Valor mensal inválido.");
  const dueDay = input.dueDay ?? null;
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return fail("Dia de vencimento: de 1 a 31.");
  const termMonths = input.termMonths ?? 6;
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 120) return fail("Vigência: de 1 a 120 meses.");
  const status = input.status ?? "draft";
  if (!CONTRACT_STATUSES.includes(status)) return fail("Status inválido.");
  const startDate = input.startDate || null;
  if (startDate && !isIsoDate(startDate)) return fail("Data de início inválida.");
  if (status === "active" && !startDate) return fail("Contrato vigente precisa da data de início.");
  if (!UUID.test(input.clientId ?? "")) return fail("Escolha o contratante.");
  const db = await getDb();
  const [client] = await db.select({ id: s.clients.id, kind: s.clients.kind }).from(s.clients).where(and(eq(s.clients.id, input.clientId), isNull(s.clients.deletedAt)));
  if (!client || client.kind === "internal") return fail("Contratante não encontrado.");
  return db.transaction(async (tx) => {
    if (!id) {
      const values = { clientId: input.clientId, services, monthlyValueCents: input.monthlyValueCents, dueDay, startDate, termMonths, endDate: startDate ? contractEnd(startDate, termMonths) : null, autoRenew: !!input.autoRenew, status, notes: clean(input.notes), updatedAt: new Date() };
      const [row] = await tx.insert(s.contracts).values({ ...values, createdBy: actor.id }).returning({ id: s.contracts.id });
      await audit(actor.id, "contract", row.id, "created", { after: values }, tx);
      await syncClientValue(tx, input.clientId);
      return { ok: true as const, id: row.id, message: "Contrato criado." };
    }
    if (!UUID.test(id)) return fail("Contrato não encontrado.");
    const [before] = await tx.select().from(s.contracts).where(and(eq(s.contracts.id, id), isNull(s.contracts.deletedAt)));
    if (!before) return fail("Contrato não encontrado.");
    if (before.clientId !== input.clientId) return fail("O contratante de um contrato não muda. Crie outro contrato.");
    // Valor e fim da vigência de contrato vigente só mudam por aditivo, para o histórico não se perder.
    const locked = before.status === "active" && status === "active";
    if (locked && (input.monthlyValueCents !== before.monthlyValueCents || startDate !== before.startDate || termMonths !== before.termMonths)) return fail("Contrato vigente: valor e vigência mudam por aditivo (registre um aditivo abaixo).");
    const values = { services, monthlyValueCents: input.monthlyValueCents, dueDay, startDate, termMonths, endDate: locked ? before.endDate : startDate ? contractEnd(startDate, termMonths) : null, autoRenew: !!input.autoRenew, status, notes: clean(input.notes), updatedAt: new Date() };
    await tx.update(s.contracts).set(values).where(eq(s.contracts.id, id));
    await audit(actor.id, "contract", id, "updated", { before: { status: before.status, monthlyValueCents: before.monthlyValueCents, endDate: before.endDate }, after: { status, monthlyValueCents: values.monthlyValueCents, endDate: values.endDate } }, tx);
    await syncClientValue(tx, before.clientId);
    return { ok: true as const, id, message: "Contrato atualizado." };
  });
}

export async function addAmendment(actor: Actor, contractId: string, input: { day: string; description: string; newValueCents: number; newEndDate?: string | null }): Promise<Result> {
  if (!can(actor.role, "contract.manage") || !UUID.test(contractId)) return fail("Só o gestor e o dono registram aditivos.");
  const description = clean(input.description, 500);
  if (!description || description.length < 3) return fail("Descreva o aditivo.");
  if (!isIsoDate(input.day)) return fail("Informe a data do aditivo.");
  if (!Number.isInteger(input.newValueCents) || input.newValueCents < 0 || input.newValueCents > 100_000_000) return fail("Novo valor inválido.");
  const newEnd = input.newEndDate || null;
  if (newEnd && !isIsoDate(newEnd)) return fail("Nova data de fim inválida.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(s.contracts).where(and(eq(s.contracts.id, contractId), isNull(s.contracts.deletedAt)));
    if (!c) return fail("Contrato não encontrado.");
    if (c.status !== "active") return fail("Aditivo só em contrato vigente.");
    if (newEnd && c.startDate && newEnd <= c.startDate) return fail("O fim da vigência precisa ser depois do início.");
    await tx.insert(s.contractAmendments).values({ contractId, day: input.day, description, previousValueCents: c.monthlyValueCents, newValueCents: input.newValueCents, previousEndDate: c.endDate, newEndDate: newEnd ?? c.endDate, createdBy: actor.id });
    await tx.update(s.contracts).set({ monthlyValueCents: input.newValueCents, endDate: newEnd ?? c.endDate, updatedAt: new Date() }).where(eq(s.contracts.id, contractId));
    await audit(actor.id, "contract", contractId, "amended", { before: { monthlyValueCents: c.monthlyValueCents, endDate: c.endDate }, after: { monthlyValueCents: input.newValueCents, endDate: newEnd ?? c.endDate } }, tx);
    await syncClientValue(tx, c.clientId);
    return { ok: true as const, message: "Aditivo registrado." };
  });
}

export async function deleteContract(actor: Actor, id: string, reason: string): Promise<Result> {
  if (!can(actor.role, "contract.manage") || !UUID.test(id)) return fail("Sem permissão.");
  if (reason.trim().length < 3) return fail("Informe o motivo da exclusão.");
  const db = await getDb();
  const [c] = await db.select().from(s.contracts).where(and(eq(s.contracts.id, id), isNull(s.contracts.deletedAt)));
  if (!c) return fail("Contrato não encontrado.");
  await db.update(s.contracts).set({ deletedAt: new Date(), status: c.status === "active" ? "cancelled" : c.status }).where(eq(s.contracts.id, id));
  await audit(actor.id, "contract", id, "deleted", { reason: reason.trim(), before: { status: c.status, monthlyValueCents: c.monthlyValueCents } });
  return { ok: true, message: "Contrato excluído." };
}

/** Contratos vigentes que terminam em até 30 dias (para o painel). */
export async function contractsEnding(actor: Actor, today: string = todayIso()) {
  const rows = await listContracts(actor);
  return rows.filter(({ c }) => c.status === "active" && c.endDate && c.endDate <= addDays(today, 30)).map(({ c, clientName }) => ({ id: c.id, clientName, endDate: c.endDate!, autoRenew: c.autoRenew, expired: c.endDate! < today }));
}

/** Demanda única por aviso, para o gestor. Chave (kind, refKey) é única: nunca duplica. */
export async function openAlertDemand(db: DB, kind: string, refKey: string, demand: { clientId: string; title: string; description: string; dueDate: string }): Promise<boolean> {
  const people = await db.select().from(s.users).where(eq(s.users.status, "active"));
  const assignee = people.find((p) => p.role === "gestor") ?? people.find((p) => p.role === "owner");
  if (!assignee) return false;
  const categories = await db.select().from(s.categories).orderBy(asc(s.categories.position));
  const category = categories.find((c) => c.name === "Fechamento e financeiro") ?? categories[0];
  return db
    .transaction(async (tx) => {
      const [done] = await tx.select({ d: s.alertRuns.demandId }).from(s.alertRuns).where(and(eq(s.alertRuns.kind, kind), eq(s.alertRuns.refKey, refKey)));
      if (done) return false;
      const [row] = await tx.insert(s.demands).values({ title: demand.title.slice(0, 200), clientId: demand.clientId, categoryId: category.id, assigneeId: assignee.id, priority: "high", dueDate: demand.dueDate, origin: "system", description: demand.description, createdBy: assignee.id }).returning({ id: s.demands.id });
      await tx.insert(s.alertRuns).values({ kind, refKey, demandId: row.id });
      await tx.insert(s.demandHistory).values({ demandId: row.id, userId: null, field: "created", toValue: "Aviso automático" });
      await audit(null, "demand", row.id, "created", { after: { alert: kind, refKey }, source: "avisos" }, tx);
      return true;
    })
    .catch((err: unknown) => {
      if (String((err as { code?: string }).code) === "23505" || /duplicate key|alert_runs/i.test(String(err))) return false;
      throw err;
    });
}

/** 30 e 7 dias antes do fim da vigência: demanda para o gestor (uma por aviso). */
export async function generateContractAlerts(today: string = todayIso()): Promise<{ created: number }> {
  const db = await getDb();
  const rows = await db.select({ c: s.contracts, clientName: s.clients.name }).from(s.contracts).innerJoin(s.clients, eq(s.clients.id, s.contracts.clientId)).where(and(eq(s.contracts.status, "active"), isNull(s.contracts.deletedAt)));
  let created = 0;
  for (const { c, clientName } of rows) {
    for (const days of contractAlertsDue(c.endDate, today)) {
      const title = c.autoRenew ? `Contrato da ${clientName} renova em ${formatBr(c.endDate)}: confirmar condições` : `Contrato da ${clientName} termina em ${formatBr(c.endDate)}: tratar a renovação`;
      const made = await openAlertDemand(db, `contract_${days}`, `${c.id}|${c.endDate}`, { clientId: c.clientId, title, description: `Aviso de ${days} dias. Serviços: ${c.services}. ${c.autoRenew ? "Renovação automática." : "Sem renovação automática."}`, dueDate: c.endDate! < addDays(today, 3) ? today : addDays(today, 3) });
      if (made) created++;
    }
  }
  return { created };
}

// --- Ficha operacional do contratante ---------------------------------------

export async function saveClientProfile(actor: Actor, clientId: string, sections: Record<string, string>): Promise<Result> {
  if (!can(actor.role, "client.edit") || !UUID.test(clientId)) return fail("Sem permissão.");
  const profile: Record<string, string> = {};
  for (const { key, label } of PROFILE_SECTIONS) {
    const text = (sections[key] ?? "").trim().slice(0, 4000);
    if (looksLikePassword(text)) return fail(`A seção “${label}” parece conter uma senha. A ficha nunca guarda senha: escreva só onde a credencial está (ex.: “no cofre de senhas da Maria”).`);
    if (text) profile[key] = text;
  }
  const db = await getDb();
  const [client] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.id, clientId), isNull(s.clients.deletedAt)));
  if (!client) return fail("Contratante não encontrado.");
  await db.update(s.clients).set({ operationalProfile: profile, updatedAt: new Date() }).where(eq(s.clients.id, clientId));
  await audit(actor.id, "client", clientId, "profile_updated", { after: { sections: Object.keys(profile) } });
  return { ok: true, message: "Ficha operacional salva." };
}

/** Contratos por contratante (id → resumo), para listas. Só para quem pode ver contrato. */
export async function contractSummary(actor: Actor, clientIds: string[]) {
  if (!can(actor.role, "contract.view") || !clientIds.length) return [];
  const db = await getDb();
  return db.select().from(s.contracts).where(and(inArray(s.contracts.clientId, clientIds), isNull(s.contracts.deletedAt))).orderBy(desc(s.contracts.createdAt));
}
