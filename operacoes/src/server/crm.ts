/**
 * Comercial (CRM). Regra central: lead em etapa aberta nunca fica sem
 * "próxima ação" e "data da próxima ação". O operacional não acessa nada daqui —
 * a permissão é conferida em cada função, não na tela.
 */
import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { addDays, isIsoDate, monthEnd, monthStart, todayIso, weekStart } from "@/lib/dates";
import { INTERNAL_CLIENT_NAME } from "@/lib/domain";
import {
  averageCycleDays,
  cadence,
  companyKey,
  contactsByWeek,
  DEFAULT_DAILY_GOAL,
  fillTemplate,
  INTERACTION_KINDS,
  LEAD_SOURCES,
  LEAD_TYPES,
  LOSS_REASONS,
  lossReasons,
  matchOption,
  NURTURE_DAYS,
  OUTCOMES,
  parseLeadsCsv,
  phoneDigits,
  pipeline,
  potentialValue,
  PRODUCTS,
  PROPOSAL_VALID_DAYS,
  reachedInPeriod,
  RESPONDED_KEYS,
  responseRate,
  resultsBy,
  stageConversion,
  todayGroup,
  whatsappLink,
  wonMrr,
  type InteractionKind,
  type MetricLead,
  type MetricMove,
  type Outcome,
  type StageKey,
} from "@/lib/crm";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { getDb, schema as s, type DB } from "./db";
import type { Actor, Result } from "./demands";
import { copyTemplateInto } from "./templates";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
const DENIED = "Sem permissão para o Comercial.";
const clean = (v: string | null | undefined, max = 200) => (v ?? "").trim().slice(0, max) || null;

export type Stage = typeof s.crmStages.$inferSelect;

export async function listStages(): Promise<Stage[]> {
  const db = await getDb();
  return db.select().from(s.crmStages).orderBy(asc(s.crmStages.position));
}

export async function dailyGoal(): Promise<number> {
  const db = await getDb();
  const [row] = await db.select().from(s.settings).where(eq(s.settings.key, "crm_daily_goal"));
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_GOAL;
}

export async function setDailyGoal(actor: Actor, goal: number): Promise<Result> {
  if (!can(actor.role, "crm.manage")) return fail("Só o dono altera a meta.");
  if (!Number.isInteger(goal) || goal < 1 || goal > 100) return fail("Meta: de 1 a 100 contatos por dia.");
  const db = await getDb();
  await db.insert(s.settings).values({ key: "crm_daily_goal", value: goal }).onConflictDoUpdate({ target: s.settings.key, set: { value: goal, updatedAt: new Date() } });
  await audit(actor.id, "setting", "crm_daily_goal", "updated", { after: { goal } });
  return { ok: true, message: "Meta atualizada." };
}

export async function saveStage(actor: Actor, id: string | null, input: { name: string; probability: number; position?: number; active?: boolean }): Promise<Result> {
  if (!can(actor.role, "crm.manage")) return fail("Só o dono edita as etapas do funil.");
  const name = input.name.trim();
  if (name.length < 2) return fail("Informe o nome da etapa.");
  if (!Number.isInteger(input.probability) || input.probability < 0 || input.probability > 100) return fail("Chance de fechar: de 0 a 100.");
  const db = await getDb();
  if (!id) {
    // Etapa nova entra como aberta, logo antes de "Ganho".
    const stages = await listStages();
    const won = stages.find((x) => x.kind === "won");
    const position = input.position ?? (won ? won.position : stages.length);
    await db.update(s.crmStages).set({ position: sql`${s.crmStages.position} + 1` }).where(sql`${s.crmStages.position} >= ${position}`);
    const [row] = await db.insert(s.crmStages).values({ name, probability: input.probability, position, kind: "open" }).returning({ id: s.crmStages.id });
    await audit(actor.id, "crm_stage", row.id, "created", { after: { name } });
    return { ok: true, message: "Etapa criada." };
  }
  if (!UUID.test(id)) return fail("Etapa não encontrada.");
  const [stage] = await db.select().from(s.crmStages).where(eq(s.crmStages.id, id));
  if (!stage) return fail("Etapa não encontrada.");
  const active = input.active ?? stage.active;
  if (!active) {
    if (stage.key) return fail("As etapas iniciais do funil não podem ser desativadas (pode renomear).");
    const [inUse] = await db.select({ id: s.leads.id }).from(s.leads).where(and(eq(s.leads.stageId, id), isNull(s.leads.deletedAt))).limit(1);
    if (inUse) return fail("Há leads nesta etapa. Mova-os antes de desativar.");
  }
  await db.update(s.crmStages).set({ name, probability: stage.kind === "won" ? 100 : stage.kind === "lost" ? 0 : input.probability, position: input.position ?? stage.position, active }).where(eq(s.crmStages.id, id));
  await audit(actor.id, "crm_stage", id, "updated", { before: { name: stage.name, probability: stage.probability }, after: { name, probability: input.probability } });
  return { ok: true, message: "Etapa atualizada." };
}

// --- Leads -----------------------------------------------------------------

export interface LeadInput {
  company: string;
  type: string;
  city?: string | null;
  region?: string | null;
  source: string;
  referredBy?: string | null;
  dataSource?: string | null;
  products?: string[];
  promoters?: number | null;
  actionsPerMonth?: number | null;
  /** Valor informado à mão (centavos). Vazio = calcular pelo porte. */
  potentialCents?: number | null;
  clientId?: string | null;
  ownerId: string;
  tags?: string[];
  notes?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
  /** Só na criação. */
  contact?: { name: string; role?: string | null; whatsapp?: string | null; email?: string | null } | null;
}

const leadColumns = {
  id: s.leads.id,
  number: s.leads.number,
  company: s.leads.company,
  type: s.leads.type,
  city: s.leads.city,
  source: s.leads.source,
  products: s.leads.products,
  potentialCents: s.leads.potentialCents,
  proposalValueCents: s.leads.proposalValueCents,
  proposalValidUntil: s.leads.proposalValidUntil,
  nextAction: s.leads.nextAction,
  nextActionDate: s.leads.nextActionDate,
  ownerId: s.leads.ownerId,
  ownerName: s.users.name,
  stageId: s.leads.stageId,
  stageName: s.crmStages.name,
  stageKey: s.crmStages.key,
  stageKind: s.crmStages.kind,
  stagePosition: s.crmStages.position,
  stageSince: s.leads.stageSince,
  wonAt: s.leads.wonAt,
  lostAt: s.leads.lostAt,
  lossReason: s.leads.lossReason,
  contactName: sql<string | null>`(select c.name from ${s.leadContacts} c where c.lead_id = ${s.leads.id} order by c.is_primary desc, c.created_at asc limit 1)`,
};

export type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

export async function listLeads(actor: Actor, f: { owner?: string; stage?: string; scope?: "open" | "all"; q?: string } = {}) {
  if (!can(actor.role, "crm.view")) return [];
  const db = await getDb();
  const where = [isNull(s.leads.deletedAt)];
  if (f.owner && UUID.test(f.owner)) where.push(eq(s.leads.ownerId, f.owner));
  if (f.stage && UUID.test(f.stage)) where.push(eq(s.leads.stageId, f.stage));
  if (f.scope === "open") where.push(inArray(s.crmStages.kind, ["open", "nurture"]));
  const q = companyKey(f.q ?? "");
  if (q) for (const word of q.split(" ")) where.push(sql`(${s.leads.companyKey} like ${`%${word}%`} or lower(coalesce(${s.leads.city}, '')) like ${`%${word}%`})`);
  return db
    .select(leadColumns)
    .from(s.leads)
    .innerJoin(s.crmStages, eq(s.crmStages.id, s.leads.stageId))
    .innerJoin(s.users, eq(s.users.id, s.leads.ownerId))
    .where(and(...where))
    .orderBy(sql`${s.leads.nextActionDate} asc nulls last`, asc(s.leads.company));
}

export async function getLead(actor: Actor, id: string) {
  if (!can(actor.role, "crm.view") || !UUID.test(id)) return null;
  const db = await getDb();
  const [lead] = await db.select().from(s.leads).where(and(eq(s.leads.id, id), isNull(s.leads.deletedAt)));
  if (!lead) return null;
  const [stages, contacts, interactions, history, [owner]] = await Promise.all([
    listStages(),
    db.select().from(s.leadContacts).where(eq(s.leadContacts.leadId, id)).orderBy(desc(s.leadContacts.isPrimary), asc(s.leadContacts.createdAt)),
    db.select({ i: s.leadInteractions, userName: s.users.name }).from(s.leadInteractions).innerJoin(s.users, eq(s.users.id, s.leadInteractions.userId)).where(eq(s.leadInteractions.leadId, id)).orderBy(desc(s.leadInteractions.createdAt)),
    db.select({ h: s.leadStageHistory, userName: s.users.name }).from(s.leadStageHistory).leftJoin(s.users, eq(s.users.id, s.leadStageHistory.userId)).where(eq(s.leadStageHistory.leadId, id)).orderBy(desc(s.leadStageHistory.createdAt)),
    db.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, lead.ownerId)),
  ]);
  const stage = stages.find((x) => x.id === lead.stageId)!;
  const unanswered = lead.respondedAt ? 0 : interactions.length;
  return { ...lead, stage, stages, contacts, interactions, history, ownerName: owner?.name ?? "", unanswered };
}

/** Lead parecido já cadastrado (mesmo WhatsApp ou mesmo nome de empresa). */
async function findDuplicate(db: DB | Tx, company: string, whatsapp: string | null, exceptId?: string): Promise<{ id: string; number: number; title: string } | null> {
  const key = companyKey(company);
  const digits = phoneDigits(whatsapp);
  const base = and(isNull(s.leads.deletedAt), exceptId ? ne(s.leads.id, exceptId) : undefined);
  if (digits) {
    const [byPhone] = await db.select({ id: s.leads.id, number: s.leads.number, title: s.leads.company }).from(s.leads).innerJoin(s.leadContacts, eq(s.leadContacts.leadId, s.leads.id)).where(and(base, eq(s.leadContacts.whatsappDigits, digits))).limit(1);
    if (byPhone) return byPhone;
  }
  if (!key) return null;
  const [byName] = await db.select({ id: s.leads.id, number: s.leads.number, title: s.leads.company }).from(s.leads).where(and(base, eq(s.leads.companyKey, key))).limit(1);
  return byName ?? null;
}

function validateBase(input: LeadInput): string | null {
  if (input.company.trim().length < 2) return "Informe a empresa.";
  if (!(LEAD_TYPES as readonly string[]).includes(input.type)) return "Escolha o tipo do lead.";
  if (!(LEAD_SOURCES as readonly string[]).includes(input.source)) return "Escolha a origem do lead.";
  if (input.source === "Indicação" && !clean(input.referredBy)) return "Indicação: informe quem indicou.";
  if (!UUID.test(input.ownerId ?? "")) return "Escolha o responsável.";
  for (const n of [input.promoters, input.actionsPerMonth]) if (n != null && (!Number.isInteger(n) || n < 0 || n > 100000)) return "Porte inválido.";
  if (input.potentialCents != null && (!Number.isInteger(input.potentialCents) || input.potentialCents < 0)) return "Valor mensal inválido.";
  return null;
}

function nextActionError(nextAction: string | null | undefined, date: string | null | undefined): string | null {
  if (!clean(nextAction)) return "Informe a próxima ação.";
  if (!isIsoDate(date)) return "Informe a data da próxima ação.";
  return null;
}

function leadValues(input: LeadInput) {
  const products = (input.products ?? []).filter((p) => (PRODUCTS as readonly string[]).includes(p));
  const manual = input.potentialCents != null;
  return {
    company: input.company.trim().slice(0, 160),
    companyKey: companyKey(input.company),
    type: input.type,
    city: clean(input.city, 80),
    region: clean(input.region, 80),
    source: input.source,
    referredBy: input.source === "Indicação" ? clean(input.referredBy) : null,
    dataSource: clean(input.dataSource),
    products,
    promoters: input.promoters ?? null,
    actionsPerMonth: input.actionsPerMonth ?? null,
    potentialCents: manual ? input.potentialCents! : potentialValue(products, input.promoters, input.actionsPerMonth).cents,
    potentialManual: manual,
    clientId: input.clientId && UUID.test(input.clientId) ? input.clientId : null,
    ownerId: input.ownerId,
    tags: [...new Set((input.tags ?? []).map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 10),
    notes: clean(input.notes, 2000),
  };
}

async function ownerError(db: DB | Tx, ownerId: string): Promise<string | null> {
  const [owner] = await db.select({ role: s.users.role, status: s.users.status }).from(s.users).where(eq(s.users.id, ownerId));
  if (!owner || owner.status !== "active") return "Responsável inválido.";
  return can(owner.role, "crm.view") ? null : "O responsável precisa ter acesso ao Comercial (dono ou gestor).";
}

export async function createLead(actor: Actor, input: LeadInput, opts: { confirmDuplicate?: boolean; source?: string } = {}): Promise<Result<{ id: string; number: number }>> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const error = validateBase(input) ?? nextActionError(input.nextAction, input.nextActionDate);
  if (error) return fail(error);
  const contact = input.contact?.name?.trim() ? input.contact : null;
  if (contact?.whatsapp?.trim() && !phoneDigits(contact.whatsapp)) return fail("WhatsApp inválido. Informe DDD + número.");
  const db = await getDb();
  const owner = await ownerError(db, input.ownerId);
  if (owner) return fail(owner);
  if (!opts.confirmDuplicate) {
    const duplicate = await findDuplicate(db, input.company, contact?.whatsapp ?? null);
    if (duplicate) return { ok: false, error: `Já existe um lead parecido: #${duplicate.number} ${duplicate.title}.`, duplicate };
  }
  const [first] = await db.select().from(s.crmStages).where(eq(s.crmStages.key, "prospect"));
  if (!first) return fail("Funil não configurado.");
  const row = await db.transaction(async (tx) => {
    const [lead] = await tx
      .insert(s.leads)
      .values({ ...leadValues(input), stageId: first.id, nextAction: clean(input.nextAction), nextActionDate: input.nextActionDate!, createdBy: actor.id })
      .returning({ id: s.leads.id, number: s.leads.number });
    await tx.insert(s.leadStageHistory).values({ leadId: lead.id, fromStageId: null, toStageId: first.id, userId: actor.id });
    if (contact) await tx.insert(s.leadContacts).values({ leadId: lead.id, name: contact.name.trim(), role: clean(contact.role, 80), whatsapp: clean(contact.whatsapp, 30), whatsappDigits: phoneDigits(contact.whatsapp), email: clean(contact.email, 120), isPrimary: true });
    await audit(actor.id, "lead", lead.id, "created", { after: { company: input.company.trim() }, source: opts.source }, tx);
    return lead;
  });
  return { ok: true, ...row, message: "Lead criado." };
}

export async function updateLead(actor: Actor, id: string, input: LeadInput): Promise<Result> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const lead = await getLead(actor, id);
  if (!lead) return fail("Lead não encontrado.");
  const needsNext = lead.stage.kind === "open" || lead.stage.kind === "nurture";
  const error = validateBase(input) ?? (needsNext ? nextActionError(input.nextAction, input.nextActionDate) : null);
  if (error) return fail(error);
  const db = await getDb();
  const owner = input.ownerId === lead.ownerId ? null : await ownerError(db, input.ownerId);
  if (owner) return fail(owner);
  const values = leadValues(input);
  await db.update(s.leads).set({ ...values, ...(needsNext ? { nextAction: clean(input.nextAction), nextActionDate: input.nextActionDate! } : {}), updatedAt: new Date() }).where(eq(s.leads.id, id));
  await audit(actor.id, "lead", id, "updated", { before: { company: lead.company, ownerId: lead.ownerId, potentialCents: lead.potentialCents }, after: { company: values.company, ownerId: values.ownerId, potentialCents: values.potentialCents } });
  return { ok: true, message: "Lead atualizado." };
}

/** Só a próxima ação (o atalho mais usado no dia a dia). */
export async function setNextAction(actor: Actor, id: string, nextAction: string, nextActionDate: string): Promise<Result> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const lead = await getLead(actor, id);
  if (!lead) return fail("Lead não encontrado.");
  if (lead.stage.kind === "won" || lead.stage.kind === "lost") return fail("Lead encerrado não tem próxima ação.");
  const error = nextActionError(nextAction, nextActionDate);
  if (error) return fail(error);
  const db = await getDb();
  await db.update(s.leads).set({ nextAction: clean(nextAction), nextActionDate, updatedAt: new Date() }).where(eq(s.leads.id, id));
  return { ok: true, message: "Próxima ação atualizada." };
}

export interface MoveExtra {
  nextAction?: string | null;
  nextActionDate?: string | null;
  lossReason?: string | null;
  lossNote?: string | null;
  resumeDate?: string | null;
  proposalValueCents?: number | null;
  proposalDate?: string | null;
  proposalValidUntil?: string | null;
}

/** Ganho: cria (ou reaproveita) o contratante e abre a demanda de implantação. */
async function convertWon(tx: Tx, actor: Actor, lead: NonNullable<Awaited<ReturnType<typeof getLead>>>, valueCents: number) {
  let clientId = lead.clientId;
  if (!clientId) {
    const [client] = await tx
      .insert(s.clients)
      .values({ name: lead.company, kind: lead.type === "Representante" ? "rep" : "agency", monthlyValueCents: valueCents || null, notes: `Veio do Comercial (lead #${lead.number}). Produtos: ${lead.products.join(", ") || "a definir"}.` })
      .returning({ id: s.clients.id });
    clientId = client.id;
    if (lead.contacts.length) await tx.insert(s.clientContacts).values(lead.contacts.map((c) => ({ clientId: client.id, name: c.name, role: c.role, whatsapp: c.whatsapp, email: c.email })));
    await audit(actor.id, "client", client.id, "created", { after: { name: lead.company, leadId: lead.id }, source: "comercial" }, tx);
  }
  const categories = await tx.select().from(s.categories).orderBy(asc(s.categories.position));
  const category = categories.find((c) => c.name === "Implantação do app") ?? categories[0];
  const [demand] = await tx
    .insert(s.demands)
    .values({ title: `Implantação — ${lead.company}`, clientId, categoryId: category.id, assigneeId: lead.ownerId, priority: "high", dueDate: addDays(todayIso(), 7), origin: "system", description: `Lead #${lead.number} ganho. Produtos: ${lead.products.join(", ") || "a definir"}.`, createdBy: actor.id })
    .returning({ id: s.demands.id });
  await tx.insert(s.demandHistory).values({ demandId: demand.id, userId: actor.id, field: "created", toValue: `Comercial: lead #${lead.number} ganho` });
  const [template] = await tx.select({ id: s.checklistTemplates.id }).from(s.checklistTemplates).where(and(eq(s.checklistTemplates.name, "Implantação de cliente novo"), eq(s.checklistTemplates.status, "published")));
  let withChecklist = false;
  if (template) {
    const copied = await copyTemplateInto(tx, demand.id, template.id, 1);
    if (copied) {
      await tx.update(s.demands).set({ templateId: template.id, templateVersion: copied.version }).where(eq(s.demands.id, demand.id));
      withChecklist = true;
    }
  }
  await audit(actor.id, "demand", demand.id, "created", { after: { leadId: lead.id }, source: "comercial" }, tx);
  return { clientId, demandId: demand.id, withChecklist };
}

export async function moveLead(actor: Actor, id: string, stageId: string, extra: MoveExtra = {}, source?: string): Promise<Result<{ demandId?: string }>> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const lead = await getLead(actor, id);
  if (!lead) return fail("Lead não encontrado.");
  const target = lead.stages.find((x) => x.id === stageId && x.active);
  if (!target) return fail("Etapa não encontrada.");
  if (target.id === lead.stageId) return { ok: true };
  if (lead.stage.kind === "won") return fail("Lead ganho não volta no funil: o contratante e a implantação já foram criados.");
  const today = todayIso();
  const now = new Date();
  const set: Partial<typeof s.leads.$inferInsert> = { stageId: target.id, stageSince: now, updatedAt: now };
  const key = target.key as StageKey | null;

  if (target.kind === "lost") {
    if (!(LOSS_REASONS as readonly string[]).includes(extra.lossReason ?? "")) return fail("Informe o motivo da perda.");
    if (extra.lossReason === "Outro" && !clean(extra.lossNote)) return fail("Motivo “Outro”: descreva em uma linha.");
    Object.assign(set, { lossReason: extra.lossReason, lossNote: clean(extra.lossNote, 500), lostAt: now, nextAction: null, nextActionDate: null });
  } else if (target.kind === "nurture") {
    if (!isIsoDate(extra.resumeDate) || extra.resumeDate <= today) return fail("Nutrição: informe a data de retomada (no futuro).");
    Object.assign(set, { nextAction: clean(extra.nextAction) ?? "Retomar contato", nextActionDate: extra.resumeDate, lossReason: null, lossNote: null, lostAt: null });
  } else if (target.kind === "open") {
    const nextAction = clean(extra.nextAction) ?? lead.nextAction;
    const nextDate = extra.nextActionDate ?? lead.nextActionDate;
    const error = nextActionError(nextAction, nextDate);
    if (error) return fail(error);
    Object.assign(set, { nextAction, nextActionDate: nextDate, lossReason: null, lossNote: null, lostAt: null });
    if (key === "proposal") {
      const value = extra.proposalValueCents ?? lead.proposalValueCents;
      if (!value || !Number.isInteger(value) || value <= 0) return fail("Proposta: informe o valor mensal.");
      const date = extra.proposalDate ?? lead.proposalDate ?? today;
      const valid = extra.proposalValidUntil ?? lead.proposalValidUntil ?? addDays(date, PROPOSAL_VALID_DAYS);
      if (!isIsoDate(date) || !isIsoDate(valid) || valid < date) return fail("Proposta: confira a data e a validade.");
      Object.assign(set, { proposalValueCents: value, proposalDate: date, proposalValidUntil: valid });
    }
  } else {
    Object.assign(set, { wonAt: now, nextAction: null, nextActionDate: null, lossReason: null, lossNote: null, lostAt: null });
    if (extra.proposalValueCents != null) {
      if (!Number.isInteger(extra.proposalValueCents) || extra.proposalValueCents < 0) return fail("Valor mensal inválido.");
      set.proposalValueCents = extra.proposalValueCents;
    }
  }
  if (key !== "prospect" && !lead.firstContactAt && target.kind !== "lost" && target.kind !== "nurture") set.firstContactAt = now;
  if (key && RESPONDED_KEYS.includes(key) && !lead.respondedAt) set.respondedAt = now;

  const db = await getDb();
  const result = await db.transaction(async (tx) => {
    let won: Awaited<ReturnType<typeof convertWon>> | null = null;
    if (target.kind === "won") {
      won = await convertWon(tx, actor, lead, set.proposalValueCents ?? lead.proposalValueCents ?? lead.potentialCents ?? 0);
      Object.assign(set, { wonClientId: won.clientId, wonDemandId: won.demandId });
    }
    await tx.update(s.leads).set(set).where(eq(s.leads.id, id));
    await tx.insert(s.leadStageHistory).values({ leadId: id, fromStageId: lead.stageId, toStageId: target.id, userId: actor.id });
    await audit(actor.id, "lead", id, "stage_changed", { before: { stage: lead.stage.name }, after: { stage: target.name, lossReason: set.lossReason ?? undefined }, source }, tx);
    return won;
  });
  if (result) {
    const client = lead.clientId ? "Contratante já existia (expansão)" : "Contratante criado";
    const checklist = result.withChecklist ? "com o checklist de implantação" : "sem checklist (o modelo “Implantação de cliente novo” ainda está em rascunho)";
    return { ok: true, demandId: result.demandId, message: `Ganho! ${client}; demanda de implantação aberta ${checklist}. O contrato em rascunho entra na Fase 5.` };
  }
  return { ok: true, message: `Movido para ${target.name}.` };
}

export interface InteractionInput {
  kind: InteractionKind;
  summary: string;
  outcome: Outcome;
  nextAction?: string | null;
  nextActionDate?: string | null;
  templateId?: string | null;
}

async function insertInteraction(tx: Tx, actor: Actor, lead: NonNullable<Awaited<ReturnType<typeof getLead>>>, input: InteractionInput) {
  const now = new Date();
  await tx.insert(s.leadInteractions).values({ leadId: lead.id, userId: actor.id, kind: input.kind, summary: input.summary.trim().slice(0, 1000), outcome: input.outcome, templateId: input.templateId && UUID.test(input.templateId) ? input.templateId : null });
  const set: Partial<typeof s.leads.$inferInsert> = { updatedAt: now };
  if (!lead.firstContactAt) set.firstContactAt = now;
  const answered = input.outcome === "answered" || input.outcome === "scheduled";
  if (answered && !lead.respondedAt) set.respondedAt = now;
  const open = lead.stage.kind === "open" || lead.stage.kind === "nurture";
  if (open) Object.assign(set, { nextAction: clean(input.nextAction), nextActionDate: input.nextActionDate });
  // Registrar o primeiro contato tira o lead da lista; responder leva para "Em conversa".
  const wanted: StageKey | null = answered && (lead.stage.key === "prospect" || lead.stage.key === "contacted") ? "talking" : lead.stage.key === "prospect" ? "contacted" : null;
  const target = wanted ? lead.stages.find((x) => x.key === wanted && x.active) : null;
  if (target) {
    Object.assign(set, { stageId: target.id, stageSince: now });
    await tx.insert(s.leadStageHistory).values({ leadId: lead.id, fromStageId: lead.stageId, toStageId: target.id, userId: actor.id });
  }
  await tx.update(s.leads).set(set).where(eq(s.leads.id, lead.id));
  return target?.name ?? null;
}

function interactionError(lead: { stage: Stage }, input: InteractionInput): string | null {
  if (!(INTERACTION_KINDS as readonly string[]).includes(input.kind)) return "Tipo de interação inválido.";
  if (!(OUTCOMES as readonly string[]).includes(input.outcome)) return "Informe o resultado.";
  if (input.summary.trim().length < 3) return "Escreva um resumo curto.";
  if (lead.stage.kind === "open" || lead.stage.kind === "nurture") return nextActionError(input.nextAction, input.nextActionDate);
  return null;
}

export async function addInteraction(actor: Actor, leadId: string, input: InteractionInput): Promise<Result> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const lead = await getLead(actor, leadId);
  if (!lead) return fail("Lead não encontrado.");
  const error = interactionError(lead, input);
  if (error) return fail(error);
  const db = await getDb();
  const moved = await db.transaction((tx) => insertInteraction(tx, actor, lead, input));
  return { ok: true, message: moved ? `Interação registrada. Lead movido para ${moved}.` : "Interação registrada." };
}

/**
 * "Abrir no WhatsApp": devolve o link wa.me com o texto pronto e registra a
 * interação. Quem envia é a pessoa, no WhatsApp dela — o sistema não envia nada.
 */
export async function openWhatsapp(actor: Actor, leadId: string, input: { contactId: string; templateId?: string | null; text: string; nextAction?: string | null; nextActionDate?: string | null }): Promise<Result<{ url: string }>> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const lead = await getLead(actor, leadId);
  if (!lead) return fail("Lead não encontrado.");
  const contact = lead.contacts.find((c) => c.id === input.contactId);
  if (!contact) return fail("Contato não encontrado.");
  if (contact.optOut) return fail("Este contato pediu para não receber mensagens.");
  if (!contact.whatsappDigits) return fail("Este contato não tem WhatsApp cadastrado.");
  const text = input.text.trim();
  if (text.length < 3) return fail("Escreva a mensagem.");
  if (/\{(nome|empresa|cidade|produto)\}/.test(text)) return fail("A mensagem ainda tem variável sem preencher (entre chaves). Complete antes de abrir.");
  const db = await getDb();
  let templateName = "texto livre";
  if (input.templateId && UUID.test(input.templateId)) {
    const [tpl] = await db.select({ name: s.messageTemplates.name }).from(s.messageTemplates).where(eq(s.messageTemplates.id, input.templateId));
    if (tpl) templateName = `modelo “${tpl.name}”`;
  }
  const interaction: InteractionInput = { kind: "whatsapp", summary: `Mensagem para ${contact.name} (${templateName}).`, outcome: "sent", nextAction: input.nextAction, nextActionDate: input.nextActionDate, templateId: input.templateId };
  const error = interactionError(lead, interaction);
  if (error) return fail(error);
  await db.transaction((tx) => insertInteraction(tx, actor, lead, interaction));
  return { ok: true, url: whatsappLink(contact.whatsappDigits, text), message: "Interação registrada. Envie a mensagem no WhatsApp." };
}

// --- Contatos (LGPD: só dado profissional; opt-out; exclusão a pedido) -------

export async function addLeadContact(actor: Actor, leadId: string, input: { name: string; role?: string | null; whatsapp?: string | null; email?: string | null }): Promise<Result> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const lead = await getLead(actor, leadId);
  if (!lead) return fail("Lead não encontrado.");
  if (input.name.trim().length < 2) return fail("Informe o nome do contato.");
  if (input.whatsapp?.trim() && !phoneDigits(input.whatsapp)) return fail("WhatsApp inválido. Informe DDD + número.");
  const db = await getDb();
  await db.insert(s.leadContacts).values({ leadId, name: input.name.trim().slice(0, 120), role: clean(input.role, 80), whatsapp: clean(input.whatsapp, 30), whatsappDigits: phoneDigits(input.whatsapp), email: clean(input.email, 120), isPrimary: lead.contacts.length === 0 });
  return { ok: true, message: "Contato adicionado." };
}

export async function setContactOptOut(actor: Actor, contactId: string, optOut: boolean): Promise<Result> {
  if (!can(actor.role, "crm.view") || !UUID.test(contactId)) return fail(DENIED);
  const db = await getDb();
  const [contact] = await db.select().from(s.leadContacts).where(eq(s.leadContacts.id, contactId));
  if (!contact) return fail("Contato não encontrado.");
  await db.update(s.leadContacts).set({ optOut, optOutAt: optOut ? new Date() : null }).where(eq(s.leadContacts.id, contactId));
  await audit(actor.id, "lead_contact", contactId, optOut ? "opt_out" : "opt_in", { after: { leadId: contact.leadId } });
  return { ok: true, message: optOut ? "Marcado: não enviar mensagens." : "Contato liberado para mensagens." };
}

/** Exclusão a pedido do titular: apaga o dado de verdade (a auditoria guarda só o fato, sem nome ou telefone). */
export async function removeLeadContact(actor: Actor, contactId: string): Promise<Result> {
  if (!can(actor.role, "crm.view") || !UUID.test(contactId)) return fail(DENIED);
  const db = await getDb();
  const [contact] = await db.select({ leadId: s.leadContacts.leadId }).from(s.leadContacts).where(eq(s.leadContacts.id, contactId));
  if (!contact) return fail("Contato não encontrado.");
  await db.update(s.outboundMessages).set({ contactId: null, status: "cancelled" }).where(eq(s.outboundMessages.contactId, contactId));
  await db.delete(s.leadContacts).where(eq(s.leadContacts.id, contactId));
  await audit(actor.id, "lead_contact", contactId, "deleted", { after: { leadId: contact.leadId } });
  return { ok: true, message: "Contato excluído." };
}

/** Exclui o lead (lógico, com motivo) e apaga de verdade os dados de contato. */
export async function deleteLead(actor: Actor, id: string, reason: string): Promise<Result> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  if (reason.trim().length < 3) return fail("Informe o motivo da exclusão.");
  const lead = await getLead(actor, id);
  if (!lead) return fail("Lead não encontrado.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(s.outboundMessages).set({ contactId: null, status: "cancelled" }).where(eq(s.outboundMessages.leadId, id));
    await tx.delete(s.leadContacts).where(eq(s.leadContacts.leadId, id));
    await tx.update(s.leads).set({ deletedAt: new Date() }).where(eq(s.leads.id, id));
    await audit(actor.id, "lead", id, "deleted", { reason: reason.trim(), before: { company: lead.company } }, tx);
  });
  return { ok: true, message: "Lead excluído." };
}

// --- Modelos de mensagem ---------------------------------------------------

export async function listMessageTemplates(actor: Actor) {
  if (!can(actor.role, "crm.view")) return [];
  const db = await getDb();
  return db
    .select({ t: s.messageTemplates, stageName: s.crmStages.name, stagePosition: s.crmStages.position })
    .from(s.messageTemplates)
    .leftJoin(s.crmStages, eq(s.crmStages.id, s.messageTemplates.stageId))
    .where(ne(s.messageTemplates.status, "archived"))
    .orderBy(sql`${s.crmStages.position} asc nulls last`, asc(s.messageTemplates.name));
}

export async function saveMessageTemplate(actor: Actor, id: string | null, input: { name: string; stageId?: string | null; body: string; status?: "draft" | "approved" | "archived" }): Promise<Result> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  const name = input.name.trim();
  const body = input.body.trim();
  if (name.length < 3) return fail("Informe o nome do modelo.");
  if (body.length < 10) return fail("Escreva o texto do modelo.");
  if (body.length > 2000) return fail("Texto muito longo (máximo de 2.000 caracteres).");
  const unknown = [...body.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).filter((v) => !["nome", "empresa", "cidade", "produto"].includes(v));
  if (unknown.length) return fail(`Variável desconhecida: {${unknown[0]}}. Use {nome}, {empresa}, {cidade} ou {produto}.`);
  // Aprovar (e arquivar) é do dono; quem edita sem ser dono devolve o texto para rascunho.
  const manage = can(actor.role, "crm.manage");
  const status = manage ? (input.status ?? "draft") : "draft";
  const db = await getDb();
  const stageId = input.stageId && UUID.test(input.stageId) ? input.stageId : null;
  const values = { name, stageId, body, status, toValidate: status === "approved" ? false : undefined, updatedAt: new Date() };
  if (!id) {
    const [row] = await db.insert(s.messageTemplates).values({ ...values, toValidate: false }).returning({ id: s.messageTemplates.id });
    await audit(actor.id, "message_template", row.id, "created", { after: { name, status } });
    return { ok: true, message: "Modelo criado." };
  }
  if (!UUID.test(id)) return fail("Modelo não encontrado.");
  const [before] = await db.select().from(s.messageTemplates).where(eq(s.messageTemplates.id, id));
  if (!before) return fail("Modelo não encontrado.");
  await db.update(s.messageTemplates).set(values).where(eq(s.messageTemplates.id, id));
  await audit(actor.id, "message_template", id, "updated", { before: { status: before.status, body: before.body }, after: { status, body } });
  return { ok: true, message: status === "approved" ? "Modelo aprovado." : status === "archived" ? "Modelo arquivado." : "Modelo salvo como rascunho." };
}

/** Texto do modelo já com os dados do lead (o que não tiver valor fica entre chaves). */
export function renderForLead(body: string, lead: { company: string; city: string | null; products: string[] }, contactName: string | null): string {
  return fillTemplate(body, { nome: contactName?.split(" ")[0] ?? null, empresa: lead.company, cidade: lead.city, produto: lead.products.join(" e ") || null });
}

// --- Comercial hoje --------------------------------------------------------

export async function commercialToday(actor: Actor, owner?: string) {
  const today = todayIso();
  const [rows, goal] = await Promise.all([listLeads(actor, { scope: "open", owner }), dailyGoal()]);
  const overdue: LeadRow[] = [];
  const dueToday: LeadRow[] = [];
  const proposal: LeadRow[] = [];
  for (const lead of rows) {
    const g = todayGroup(lead, today);
    if (g === "overdue") overdue.push(lead);
    else if (g === "today") dueToday.push(lead);
    else if (g === "proposal") proposal.push(lead);
  }
  let contactsToday = 0;
  if (can(actor.role, "crm.view")) {
    const db = await getDb();
    const where = [isNull(s.leads.deletedAt), sql`(${s.leads.firstContactAt} at time zone 'America/Sao_Paulo')::date = ${today}::date`];
    if (owner && UUID.test(owner)) where.push(eq(s.leads.ownerId, owner));
    const [done] = await db.select({ n: sql<number>`count(*)::int` }).from(s.leads).where(and(...where));
    contactsToday = done?.n ?? 0;
  }
  // Sugestões para bater a meta: os próximos de "A prospectar" que ainda não apareceram nos grupos acima.
  const shown = new Set([...overdue, ...dueToday].map((l) => l.id));
  const toProspect = rows.filter((l) => l.stageKey === "prospect" && !shown.has(l.id)).slice(0, Math.max(0, goal - contactsToday));
  return { today, goal, contactsToday, overdue, dueToday, proposal, toProspect };
}

// --- Painel comercial ------------------------------------------------------

const brDay = (col: unknown) => sql<string | null>`to_char((${col} at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')`;

export async function commercialDashboard(actor: Actor, month: string) {
  if (!can(actor.role, "crm.view")) return null;
  const db = await getDb();
  const [stages, leadRows, moveRows, goal] = await Promise.all([
    listStages(),
    db
      .select({ id: s.leads.id, type: s.leads.type, source: s.leads.source, stageKind: s.crmStages.kind, stageProbability: s.crmStages.probability, potential: s.leads.potentialCents, proposal: s.leads.proposalValueCents, firstContactDay: brDay(s.leads.firstContactAt), respondedDay: brDay(s.leads.respondedAt), wonDay: brDay(s.leads.wonAt), lostDay: brDay(s.leads.lostAt), lossReason: s.leads.lossReason })
      .from(s.leads)
      .innerJoin(s.crmStages, eq(s.crmStages.id, s.leads.stageId))
      .where(isNull(s.leads.deletedAt)),
    db
      .select({ leadId: s.leadStageHistory.leadId, toKey: s.crmStages.key, toPosition: s.crmStages.position, toKind: s.crmStages.kind, day: brDay(s.leadStageHistory.createdAt) })
      .from(s.leadStageHistory)
      .innerJoin(s.crmStages, eq(s.crmStages.id, s.leadStageHistory.toStageId))
      .innerJoin(s.leads, eq(s.leads.id, s.leadStageHistory.leadId))
      .where(isNull(s.leads.deletedAt)),
    dailyGoal(),
  ]);
  const leads: MetricLead[] = leadRows.map((l) => ({ ...l, valueCents: l.proposal ?? l.potential ?? 0 }));
  const moves: MetricMove[] = moveRows.filter((m) => m.toKind === "open" || m.toKind === "won").map((m) => ({ leadId: m.leadId, toKey: m.toKey, toPosition: m.toPosition, day: m.day ?? "" }));
  const from = monthStart(month);
  const to = monthEnd(month);
  const today = todayIso();
  const thisWeek = weekStart(today);
  const weeks = [-21, -14, -7, 0].map((d) => addDays(thisWeek, d));
  return {
    from,
    to,
    goal,
    weeks: contactsByWeek(leads, weeks, goal),
    response: responseRate(leads, from, to),
    demos: reachedInPeriod(moves, "demo", from, to),
    proposals: reachedInPeriod(moves, "proposal", from, to),
    won: wonMrr(leads, from, to),
    conversion: stageConversion(moves, stages.filter((x) => x.active && (x.kind === "open" || x.kind === "won")).map((x) => ({ name: x.name, position: x.position }))),
    cycleDays: averageCycleDays(leads, from, to),
    pipeline: pipeline(leads),
    lossReasons: lossReasons(leads, from, to),
    bySource: resultsBy(leads, "source"),
    byType: resultsBy(leads, "type"),
    total: leads.length,
  };
}

// --- Importação de CSV -----------------------------------------------------

export interface ImportPreviewRow {
  line: number;
  company: string;
  contact: string;
  whatsapp: string;
  city: string;
  type: string;
  source: string;
  problem: string | null;
  duplicateOf: string | null;
}

/**
 * Importa leads para "A prospectar". Com `dryRun`, só mostra o que entraria.
 * Duplicata (mesmo WhatsApp ou mesma empresa, no banco ou no próprio arquivo) é pulada.
 */
export async function importLeads(actor: Actor, csv: string, opts: { dryRun: boolean; ownerId?: string }): Promise<Result<{ rows: ImportPreviewRow[]; created: number; skipped: number }>> {
  if (!can(actor.role, "crm.view")) return fail(DENIED);
  if (csv.length > 500_000) return fail("Arquivo muito grande (máximo de 500 KB).");
  const parsed = parseLeadsCsv(csv);
  if (parsed.error) return fail(parsed.error);
  if (parsed.rows.length > 1000) return fail("Máximo de 1.000 linhas por importação.");
  const ownerId = opts.ownerId && UUID.test(opts.ownerId) ? opts.ownerId : actor.id;
  const db = await getDb();
  const owner = await ownerError(db, ownerId);
  if (owner) return fail(owner);
  const [first] = await db.select().from(s.crmStages).where(eq(s.crmStages.key, "prospect"));
  if (!first) return fail("Funil não configurado.");
  const today = todayIso();
  const seenNames = new Set<string>();
  const seenPhones = new Set<string>();
  const rows: ImportPreviewRow[] = [];
  let created = 0;
  for (const r of parsed.rows) {
    const key = companyKey(r.company);
    const digits = phoneDigits(r.whatsapp);
    const type = matchOption(r.type, LEAD_TYPES, "Agência de promotoria");
    const source = matchOption(r.source, LEAD_SOURCES, "Prospecção ativa");
    const row: ImportPreviewRow = { ...r, type, source, problem: null, duplicateOf: null };
    if (key.length < 2) row.problem = "Empresa em branco.";
    else if (r.whatsapp && !digits) row.problem = "WhatsApp inválido (entra sem o número).";
    if (seenNames.has(key) || (digits && seenPhones.has(digits))) row.duplicateOf = "linha repetida no arquivo";
    else {
      const dup = key.length >= 2 ? await findDuplicate(db, r.company, r.whatsapp) : null;
      if (dup) row.duplicateOf = `#${dup.number} ${dup.title}`;
    }
    seenNames.add(key);
    if (digits) seenPhones.add(digits);
    rows.push(row);
    if (opts.dryRun || row.duplicateOf || key.length < 2) continue;
    await db.transaction(async (tx) => {
      const [lead] = await tx
        .insert(s.leads)
        .values({ company: r.company.trim().slice(0, 160), companyKey: key, type, city: clean(r.city, 80), source: source === "Indicação" ? "Outro" : source, dataSource: "Importação de planilha", products: [], potentialCents: 0, ownerId, stageId: first.id, nextAction: "Fazer o primeiro contato", nextActionDate: today, createdBy: actor.id })
        .returning({ id: s.leads.id });
      await tx.insert(s.leadStageHistory).values({ leadId: lead.id, fromStageId: null, toStageId: first.id, userId: actor.id });
      if (r.contact.trim() || digits) await tx.insert(s.leadContacts).values({ leadId: lead.id, name: r.contact.trim() || r.company.trim(), whatsapp: digits ? r.whatsapp.trim() : null, whatsappDigits: digits, isPrimary: true });
    });
    created++;
  }
  const skipped = rows.filter((r) => r.duplicateOf || companyKey(r.company).length < 2).length;
  if (!opts.dryRun) await audit(actor.id, "lead", "import", "imported", { after: { created, skipped } });
  return { ok: true, rows, created, skipped, message: opts.dryRun ? undefined : `${created} ${created === 1 ? "lead importado" : "leads importados"}; ${skipped} ${skipped === 1 ? "pulado" : "pulados"}.` };
}

/** Para a tela do lead: contratantes que podem ser vinculados (expansão). */
export async function expansionClients() {
  const db = await getDb();
  return db.select({ id: s.clients.id, name: s.clients.name }).from(s.clients).where(and(isNull(s.clients.deletedAt), ne(s.clients.name, INTERNAL_CLIENT_NAME))).orderBy(asc(s.clients.name));
}

/** Pessoas que podem ser responsáveis por lead (dono e gestor). */
export async function crmPeople() {
  const db = await getDb();
  const people = await db.select({ id: s.users.id, name: s.users.name, role: s.users.role }).from(s.users).where(eq(s.users.status, "active")).orderBy(asc(s.users.name));
  return people.filter((p) => can(p.role, "crm.view")).map(({ id, name }) => ({ id, name }));
}

export { NURTURE_DAYS, cadence };
