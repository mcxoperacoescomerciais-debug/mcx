/**
 * Programação diária e roteiros. Toda alteração em programação existente
 * exige justificativa e fica no histórico (auditoria). Freelancers não
 * precisam de roteiro fixo: a programação pode ser criada avulsa.
 */
import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { promoterFilter } from "./scope";
import { AUTO_CANCEL_REASON } from "./portfolio";
import { addDays, isIsoDate, weekdayOf } from "@/lib/dates";
import type { ActionResult } from "./manager";

const fail = (error: string): ActionResult => ({ ok: false, error });
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function canPlan(scope: Scope): boolean {
  // Gestor restrito a marcas (cliente) não monta a programação da agência.
  return (scope.role === "admin" || scope.role === "manager") && scope.brandIds === null;
}

async function promoterOk(scope: Scope, promoterId: string) {
  const db = await getDb();
  const [p] = await db.select().from(s.users).where(and(eq(s.users.id, promoterId), eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter")));
  if (!p || p.status !== "active") return null;
  if (scope.promoterIds !== null && !scope.promoterIds.includes(promoterId)) return null;
  return p;
}

/** Marcas que o promotor pode atender na loja. */
export async function allowedBrands(promoterId: string, storeId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: s.storeBrands.brandId })
    .from(s.storeBrands)
    .innerJoin(s.userBrands, and(eq(s.userBrands.brandId, s.storeBrands.brandId), eq(s.userBrands.userId, promoterId)))
    .innerJoin(s.brands, and(eq(s.brands.id, s.storeBrands.brandId), eq(s.brands.status, "active")))
    .where(eq(s.storeBrands.storeId, storeId));
  // Atribuições na loja: só as marcas atribuídas ao promotor ali.
  const assigned = await db.select({ id: s.visitTargets.brandId }).from(s.visitTargets).where(and(eq(s.visitTargets.promoterId, promoterId), eq(s.visitTargets.storeId, storeId)));
  const set = new Set(assigned.map((a) => a.id));
  return rows.map((r) => r.id).filter((id) => !set.size || set.has(id));
}

export async function listDaySchedules(scope: Scope, date: string, promoterId: string | null) {
  const db = await getDb();
  const rows = await db
    .select({
      id: s.schedules.id,
      seq: s.schedules.seq,
      plannedStart: s.schedules.plannedStart,
      status: s.schedules.status,
      cancelReason: s.schedules.cancelReason,
      notes: s.schedules.notes,
      promoterId: s.users.id,
      promoterName: s.users.name,
      storeId: s.stores.id,
      storeName: s.stores.name,
      city: s.stores.city,
      routeId: s.schedules.routeId,
      visitStatus: sql<string | null>`(select v.status from ${s.visits} v where v.schedule_id = ${s.schedules.id} and v.status <> 'cancelled' limit 1)`,
    })
    .from(s.schedules)
    .innerJoin(s.users, eq(s.users.id, s.schedules.promoterId))
    .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
    .where(
      and(
        eq(s.schedules.agencyId, scope.agencyId),
        eq(s.schedules.date, date),
        promoterFilter(scope, s.schedules.promoterId),
        promoterId ? eq(s.schedules.promoterId, promoterId) : undefined,
        // Retirada automática (dia saiu da atribuição) não é cancelamento do gestor: não aparece.
        sql`not (${s.schedules.status} = 'cancelled' and ${s.schedules.origin} = 'assignment' and ${s.schedules.cancelReason} = ${AUTO_CANCEL_REASON})`,
      ),
    )
    .orderBy(asc(s.users.name), asc(s.schedules.seq), asc(s.schedules.plannedStart));
  const brands = rows.length
    ? await db
        .select({ scheduleId: s.scheduleBrands.scheduleId, id: s.brands.id, name: s.brands.name })
        .from(s.scheduleBrands)
        .innerJoin(s.brands, eq(s.brands.id, s.scheduleBrands.brandId))
        .where(inArray(s.scheduleBrands.scheduleId, rows.map((r) => r.id)))
    : [];
  return rows.map((r) => ({ ...r, brands: brands.filter((b) => b.scheduleId === r.id) }));
}

export interface ScheduleInput {
  promoterId: string;
  storeId: string;
  date: string;
  plannedStart: string | null;
  brandIds: string[];
  notes: string | null;
}

export async function createSchedule(scope: Scope, input: ScheduleInput): Promise<ActionResult> {
  if (!canPlan(scope)) return fail("Sem permissão para programar.");
  if (!isIsoDate(input.date)) return fail("Data inválida.");
  if (input.plannedStart && !HHMM.test(input.plannedStart)) return fail("Horário inválido (use HH:MM).");
  const p = await promoterOk(scope, input.promoterId);
  if (!p) return fail("Promotor inválido ou inativo.");
  const db = await getDb();
  const [authorized] = await db.select().from(s.userStores).where(and(eq(s.userStores.userId, input.promoterId), eq(s.userStores.storeId, input.storeId)));
  if (!authorized) return fail("Loja não autorizada para este promotor. Autorize em Cadastros › Usuários.");
  const allowed = await allowedBrands(input.promoterId, input.storeId);
  const brandIds = input.brandIds.length ? input.brandIds.filter((b) => allowed.includes(b)) : allowed;
  if (!brandIds.length) return fail("Nenhuma marca autorizada para este promotor nesta loja.");
  const [dup] = await db
    .select({ id: s.schedules.id })
    .from(s.schedules)
    .where(and(eq(s.schedules.promoterId, input.promoterId), eq(s.schedules.storeId, input.storeId), eq(s.schedules.date, input.date), eq(s.schedules.status, "active")));
  if (dup) return fail("Esta loja já está programada para o promotor nesta data.");
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${s.schedules.seq}), -1)::int + 1` })
    .from(s.schedules)
    .where(and(eq(s.schedules.promoterId, input.promoterId), eq(s.schedules.date, input.date)));
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(s.schedules)
      .values({ agencyId: scope.agencyId, promoterId: input.promoterId, storeId: input.storeId, date: input.date, seq: next, plannedStart: input.plannedStart, notes: input.notes, createdBy: scope.userId, updatedBy: scope.userId })
      .returning({ id: s.schedules.id });
    await tx.insert(s.scheduleBrands).values(brandIds.map((b) => ({ scheduleId: row.id, brandId: b })));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "schedule", row.id, "created", { after: { ...input, brandIds } }, tx);
  });
  return { ok: true, message: "Loja adicionada à programação." };
}

async function loadSchedule(scope: Scope, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(s.schedules).where(and(eq(s.schedules.id, id), eq(s.schedules.agencyId, scope.agencyId)));
  if (!row || (scope.promoterIds !== null && !scope.promoterIds.includes(row.promoterId))) return null;
  return row;
}

export async function updateSchedule(scope: Scope, id: string, patch: { plannedStart: string | null; brandIds: string[] }, reason: string): Promise<ActionResult> {
  if (!canPlan(scope)) return fail("Sem permissão.");
  if (reason.trim().length < 5) return fail("Informe a justificativa da alteração.");
  if (patch.plannedStart && !HHMM.test(patch.plannedStart)) return fail("Horário inválido.");
  const row = await loadSchedule(scope, id);
  if (!row || row.status !== "active") return fail("Programação não encontrada.");
  const allowed = await allowedBrands(row.promoterId, row.storeId);
  const brandIds = patch.brandIds.filter((b) => allowed.includes(b));
  if (!brandIds.length) return fail("Escolha ao menos uma marca autorizada.");
  const db = await getDb();
  const before = (await db.select({ id: s.scheduleBrands.brandId }).from(s.scheduleBrands).where(eq(s.scheduleBrands.scheduleId, id))).map((r) => r.id);
  await db.transaction(async (tx) => {
    await tx.update(s.schedules).set({ plannedStart: patch.plannedStart, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.schedules.id, id));
    await tx.delete(s.scheduleBrands).where(eq(s.scheduleBrands.scheduleId, id));
    await tx.insert(s.scheduleBrands).values(brandIds.map((b) => ({ scheduleId: id, brandId: b })));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "schedule", id, "updated", { before: { plannedStart: row.plannedStart, brandIds: before }, after: { plannedStart: patch.plannedStart, brandIds }, reason: reason.trim() }, tx);
  });
  return { ok: true, message: "Programação alterada." };
}

export async function cancelSchedule(scope: Scope, id: string, reason: string): Promise<ActionResult> {
  if (!canPlan(scope)) return fail("Sem permissão.");
  if (reason.trim().length < 5) return fail("Informe o motivo do cancelamento.");
  const row = await loadSchedule(scope, id);
  if (!row || row.status !== "active") return fail("Programação não encontrada.");
  const db = await getDb();
  const [visit] = await db.select({ id: s.visits.id }).from(s.visits).where(and(eq(s.visits.scheduleId, id), ne(s.visits.status, "cancelled")));
  if (visit) return fail("Já existe visita registrada para esta programação; ela não pode ser cancelada.");
  await db.update(s.schedules).set({ status: "cancelled", cancelReason: reason.trim(), updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.schedules.id, id));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "schedule", id, "cancelled", { reason: reason.trim() });
  return { ok: true, message: "Programação cancelada." };
}

export async function moveSchedule(scope: Scope, id: string, dir: -1 | 1): Promise<ActionResult> {
  if (!canPlan(scope)) return fail("Sem permissão.");
  const row = await loadSchedule(scope, id);
  if (!row) return fail("Programação não encontrada.");
  const db = await getDb();
  const day = await db
    .select({ id: s.schedules.id, seq: s.schedules.seq })
    .from(s.schedules)
    .where(and(eq(s.schedules.promoterId, row.promoterId), eq(s.schedules.date, row.date), eq(s.schedules.status, "active")))
    .orderBy(asc(s.schedules.seq), asc(s.schedules.createdAt));
  const i = day.findIndex((d) => d.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= day.length) return { ok: true };
  const order = [...day];
  [order[i], order[j]] = [order[j], order[i]];
  await db.transaction(async (tx) => {
    for (const [seq, d] of order.entries()) await tx.update(s.schedules).set({ seq }).where(eq(s.schedules.id, d.id));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "schedule", id, "reordered", { after: { order: order.map((o) => o.id) } }, tx);
  });
  return { ok: true };
}

/** Cria as programações dos roteiros ativos no intervalo (pula o que já existe). */
export async function generateFromRoutes(scope: Scope, from: string, to: string): Promise<ActionResult> {
  if (!canPlan(scope)) return fail("Sem permissão.");
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return fail("Período inválido.");
  if (to > addDays(from, 31)) return fail("Gere no máximo 31 dias por vez.");
  const db = await getDb();
  const routes = await db
    .select()
    .from(s.routes)
    .where(and(eq(s.routes.agencyId, scope.agencyId), eq(s.routes.status, "active"), promoterFilter(scope, s.routes.promoterId)));
  let created = 0;
  let skipped = 0;
  for (const route of routes) {
    if (!route.promoterId) continue;
    const stops = await db.select().from(s.routeStops).where(eq(s.routeStops.routeId, route.id)).orderBy(asc(s.routeStops.seq));
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!route.weekdays.includes(weekdayOf(d))) continue;
      for (const stop of stops) {
        const r = await createSchedule(scope, { promoterId: route.promoterId, storeId: stop.storeId, date: d, plannedStart: stop.plannedStart, brandIds: stop.brandIds, notes: null });
        if (r.ok) {
          created++;
          await db
            .update(s.schedules)
            .set({ routeId: route.id, origin: "route" })
            .where(and(eq(s.schedules.promoterId, route.promoterId), eq(s.schedules.storeId, stop.storeId), eq(s.schedules.date, d), eq(s.schedules.status, "active")));
        } else skipped++;
      }
    }
  }
  // Atribuições com dias fixos (cadastro do promotor) também geram programação.
  const { generateFromAssignments } = await import("./portfolio");
  const fromAssignments = await generateFromAssignments(scope, from, to);
  created += fromAssignments.created;
  skipped += fromAssignments.skipped;
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "schedule", `${from}..${to}`, "generated_from_routes", { after: { created, skipped } });
  return { ok: true, message: `${created} programação(ões) criada(s); ${skipped} já existia(m) ou não puderam ser criadas.` };
}

// ───────────────────────────── Roteiros ─────────────────────────────

export async function listRoutes(scope: Scope) {
  const db = await getDb();
  const routes = await db
    .select({ r: s.routes, promoterName: s.users.name })
    .from(s.routes)
    .leftJoin(s.users, eq(s.users.id, s.routes.promoterId))
    .where(and(eq(s.routes.agencyId, scope.agencyId), scope.promoterIds !== null ? promoterFilter(scope, s.routes.promoterId) : undefined))
    .orderBy(asc(s.routes.name));
  const stops = routes.length
    ? await db
        .select({ stop: s.routeStops, storeName: s.stores.name, city: s.stores.city })
        .from(s.routeStops)
        .innerJoin(s.stores, eq(s.stores.id, s.routeStops.storeId))
        .where(inArray(s.routeStops.routeId, routes.map((r) => r.r.id)))
        .orderBy(asc(s.routeStops.seq))
    : [];
  return routes.map((r) => ({ ...r, stops: stops.filter((x) => x.stop.routeId === r.r.id) }));
}

export interface RouteInput {
  id: string | null;
  name: string;
  region: string | null;
  promoterId: string | null;
  weekdays: number[];
  status: "active" | "inactive";
  stops: { storeId: string; plannedStart: string | null }[];
}

export async function saveRoute(scope: Scope, input: RouteInput, reason: string): Promise<ActionResult> {
  if (!canPlan(scope)) return fail("Sem permissão.");
  if (input.name.trim().length < 3) return fail("Dê um nome ao roteiro.");
  if (!input.weekdays.length) return fail("Escolha os dias da semana.");
  if (input.stops.some((st) => st.plannedStart && !HHMM.test(st.plannedStart))) return fail("Horário inválido em uma das lojas.");
  if (input.promoterId && !(await promoterOk(scope, input.promoterId))) return fail("Promotor inválido.");
  if (input.id && reason.trim().length < 5) return fail("Informe a justificativa da alteração do roteiro.");
  const db = await getDb();
  const stopBrands = await Promise.all(input.stops.map(async (st) => (input.promoterId ? allowedBrands(input.promoterId, st.storeId) : [])));
  await db.transaction(async (tx) => {
    let id = input.id;
    if (id) {
      await tx
        .update(s.routes)
        .set({ name: input.name.trim(), region: input.region, promoterId: input.promoterId, weekdays: input.weekdays, status: input.status, updatedAt: new Date(), updatedBy: scope.userId })
        .where(and(eq(s.routes.id, id), eq(s.routes.agencyId, scope.agencyId)));
      await tx.delete(s.routeStops).where(eq(s.routeStops.routeId, id));
    } else {
      const [row] = await tx
        .insert(s.routes)
        .values({ agencyId: scope.agencyId, name: input.name.trim(), region: input.region, promoterId: input.promoterId, weekdays: input.weekdays, status: input.status, createdBy: scope.userId })
        .returning({ id: s.routes.id });
      id = row.id;
    }
    const seen = new Set<string>();
    let seq = 0;
    for (const [i, st] of input.stops.entries()) {
      if (seen.has(st.storeId)) continue;
      seen.add(st.storeId);
      await tx.insert(s.routeStops).values({ routeId: id!, storeId: st.storeId, seq: seq++, plannedStart: st.plannedStart, brandIds: stopBrands[i] });
    }
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "route", id!, input.id ? "updated" : "created", { after: { ...input, id }, reason: reason.trim() || null }, tx);
  });
  return { ok: true, message: "Roteiro salvo." };
}
