/**
 * Rotinas recorrentes: geram demandas sozinhas. A geração é IDEMPOTENTE — a
 * chave (rotina, data da ocorrência) é única, então rodar duas vezes não duplica.
 * Roda pelo cron (/api/cron/rotinas) e, por garantia, na primeira abertura do dia.
 */
import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { addDays, isIsoDate, todayIso } from "@/lib/dates";
import { PRIORITIES, type Priority } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { occurrencesBetween, routineTitle, type Frequency } from "@/lib/routines";
import { audit } from "./audit";
import { getDb, schema as s } from "./db";
import type { Actor, Result } from "./demands";
import { generateStockAlerts } from "./stock";
import { copyTemplateInto } from "./templates";
import { pruneActivity } from "./time";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
/** Se o cron falhar alguns dias, recupera ocorrências de até uma semana atrás. */
const CATCH_UP_DAYS = 7;

export interface RoutineInput {
  name: string;
  clientId: string;
  categoryId: string;
  typeId?: string | null;
  assigneeId: string;
  priority?: Priority;
  frequency: Frequency;
  weekdays?: number[];
  monthDay?: number | null;
  intervalDays?: number | null;
  startDate: string;
  leadDays?: number;
  dueOffsetDays?: number;
  templateId?: string | null;
  active?: boolean;
}

export async function listRoutines(actor: Actor) {
  if (!can(actor.role, "routine.manage")) return [];
  const db = await getDb();
  return db
    .select({ r: s.routines, clientName: s.clients.name, categoryName: s.categories.name, assigneeName: s.users.name, generated: sql<number>`(select count(*)::int from ${s.routineRuns} where ${s.routineRuns.routineId} = ${s.routines.id})` })
    .from(s.routines)
    .innerJoin(s.clients, eq(s.clients.id, s.routines.clientId))
    .innerJoin(s.categories, eq(s.categories.id, s.routines.categoryId))
    .innerJoin(s.users, eq(s.users.id, s.routines.assigneeId))
    .orderBy(asc(s.routines.name));
}

export async function saveRoutine(actor: Actor, id: string | null, input: RoutineInput): Promise<Result> {
  if (!can(actor.role, "routine.manage")) return fail("Sem permissão.");
  const name = input.name.trim();
  if (name.length < 3) return fail("Informe o nome da rotina.");
  if (![input.clientId, input.categoryId, input.assigneeId].every((v) => UUID.test(v ?? ""))) return fail("Informe contratante, categoria e responsável.");
  if (!isIsoDate(input.startDate)) return fail("Informe a data de início.");
  const priority = input.priority ?? "medium";
  if (!PRIORITIES.includes(priority)) return fail("Prioridade inválida.");
  const weekdays = [...new Set((input.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const monthDay = input.monthDay ?? null;
  const intervalDays = input.intervalDays ?? null;
  if (input.frequency === "weekly" && !weekdays.length) return fail("Escolha pelo menos um dia da semana.");
  if (input.frequency === "monthly" && (!monthDay || !Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)) return fail("Informe o dia do mês (1 a 31).");
  if (input.frequency === "interval" && (!intervalDays || !Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)) return fail("Informe de quantos em quantos dias (1 a 365).");
  if (!["weekly", "monthly", "interval"].includes(input.frequency)) return fail("Frequência inválida.");
  const leadDays = input.leadDays ?? 0;
  const dueOffsetDays = input.dueOffsetDays ?? 0;
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 60) return fail("Antecedência: 0 a 60 dias.");
  if (!Number.isInteger(dueOffsetDays) || dueOffsetDays < 0 || dueOffsetDays > 90) return fail("Prazo relativo: 0 a 90 dias.");

  const db = await getDb();
  const [[client], [category], [person]] = await Promise.all([
    db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.id, input.clientId), isNull(s.clients.deletedAt))),
    db.select({ id: s.categories.id }).from(s.categories).where(eq(s.categories.id, input.categoryId)),
    db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.id, input.assigneeId), eq(s.users.status, "active"))),
  ]);
  if (!client || !category || !person) return fail("Contratante, categoria ou responsável inválido.");
  if (input.typeId) {
    const [ty] = await db.select({ categoryId: s.demandTypes.categoryId }).from(s.demandTypes).where(eq(s.demandTypes.id, input.typeId));
    if (ty?.categoryId !== input.categoryId) return fail("O tipo escolhido não pertence a esta categoria.");
  }
  if (input.templateId) {
    const [tpl] = await db.select({ status: s.checklistTemplates.status }).from(s.checklistTemplates).where(eq(s.checklistTemplates.id, input.templateId));
    if (tpl?.status !== "published") return fail("O modelo de checklist precisa estar publicado.");
  }
  const values = { name, clientId: input.clientId, categoryId: input.categoryId, typeId: input.typeId || null, assigneeId: input.assigneeId, priority, frequency: input.frequency, weekdays, monthDay, intervalDays, startDate: input.startDate, leadDays, dueOffsetDays, templateId: input.templateId || null, active: input.active ?? true, updatedAt: new Date() };
  if (!id) {
    const [row] = await db.insert(s.routines).values(values).returning({ id: s.routines.id });
    await audit(actor.id, "routine", row.id, "created", { after: values });
    return { ok: true, message: "Rotina criada." };
  }
  if (!UUID.test(id)) return fail("Rotina não encontrada.");
  await db.update(s.routines).set(values).where(eq(s.routines.id, id));
  await audit(actor.id, "routine", id, "updated", { after: values });
  return { ok: true, message: "Rotina atualizada." };
}

/** Gera as demandas devidas até hoje (considerando a antecedência). Idempotente. */
export async function generateRoutines(today: string = todayIso()): Promise<{ created: number }> {
  const db = await getDb();
  const routines = await db.select().from(s.routines).where(eq(s.routines.active, true));
  let created = 0;
  for (const r of routines) {
    const from = addDays(today, -CATCH_UP_DAYS) > r.startDate ? addDays(today, -CATCH_UP_DAYS) : r.startDate;
    for (const occurrence of occurrencesBetween(r, from, addDays(today, r.leadDays))) {
      const made = await db
        .transaction(async (tx) => {
          const [done] = await tx.select({ d: s.routineRuns.demandId }).from(s.routineRuns).where(and(eq(s.routineRuns.routineId, r.id), eq(s.routineRuns.occurrence, occurrence)));
          if (done) return false;
          const [demand] = await tx
            .insert(s.demands)
            .values({ title: routineTitle(r.name, r.frequency, occurrence), clientId: r.clientId, categoryId: r.categoryId, typeId: r.typeId, assigneeId: r.assigneeId, priority: r.priority, dueDate: addDays(occurrence, r.dueOffsetDays), origin: "routine", routineId: r.id, createdBy: r.assigneeId })
            .returning({ id: s.demands.id });
          // Chave única (rotina, ocorrência): numa corrida, a segunda tentativa falha aqui e desfaz a demanda.
          await tx.insert(s.routineRuns).values({ routineId: r.id, occurrence, demandId: demand.id });
          await tx.insert(s.demandHistory).values({ demandId: demand.id, userId: null, field: "created", toValue: `Rotina: ${r.name}` });
          if (r.templateId) await copyTemplateInto(tx, demand.id, r.templateId, 1);
          await audit(null, "demand", demand.id, "created", { after: { routineId: r.id, occurrence }, source: "rotina" }, tx);
          return true;
        })
        .catch((err: unknown) => {
          if (String((err as { code?: string }).code) === "23505" || /duplicate key|routine_runs/i.test(String(err))) return false;
          throw err;
        });
      if (made) created++;
    }
  }
  return { created };
}

/** Garantia além do cron: na primeira abertura do dia, gera o que estiver devido. */
export async function runRoutinesOncePerDay(): Promise<void> {
  const db = await getDb();
  const today = todayIso();
  const [last] = await db.select().from(s.settings).where(eq(s.settings.key, "routines_last_run"));
  if (last?.value === today) return;
  await generateRoutines(today);
  await generateStockAlerts(today);
  await pruneActivity(today);
  await db.insert(s.settings).values({ key: "routines_last_run", value: today }).onConflictDoUpdate({ target: s.settings.key, set: { value: today, updatedAt: new Date() } });
}

/** Demandas geradas hoje por rotinas (painel inicial). */
export async function generatedToday(today: string = todayIso()): Promise<number> {
  const db = await getDb();
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(s.routineRuns).where(sql`(${s.routineRuns.createdAt} at time zone 'America/Sao_Paulo')::date = ${today}::date`);
  return row?.n ?? 0;
}
