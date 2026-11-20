/**
 * Tempo — sem bater ponto. Três fontes, da mais confiável para a menos:
 *   A) tempo apontado por demanda (conclusão obrigatória, cronômetro opcional, lançamento manual);
 *   B) "tempo no sistema": sinal a cada 60 s com a aba visível e interação recente (indicativo);
 *   C) eventos do dia, tirados do histórico das demandas.
 * Cada pessoa vê tudo o que é registrado sobre ela ("Meu dia"). O operacional só vê o próprio tempo.
 */
import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { isIsoDate, todayIso } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { getDb, schema as s, type DB } from "./db";
import type { Actor, Result } from "./demands";

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const UUID = /^[0-9a-f-]{36}$/i;
export const MAX_ENTRY_MINUTES = 16 * 60;
/** Cronômetro esquecido ligado: vale no máximo isto. */
export const MAX_TIMER_MINUTES = 8 * 60;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export function validMinutes(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX_ENTRY_MINUTES;
}

/** A demanda existe e o ator a enxerga (mesma regra de visibilidade das demandas). */
async function canSeeDemand(db: DB | Tx, actor: Actor, demandId: string): Promise<boolean> {
  if (!UUID.test(demandId)) return false;
  const [d] = await db.select({ id: s.demands.id, assigneeId: s.demands.assigneeId, createdBy: s.demands.createdBy }).from(s.demands).where(and(eq(s.demands.id, demandId), isNull(s.demands.deletedAt)));
  if (!d) return false;
  if (can(actor.role, "demand.viewAll") || d.assigneeId === actor.id || d.createdBy === actor.id) return true;
  const [share] = await db.select({ u: s.demandShares.userId }).from(s.demandShares).where(and(eq(s.demandShares.demandId, demandId), eq(s.demandShares.userId, actor.id)));
  return !!share;
}

/** Minutos já apontados por uma pessoa numa demanda. */
export async function loggedMinutes(db: DB | Tx, demandId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${s.timeEntries.minutes}), 0)::int` })
    .from(s.timeEntries)
    .where(and(eq(s.timeEntries.demandId, demandId), eq(s.timeEntries.userId, userId), isNull(s.timeEntries.deletedAt)));
  return row?.n ?? 0;
}

export function timerMinutes(startedAt: Date, now: Date = new Date()): number {
  return Math.min(MAX_TIMER_MINUTES, Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60_000)));
}

async function stopTimerTx(tx: DB | Tx, userId: string): Promise<{ demandId: string; minutes: number } | null> {
  const [timer] = await tx.select().from(s.timers).where(eq(s.timers.userId, userId));
  if (!timer) return null;
  const minutes = timerMinutes(timer.startedAt);
  await tx.insert(s.timeEntries).values({ demandId: timer.demandId, userId, day: todayIso(), minutes, source: "timer" });
  await tx.delete(s.timers).where(eq(s.timers.userId, userId));
  return { demandId: timer.demandId, minutes };
}

/** Inicia o cronômetro. Só um ativo por pessoa: iniciar outro para o anterior (e avisa). */
export async function startTimer(actor: Actor, demandId: string): Promise<Result> {
  const db = await getDb();
  if (!(await canSeeDemand(db, actor, demandId))) return fail("Demanda não encontrada.");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(s.timers).where(eq(s.timers.userId, actor.id));
    if (current?.demandId === demandId) return { ok: true as const, message: "O cronômetro já está rodando nesta demanda." };
    const stopped = await stopTimerTx(tx, actor.id);
    await tx.insert(s.timers).values({ userId: actor.id, demandId });
    return { ok: true as const, message: stopped ? `Cronômetro iniciado. O anterior foi parado e ${stopped.minutes} min foram apontados na outra demanda.` : "Cronômetro iniciado." };
  });
}

export async function stopTimer(actor: Actor): Promise<Result> {
  const db = await getDb();
  const stopped = await db.transaction((tx) => stopTimerTx(tx, actor.id));
  return stopped ? { ok: true, message: `${stopped.minutes} min apontados.` } : fail("Não há cronômetro rodando.");
}

export async function activeTimer(userId: string) {
  const db = await getDb();
  const [t] = await db
    .select({ demandId: s.timers.demandId, startedAt: s.timers.startedAt, title: s.demands.title })
    .from(s.timers)
    .innerJoin(s.demands, eq(s.demands.id, s.timers.demandId))
    .where(eq(s.timers.userId, userId));
  return t ?? null;
}

export async function addManualEntry(actor: Actor, demandId: string, input: { day: string; minutes: number; note?: string | null }): Promise<Result> {
  if (!isIsoDate(input.day) || input.day > todayIso()) return fail("Data inválida (não pode ser no futuro).");
  if (!validMinutes(input.minutes)) return fail("Informe a duração em minutos.");
  const db = await getDb();
  if (!(await canSeeDemand(db, actor, demandId))) return fail("Demanda não encontrada.");
  await db.insert(s.timeEntries).values({ demandId, userId: actor.id, day: input.day, minutes: input.minutes, source: "manual", note: (input.note ?? "").trim() || null });
  return { ok: true, message: "Tempo lançado." };
}

async function editableEntry(db: DB, actor: Actor, entryId: string) {
  if (!UUID.test(entryId)) return null;
  const [e] = await db.select().from(s.timeEntries).where(and(eq(s.timeEntries.id, entryId), isNull(s.timeEntries.deletedAt)));
  if (!e) return null;
  return e.userId === actor.id || can(actor.role, "time.viewAll") ? e : null;
}

/** Correção de um lançamento: o valor anterior fica na auditoria. */
export async function updateEntry(actor: Actor, entryId: string, minutes: number): Promise<Result> {
  if (!validMinutes(minutes)) return fail("Informe a duração em minutos.");
  const db = await getDb();
  const e = await editableEntry(db, actor, entryId);
  if (!e) return fail("Lançamento não encontrado.");
  await db.update(s.timeEntries).set({ minutes, updatedAt: new Date() }).where(eq(s.timeEntries.id, entryId));
  await audit(actor.id, "time_entry", entryId, "updated", { before: { minutes: e.minutes }, after: { minutes } });
  return { ok: true, message: "Tempo corrigido." };
}

export async function deleteEntry(actor: Actor, entryId: string): Promise<Result> {
  const db = await getDb();
  const e = await editableEntry(db, actor, entryId);
  if (!e) return fail("Lançamento não encontrado.");
  await db.update(s.timeEntries).set({ deletedAt: new Date() }).where(eq(s.timeEntries.id, entryId));
  await audit(actor.id, "time_entry", entryId, "deleted", { before: { minutes: e.minutes, day: e.day } });
  return { ok: true, message: "Lançamento removido." };
}

/** Tempo da demanda: o operacional vê só os próprios lançamentos. */
export async function demandTime(actor: Actor, demandId: string) {
  const db = await getDb();
  if (!(await canSeeDemand(db, actor, demandId))) return { entries: [], total: 0, mine: 0, timerStartedAt: null as Date | null };
  const all = can(actor.role, "time.viewAll");
  const entries = await db
    .select({ id: s.timeEntries.id, userId: s.timeEntries.userId, userName: s.users.name, day: s.timeEntries.day, minutes: s.timeEntries.minutes, source: s.timeEntries.source, note: s.timeEntries.note })
    .from(s.timeEntries)
    .innerJoin(s.users, eq(s.users.id, s.timeEntries.userId))
    .where(and(eq(s.timeEntries.demandId, demandId), isNull(s.timeEntries.deletedAt), all ? undefined : eq(s.timeEntries.userId, actor.id)))
    .orderBy(desc(s.timeEntries.day), desc(s.timeEntries.createdAt));
  const [timer] = await db.select().from(s.timers).where(and(eq(s.timers.userId, actor.id), eq(s.timers.demandId, demandId)));
  return {
    entries,
    total: entries.reduce((a, e) => a + e.minutes, 0),
    mine: entries.filter((e) => e.userId === actor.id).reduce((a, e) => a + e.minutes, 0),
    timerStartedAt: timer?.startedAt ?? null,
  };
}

// ---------- B) tempo no sistema ----------

/** Sinal do navegador (aba visível + interação recente). Conta no máximo 1 min por sinal. */
export async function heartbeat(userId: string, now: Date = new Date()): Promise<void> {
  const db = await getDb();
  const day = todayIso(now);
  const [row] = await db.select().from(s.activityDays).where(and(eq(s.activityDays.userId, userId), eq(s.activityDays.day, day)));
  if (!row) {
    await db.insert(s.activityDays).values({ userId, day, minutes: 1, firstAt: now, lastAt: now }).onConflictDoNothing();
    return;
  }
  // Sinais repetidos (duas abas, reenvio) dentro de 45 s não somam.
  if (now.getTime() - row.lastAt.getTime() < 45_000) return;
  await db.update(s.activityDays).set({ minutes: row.minutes + 1, lastAt: now }).where(and(eq(s.activityDays.userId, userId), eq(s.activityDays.day, day)));
}

/** Retenção: dados de atividade ficam 12 meses. */
export async function pruneActivity(today: string = todayIso()): Promise<void> {
  const db = await getDb();
  const limit = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  await db.delete(s.activityDays).where(sql`${s.activityDays.day} < ${limit}`);
}

// ---------- "Meu dia" e painel da equipe ----------

export async function dayOf(actor: Actor, userId: string, day: string) {
  if (userId !== actor.id && !can(actor.role, "time.viewAll")) return null;
  const db = await getDb();
  const [[activity], entries, events] = await Promise.all([
    db.select().from(s.activityDays).where(and(eq(s.activityDays.userId, userId), eq(s.activityDays.day, day))),
    db
      .select({ id: s.timeEntries.id, minutes: s.timeEntries.minutes, source: s.timeEntries.source, demandId: s.timeEntries.demandId, title: s.demands.title, clientName: s.clients.name })
      .from(s.timeEntries)
      .innerJoin(s.demands, eq(s.demands.id, s.timeEntries.demandId))
      .innerJoin(s.clients, eq(s.clients.id, s.demands.clientId))
      .where(and(eq(s.timeEntries.userId, userId), eq(s.timeEntries.day, day), isNull(s.timeEntries.deletedAt)))
      .orderBy(asc(s.timeEntries.createdAt)),
    db
      .select({ field: s.demandHistory.field, toValue: s.demandHistory.toValue, demandId: s.demandHistory.demandId, title: s.demands.title, at: s.demandHistory.createdAt })
      .from(s.demandHistory)
      .innerJoin(s.demands, eq(s.demands.id, s.demandHistory.demandId))
      .where(and(eq(s.demandHistory.userId, userId), sql`(${s.demandHistory.createdAt} at time zone 'America/Sao_Paulo')::date = ${day}::date`, inArray(s.demandHistory.field, ["created", "status"])))
      .orderBy(asc(s.demandHistory.createdAt)),
  ]);
  return {
    systemMinutes: activity?.minutes ?? 0,
    firstAt: activity?.firstAt ?? null,
    lastAt: activity?.lastAt ?? null,
    loggedMinutes: entries.reduce((a, e) => a + e.minutes, 0),
    entries,
    created: events.filter((e) => e.field === "created").length,
    moved: events.filter((e) => e.field === "status").length,
    completed: events.filter((e) => e.field === "status" && e.toValue === "Concluído").length,
    events,
  };
}

/** Painel da equipe (dono e gestor): por pessoa, o dia e a carga aberta. */
export async function teamDay(actor: Actor, day: string) {
  if (!can(actor.role, "team.view")) return [];
  const db = await getDb();
  const people = await db.select({ id: s.users.id, name: s.users.name, weeklyHours: s.users.weeklyHours }).from(s.users).where(eq(s.users.status, "active")).orderBy(asc(s.users.name));
  const load = await db
    .select({ assigneeId: s.demands.assigneeId, n: sql<number>`count(*)::int`, estimate: sql<number>`coalesce(sum(${s.demands.estimateMinutes}), 0)::int`, overdue: sql<number>`count(*) filter (where ${s.demands.dueDate} < ${day})::int` })
    .from(s.demands)
    .where(and(isNull(s.demands.deletedAt), inArray(s.demands.status, OPEN_STATUSES)))
    .groupBy(s.demands.assigneeId);
  const rows = [];
  for (const p of people) {
    const d = await dayOf(actor, p.id, day);
    const l = load.find((x) => x.assigneeId === p.id);
    rows.push({ ...p, systemMinutes: d?.systemMinutes ?? 0, firstAt: d?.firstAt ?? null, lastAt: d?.lastAt ?? null, loggedMinutes: d?.loggedMinutes ?? 0, completed: d?.completed ?? 0, open: l?.n ?? 0, overdue: l?.overdue ?? 0, estimateMinutes: l?.estimate ?? 0 });
  }
  return rows;
}

/** Lançamentos de um período, com tudo o que os relatórios precisam. Só dono e gestor. */
export async function entriesBetween(actor: Actor, from: string, to: string) {
  if (!can(actor.role, "report.view")) return [];
  const db = await getDb();
  return db
    .select({
      minutes: s.timeEntries.minutes,
      day: s.timeEntries.day,
      userId: s.timeEntries.userId,
      demandId: s.timeEntries.demandId,
      clientId: s.demands.clientId,
      clientName: s.clients.name,
      categoryName: s.categories.name,
      typeId: s.demands.typeId,
      status: s.demands.status,
    })
    .from(s.timeEntries)
    .innerJoin(s.demands, eq(s.demands.id, s.timeEntries.demandId))
    .innerJoin(s.clients, eq(s.clients.id, s.demands.clientId))
    .innerJoin(s.categories, eq(s.categories.id, s.demands.categoryId))
    .where(and(isNull(s.timeEntries.deletedAt), gte(s.timeEntries.day, from), lte(s.timeEntries.day, to)));
}
