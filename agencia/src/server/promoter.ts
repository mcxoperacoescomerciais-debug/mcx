/**
 * Servidor do app do promotor: dados para trabalhar offline (bootstrap),
 * recebimento idempotente das visitas (sync) e histórico.
 *
 * O servidor é a autoridade: revalida loja/marca autorizadas, programação,
 * duplicidade, regras de finalização e bloqueio de registros concluídos.
 * Um atendimento recusado nunca perde dados: o conteúdo é gravado e só a
 * mudança de status é negada, com a explicação devolvida ao aparelho.
 */
import "server-only";
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { getDb, schema as s, type DB } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { addDays, todayIso } from "@/lib/dates";
import { attendanceMissing, openAttendances, pendingBrandsForClose, storedQuantity, validateStock } from "@/lib/rules";
import type {
  AttendanceInput,
  AttendanceSyncResult,
  BootstrapPayload,
  PromoterHistoryItem,
  ServerAttendance,
  ServerVisit,
  VisitInput,
  VisitSyncResult,
} from "@/lib/sync-types";
import type { AttendanceStatus } from "@/lib/domain";
import { classify } from "@/lib/validity";
import { daysBetween } from "@/lib/dates";
import { notifyCriticalAttendance } from "./whatsapp-alert";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// ───────────────────────────── Autorização do promotor ─────────────────────────────

/** Lojas ativas autorizadas → marcas que o promotor pode atender em cada uma. */
export async function promoterAccess(db: DB | Tx, promoterId: string, agencyId: string): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ storeId: s.userStores.storeId, brandId: s.storeBrands.brandId })
    .from(s.userStores)
    .innerJoin(s.stores, and(eq(s.stores.id, s.userStores.storeId), eq(s.stores.status, "active"), eq(s.stores.agencyId, agencyId)))
    .leftJoin(s.storeBrands, eq(s.storeBrands.storeId, s.userStores.storeId))
    .where(eq(s.userStores.userId, promoterId));
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.storeId)) map.set(r.storeId, new Set());
    if (r.brandId) map.get(r.storeId)!.add(r.brandId);
  }
  // Mantém só as marcas autorizadas ao promotor e ativas (o join acima traz todas as da loja).
  const authorized = await db
    .select({ brandId: s.userBrands.brandId })
    .from(s.userBrands)
    .innerJoin(s.brands, and(eq(s.brands.id, s.userBrands.brandId), eq(s.brands.status, "active")))
    .where(eq(s.userBrands.userId, promoterId));
  const ok = new Set(authorized.map((a) => a.brandId));
  for (const set of map.values()) for (const b of [...set]) if (!ok.has(b)) set.delete(b);
  return map;
}

/** Produtos acompanhados na loja para a marca (lista própria da loja ou, sem lista, todos os ativos da marca). */
export async function trackedProducts(db: DB | Tx, storeId: string, brandId: string): Promise<string[]> {
  const custom = await db
    .select({ id: s.products.id })
    .from(s.storeProducts)
    .innerJoin(s.products, eq(s.products.id, s.storeProducts.productId))
    .where(and(eq(s.storeProducts.storeId, storeId), eq(s.products.brandId, brandId), eq(s.products.status, "active")));
  if (custom.length) return custom.map((c) => c.id);
  const all = await db
    .select({ id: s.products.id })
    .from(s.products)
    .where(and(eq(s.products.brandId, brandId), eq(s.products.status, "active")));
  return all.map((p) => p.id);
}

// ───────────────────────────── Bootstrap ─────────────────────────────

export async function buildBootstrap(scope: Scope): Promise<BootstrapPayload> {
  const db = await getDb();
  const promoterId = scope.userId;
  const today = todayIso();
  const [user] = await db.select({ id: s.users.id, name: s.users.name, employment: s.users.employment, mustChangePassword: s.users.mustChangePassword }).from(s.users).where(eq(s.users.id, promoterId));
  const access = await promoterAccess(db, promoterId, scope.agencyId);
  const storeIds = [...access.keys()];
  const brandIds = [...new Set([...access.values()].flatMap((b) => [...b]))];

  const [storeRows, brandRows, productRows, customRows] = await Promise.all([
    storeIds.length
      ? db
          .select({
            id: s.stores.id,
            name: s.stores.name,
            chainName: s.chains.name,
            code: s.stores.code,
            address: s.stores.address,
            district: s.stores.district,
            city: s.stores.city,
            state: s.stores.state,
          })
          .from(s.stores)
          .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
          .where(inArray(s.stores.id, storeIds))
      : [],
    brandIds.length ? db.select().from(s.brands).where(inArray(s.brands.id, brandIds)) : [],
    brandIds.length
      ? db
          .select()
          .from(s.products)
          .where(and(inArray(s.products.brandId, brandIds), eq(s.products.status, "active")))
          .orderBy(s.products.sortOrder, s.products.name)
      : [],
    storeIds.length
      ? db.select().from(s.storeProducts).where(inArray(s.storeProducts.storeId, storeIds))
      : [],
  ]);

  const storeProducts: Record<string, string[]> = {};
  for (const r of customRows) (storeProducts[r.storeId] ??= []).push(r.productId);

  // Programação de hoje e amanhã (amanhã: para o promotor se planejar).
  const scheduleRows = await db
    .select()
    .from(s.schedules)
    .where(
      and(
        eq(s.schedules.promoterId, promoterId),
        eq(s.schedules.status, "active"),
        gte(s.schedules.date, today),
        sql`${s.schedules.date} <= ${addDays(today, 1)}`,
      ),
    )
    .orderBy(s.schedules.date, s.schedules.seq);
  const sb = scheduleRows.length
    ? await db.select().from(s.scheduleBrands).where(inArray(s.scheduleBrands.scheduleId, scheduleRows.map((r) => r.id)))
    : [];

  const visits = await serverVisitsForPromoter(db, promoterId, today);

  // Último levantamento de estoque das lojas programadas (referência na tela de estoque).
  const lastStock: BootstrapPayload["lastStock"] = {};
  const scheduledStores = [...new Set(scheduleRows.map((r) => r.storeId))];
  if (scheduledStores.length) {
    type Row = { store_id: string; product_id: string; state: string; quantity: number | null; visit_date: string };
    const rows = await db.execute(sql`
      select distinct on (v.store_id, se.product_id) v.store_id, se.product_id, se.state, se.quantity, v.visit_date::text as visit_date
      from ${s.stockEntries} se
      join ${s.attendances} a on a.id = se.attendance_id
      join ${s.visits} v on v.id = a.visit_id
      where v.store_id in (${sql.join(scheduledStores.map((x) => sql`${x}`), sql`, `)})
        and a.status = 'completed' and v.visit_date < ${today}
      order by v.store_id, se.product_id, v.visit_date desc, se.recorded_at desc
    `);
    for (const r of rowsOf<Row>(rows)) {
      (lastStock[r.store_id] ??= {})[r.product_id] = { state: r.state, quantity: r.quantity, date: r.visit_date };
    }
  }

  return {
    user: { id: user.id, name: user.name, employment: user.employment, mustChangePassword: user.mustChangePassword },
    agency: { name: scope.agencyName, logoUrl: scope.agencyLogoUrl },
    settings: {
      allowIncompleteVisit: scope.settings.allowIncompleteVisit,
      allowExtraVisits: scope.settings.allowExtraVisits,
      captureLocation: scope.settings.captureLocation,
      allowExceptions: scope.settings.allowExceptions,
      validityBands: scope.settings.validityBands,
    },
    today,
    brands: brandRows
      .map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        minBeforePhotos: b.minBeforePhotos,
        minAfterPhotos: b.minAfterPhotos,
        requireStock: b.requireStock,
        rupturePhotoRequired: b.rupturePhotoRequired,
        allowGallery: b.allowGallery,
        activities: b.activities,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    stores: storeRows
      .map((st) => ({ ...st, brandIds: [...(access.get(st.id) ?? [])] }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    products: productRows.map((p) => ({
      id: p.id,
      brandId: p.brandId,
      name: p.name,
      sku: p.sku,
      ean: p.ean,
      category: p.category,
      variant: p.variant,
      package: p.package,
      unit: p.unit,
    })),
    storeProducts,
    schedules: scheduleRows.map((r) => ({
      id: r.id,
      date: r.date,
      storeId: r.storeId,
      seq: r.seq,
      plannedStart: r.plannedStart,
      plannedEnd: r.plannedEnd,
      notes: r.notes,
      brandIds: sb.filter((x) => x.scheduleId === r.id).map((x) => x.brandId),
    })),
    visits,
    lastStock,
    serverTime: new Date().toISOString(),
  };
}

/** Drizzle devolve linhas como array (postgres-js) ou em `.rows` (PGlite). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** Visitas que o aparelho precisa conhecer: de hoje, abertas e com correção pedida. */
async function serverVisitsForPromoter(db: DB, promoterId: string, today: string): Promise<ServerVisit[]> {
  const correctionVisitIds = db
    .select({ id: s.attendances.visitId })
    .from(s.attendances)
    .where(eq(s.attendances.status, "correction_requested"));
  const rows = await db
    .select()
    .from(s.visits)
    .where(
      and(
        eq(s.visits.promoterId, promoterId),
        ne(s.visits.status, "cancelled"),
        or(eq(s.visits.visitDate, today), eq(s.visits.status, "in_progress"), inArray(s.visits.id, correctionVisitIds)),
      ),
    );
  return loadServerVisits(db, rows);
}

export async function loadServerVisits(db: DB, rows: (typeof s.visits.$inferSelect)[]): Promise<ServerVisit[]> {
  if (!rows.length) return [];
  const visitIds = rows.map((r) => r.id);
  const atts = await db.select().from(s.attendances).where(inArray(s.attendances.visitId, visitIds));
  const attIds = atts.map((a) => a.id);
  const none = [] as never[];
  const [ph, st, un, ru, oc, cr, va, dm] = attIds.length
    ? await Promise.all([
        db.select().from(s.photos).where(and(inArray(s.photos.attendanceId, attIds), isNull(s.photos.deletedAt))),
        db.select().from(s.stockEntries).where(inArray(s.stockEntries.attendanceId, attIds)),
        db.select().from(s.unregisteredProducts).where(and(inArray(s.unregisteredProducts.attendanceId, attIds), isNull(s.unregisteredProducts.deletedAt))),
        db.select().from(s.ruptures).where(and(inArray(s.ruptures.attendanceId, attIds), isNull(s.ruptures.deletedAt))),
        db.select().from(s.occurrences).where(and(inArray(s.occurrences.attendanceId, attIds), isNull(s.occurrences.deletedAt))),
        db.select().from(s.correctionRequests).where(and(inArray(s.correctionRequests.attendanceId, attIds), eq(s.correctionRequests.status, "open"))),
        db.select().from(s.validities).where(and(inArray(s.validities.attendanceId, attIds), isNull(s.validities.deletedAt))),
        db.select().from(s.damages).where(and(inArray(s.damages.attendanceId, attIds), isNull(s.damages.deletedAt))),
      ])
    : [none, none, none, none, none, none, none, none];
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return rows.map((v) => ({
    id: v.id,
    storeId: v.storeId,
    scheduleId: v.scheduleId,
    visitDate: v.visitDate,
    origin: v.origin,
    extraReason: v.extraReason,
    status: v.status,
    closeReason: v.closeReason,
    startedAt: v.startedAt.toISOString(),
    finishedAt: iso(v.finishedAt),
    geo: v.geoStatus ? { status: v.geoStatus, lat: v.lat, lng: v.lng, accuracy: v.accuracyM } : null,
    notes: v.notes,
    attendances: atts
      .filter((a) => a.visitId === v.id)
      .map(
        (a): ServerAttendance => ({
          id: a.id,
          brandId: a.brandId,
          status: a.status,
          startedAt: a.startedAt.toISOString(),
          finishedAt: iso(a.finishedAt),
          activitiesDone: a.activitiesDone,
          notes: a.notes,
          exceptionItems: a.exceptionItems,
          exceptionReason: a.exceptionReason,
          exceptionNote: a.exceptionNote,
          cancelReason: a.cancelReason,
          photos: ph
            .filter((p) => p.attendanceId === a.id)
            .map((p) => ({
              id: p.id,
              kind: p.kind,
              ruptureId: p.ruptureId,
              occurrenceId: p.occurrenceId,
              validityId: p.validityId,
              damageId: p.damageId,
              source: p.source,
              takenAt: p.takenAt.toISOString(),
              uploaded: Boolean(p.uploadedAt),
            })),
          deletedPhotoIds: [],
          stock: st
            .filter((x) => x.attendanceId === a.id)
            .map((x) => ({ productId: x.productId, state: x.state, quantity: x.quantity, note: x.note, recordedAt: x.recordedAt.toISOString() })),
          clearedStockProductIds: [],
          unregistered: un.filter((x) => x.attendanceId === a.id).map((x) => ({ id: x.id, description: x.description, quantity: x.quantity, note: x.note })),
          deletedUnregisteredIds: [],
          ruptures: ru
            .filter((x) => x.attendanceId === a.id)
            .map((x) => ({
              id: x.id,
              productId: x.productId,
              situation: x.situation,
              knownStock: x.knownStock,
              note: x.note,
              fromStockSuggestion: x.fromStockSuggestion,
              recordedAt: x.recordedAt.toISOString(),
            })),
          deletedRuptureIds: [],
          occurrences: oc.filter((x) => x.attendanceId === a.id).map((x) => ({ id: x.id, category: x.category, note: x.note, recordedAt: x.recordedAt.toISOString() })),
          deletedOccurrenceIds: [],
          validities: va
            .filter((x) => x.attendanceId === a.id)
            .map((x) => ({
              id: x.id,
              productId: x.productId,
              location: x.location,
              quantity: x.quantity,
              unit: x.unit as "un" | "cx" | "kg",
              expiryDate: x.expiryDate,
              lot: x.lot,
              price: x.price === null ? null : Number(x.price),
              note: x.note,
              recordedAt: x.recordedAt.toISOString(),
            })),
          deletedValidityIds: [],
          damages: dm
            .filter((x) => x.attendanceId === a.id)
            .map((x) => ({
              id: x.id,
              productId: x.productId,
              kind: x.kind,
              quantity: x.quantity,
              unit: x.unit as "un" | "cx" | "kg",
              expiryDate: x.expiryDate,
              lot: x.lot,
              note: x.note,
              recordedAt: x.recordedAt.toISOString(),
            })),
          deletedDamageIds: [],
          correction: (() => {
            const c = cr.find((x) => x.attendanceId === a.id);
            return c ? { id: c.id, reason: c.reason, requestedAt: c.requestedAt.toISOString() } : null;
          })(),
          reviewStatus: a.reviewStatus,
          reviewNote: a.reviewNote,
        }),
      ),
  }));
}

// ───────────────────────────── Sync ─────────────────────────────

class SyncError extends Error {
  constructor(
    public code: "forbidden" | "invalid" | "conflict",
    message: string,
  ) {
    super(message);
  }
}

export async function applySync(scope: Scope, visits: VisitInput[]): Promise<VisitSyncResult[]> {
  // Ordem cronológica: encerrar a visita anterior antes de abrir a seguinte.
  const ordered = [...visits].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const results: VisitSyncResult[] = [];
  for (const v of ordered) {
    try {
      results.push(await applyVisit(scope, v));
    } catch (err) {
      if (err instanceof SyncError) {
        results.push({ visitId: v.id, ok: false, code: err.code, error: err.message, attendances: [] });
      } else {
        const msg = (err as Error).message ?? "";
        const conflict = /visits_one_open_uq|visits_schedule_uq|duplicate key/.test(msg + String((err as { cause?: unknown }).cause ?? ""));
        console.error("[sync]", err);
        results.push({
          visitId: v.id,
          ok: false,
          code: conflict ? "conflict" : "invalid",
          error: conflict ? "Já existe outra visita aberta ou registrada para esta programação." : "Não foi possível gravar a visita.",
          attendances: [],
        });
      }
    }
  }
  return results;
}

async function applyVisit(scope: Scope, input: VisitInput): Promise<VisitSyncResult> {
  const db = await getDb();
  const promoterId = scope.userId;
  const actor = { agencyId: scope.agencyId, userId: promoterId };
  const access = await promoterAccess(db, promoterId, scope.agencyId);
  const allowedBrands = access.get(input.storeId);
  if (!allowedBrands) throw new SyncError("forbidden", "Loja não autorizada para você.");

  const result = await db.transaction(async (tx): Promise<VisitSyncResult> => {
    const [existing] = await tx.select().from(s.visits).where(eq(s.visits.id, input.id));
    if (existing && (existing.promoterId !== promoterId || existing.agencyId !== scope.agencyId)) {
      throw new SyncError("forbidden", "Visita de outro usuário.");
    }
    if (existing && existing.storeId !== input.storeId) throw new SyncError("invalid", "A loja da visita não pode ser alterada.");

    // Programação (ou visita extraordinária justificada).
    let plannedBrandIds: string[] = [];
    if (input.scheduleId) {
      const [sch] = await tx.select().from(s.schedules).where(eq(s.schedules.id, input.scheduleId));
      if (!sch || sch.promoterId !== promoterId || sch.storeId !== input.storeId) throw new SyncError("forbidden", "Programação não pertence a você.");
      if (!existing && sch.status !== "active") throw new SyncError("invalid", "Esta programação foi cancelada pelo gestor.");
      const [dup] = await tx
        .select({ id: s.visits.id })
        .from(s.visits)
        .where(and(eq(s.visits.scheduleId, input.scheduleId), ne(s.visits.id, input.id), ne(s.visits.status, "cancelled")));
      if (dup) throw new SyncError("conflict", "Esta loja já tem uma visita registrada para a programação de hoje.");
      plannedBrandIds = (await tx.select().from(s.scheduleBrands).where(eq(s.scheduleBrands.scheduleId, sch.id))).map((r) => r.brandId);
    } else {
      if (!existing && !scope.settings.allowExtraVisits) throw new SyncError("forbidden", "Visitas fora da programação não estão liberadas.");
      if (input.origin !== "extra" || (input.extraReason ?? "").length < 5) {
        throw new SyncError("invalid", "Visita fora da programação precisa de justificativa.");
      }
    }

    const visitLocked = existing && existing.status !== "in_progress";
    if (!existing) {
      await tx.insert(s.visits).values({
        id: input.id,
        agencyId: scope.agencyId,
        promoterId,
        storeId: input.storeId,
        scheduleId: input.scheduleId,
        visitDate: input.visitDate,
        status: "in_progress",
        origin: input.scheduleId ? "scheduled" : "extra",
        extraReason: input.scheduleId ? null : input.extraReason,
        startedAt: new Date(input.startedAt),
        lat: input.geo?.lat ?? null,
        lng: input.geo?.lng ?? null,
        accuracyM: input.geo?.accuracy ?? null,
        geoStatus: input.geo?.status ?? null,
        notes: input.notes,
        createdBy: promoterId,
        updatedBy: promoterId,
      });
      await audit(actor, "visit", input.id, "started", { after: { storeId: input.storeId, scheduleId: input.scheduleId, origin: input.scheduleId ? "scheduled" : "extra" } }, tx);
    } else if (!visitLocked) {
      await tx
        .update(s.visits)
        .set({ notes: input.notes, syncedAt: new Date(), updatedAt: new Date(), updatedBy: promoterId })
        .where(eq(s.visits.id, input.id));
    } else {
      await tx.update(s.visits).set({ syncedAt: new Date() }).where(eq(s.visits.id, input.id));
    }

    // Atendimentos (cada um independente).
    const visitRow = existing ?? { visitDate: input.visitDate, storeId: input.storeId };
    const attResults: AttendanceSyncResult[] = [];
    for (const a of input.attendances) {
      attResults.push(await applyAttendance(tx, scope, input.id, visitRow.storeId, visitRow.visitDate, allowedBrands, a));
    }

    // Encerramento da visita (validado com o estado JÁ gravado dos atendimentos).
    let visitError: string | undefined;
    if (!visitLocked && (input.status === "completed" || input.status === "closed_incomplete" || input.status === "cancelled")) {
      const atts = await tx.select({ brandId: s.attendances.brandId, status: s.attendances.status }).from(s.attendances).where(eq(s.attendances.visitId, input.id));
      const statusByBrand = Object.fromEntries(atts.map((x) => [x.brandId, x.status]));
      const planned = plannedBrandIds.length ? plannedBrandIds : atts.map((x) => x.brandId);
      const open = openAttendances({ plannedBrandIds: planned, attendanceStatus: statusByBrand });
      const pending = pendingBrandsForClose({ plannedBrandIds: planned, attendanceStatus: statusByBrand });
      if (input.status === "cancelled") {
        if (atts.some((x) => x.status === "completed")) visitError = "Visita com atendimento concluído não pode ser cancelada.";
        else if ((input.closeReason ?? "").length < 5) visitError = "Informe o motivo do cancelamento.";
      } else if (open.length) {
        visitError = "Há atendimento de marca em andamento: finalize ou cancele antes de encerrar a visita.";
      } else if (input.status === "completed" && pending.length) {
        visitError = `${pending.length} marca(s) prevista(s) ainda pendente(s).`;
      } else if (input.status === "closed_incomplete") {
        if (!scope.settings.allowIncompleteVisit) visitError = "A operação não permite encerrar visita incompleta.";
        else if ((input.closeReason ?? "").length < 5) visitError = "Informe a justificativa para encerrar com marca pendente.";
      }
      if (!visitError) {
        const finalStatus = input.status === "closed_incomplete" && !pending.length ? "completed" : input.status;
        const finishedRaw = input.finishedAt ? new Date(input.finishedAt) : new Date();
        const visitStart = existing?.startedAt ?? new Date(input.startedAt);
        const finishedAt = finishedRaw < visitStart ? visitStart : finishedRaw;
        await tx
          .update(s.visits)
          .set({
            status: finalStatus,
            closeReason: finalStatus === "completed" ? null : input.closeReason,
            finishedAt,
            updatedAt: new Date(),
            updatedBy: promoterId,
          })
          .where(eq(s.visits.id, input.id));
        await audit(actor, "visit", input.id, finalStatus === "cancelled" ? "cancelled" : "finished", {
          after: { status: finalStatus, finishedAt: finishedAt.toISOString(), pendingBrands: pending },
          reason: input.closeReason,
        }, tx);
      }
    }

    return {
      visitId: input.id,
      ok: !visitError && attResults.every((r) => r.ok || r.code === "locked"),
      error: visitError ?? attResults.find((r) => !r.ok && r.code !== "locked")?.error,
      code: visitError ? "invalid" : undefined,
      closeRejected: Boolean(visitError),
      attendances: attResults,
    };
  });
  // Alerta de validade crítica (WhatsApp) só depois do commit e em segundo plano:
  // nunca atrasa nem derruba o envio do promotor.
  for (const r of result.attendances) if (r.completedNow) void notifyCriticalAttendance(scope, r.attendanceId);
  return result;
}

async function applyAttendance(
  tx: Tx,
  scope: Scope,
  visitId: string,
  storeId: string,
  visitDate: string,
  allowedBrands: Set<string>,
  a: AttendanceInput,
): Promise<AttendanceSyncResult> {
  const promoterId = scope.userId;
  const actor = { agencyId: scope.agencyId, userId: promoterId };
  const fail = (code: AttendanceSyncResult["code"], error: string): AttendanceSyncResult => ({ attendanceId: a.id, ok: false, code, error });

  if (!allowedBrands.has(a.brandId)) return fail("forbidden", "Marca não autorizada para você nesta loja.");
  const [existing] = await tx.select().from(s.attendances).where(eq(s.attendances.id, a.id));
  if (existing && existing.visitId !== visitId) return fail("invalid", "Atendimento pertence a outra visita.");
  if (!existing) {
    const [dup] = await tx
      .select({ id: s.attendances.id })
      .from(s.attendances)
      .where(and(eq(s.attendances.visitId, visitId), eq(s.attendances.brandId, a.brandId)));
    if (dup) return fail("invalid", "Esta marca já tem um atendimento nesta visita.");
  }
  if (existing && (existing.status === "completed" || existing.status === "cancelled")) {
    return fail("locked", "Atendimento finalizado: alterações bloqueadas. Peça reabertura ao gestor.");
  }

  // Produtos da marca (para validar estoque e ruptura).
  const brandProducts = new Set(
    (await tx.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.brandId, a.brandId), eq(s.products.agencyId, scope.agencyId)))).map((p) => p.id),
  );
  for (const st of a.stock) {
    if (!brandProducts.has(st.productId)) return fail("invalid", "Produto de estoque não pertence à marca.");
    const err = validateStock(st.state, st.state === "zero" ? 0 : st.quantity);
    if (err) return fail("invalid", err);
  }
  for (const r of a.ruptures) if (!brandProducts.has(r.productId)) return fail("invalid", "Produto da ruptura não pertence à marca.");
  for (const v of a.validities) if (!brandProducts.has(v.productId)) return fail("invalid", "Produto da validade não pertence à marca.");
  for (const d of a.damages) if (!brandProducts.has(d.productId)) return fail("invalid", "Produto da avaria não pertence à marca.");
  if (new Set(a.ruptures.map((r) => r.productId)).size !== a.ruptures.length) return fail("invalid", "Ruptura duplicada para o mesmo produto.");

  // Regras de finalização (servidor decide).
  let targetStatus: AttendanceStatus = a.status === "completed" ? "completed" : a.status === "cancelled" ? "cancelled" : existing?.status === "correction_requested" ? "correction_requested" : "in_progress";
  let statusError: string | undefined;
  if (a.status === "completed") {
    const [brand] = await tx.select().from(s.brands).where(eq(s.brands.id, a.brandId));
    const tracked = await trackedProducts(tx, storeId, a.brandId);
    const livePhotos = a.photos.filter((p) => !a.deletedPhotoIds.includes(p.id));
    const missing = attendanceMissing({
      brand,
      beforePhotos: livePhotos.filter((p) => p.kind === "before").length,
      afterPhotos: livePhotos.filter((p) => p.kind === "after").length,
      trackedProductIds: tracked,
      stock: Object.fromEntries(a.stock.map((x) => [x.productId, x.state])),
      damages: a.damages.map((d) => ({ productId: d.productId, photos: livePhotos.filter((p) => p.damageId === d.id).length })),
      exceptionItems: a.exceptionItems,
      exceptionReason: a.exceptionReason,
      exceptionNote: a.exceptionNote,
      allowExceptions: scope.settings.allowExceptions,
    });
    if (missing.length) {
      statusError = `Atendimento não finalizado: ${missing.map((m) => m.message).join(" ")}`;
      targetStatus = existing?.status === "correction_requested" ? "correction_requested" : "in_progress";
    }
  } else if (a.status === "cancelled" && (a.cancelReason ?? "").length < 5) {
    statusError = "Informe o motivo do cancelamento do atendimento.";
    targetStatus = existing?.status ?? "in_progress";
  }

  const now = new Date();
  // O início registrado não muda depois de gravado; o fim nunca é anterior ao início.
  const startedAt = existing?.startedAt ?? new Date(a.startedAt);
  const finishedRaw = new Date(a.finishedAt ?? now.toISOString());
  const values = {
    status: targetStatus,
    startedAt,
    finishedAt: targetStatus === "completed" || targetStatus === "cancelled" ? (finishedRaw < startedAt ? startedAt : finishedRaw) : null,
    activitiesDone: a.activitiesDone,
    notes: a.notes,
    exceptionItems: scope.settings.allowExceptions ? a.exceptionItems : [],
    exceptionReason: a.exceptionItems.length ? a.exceptionReason : null,
    exceptionNote: a.exceptionItems.length ? a.exceptionNote : null,
    cancelReason: targetStatus === "cancelled" ? a.cancelReason : null,
    updatedAt: now,
    updatedBy: promoterId,
  };
  // A exceção incompleta não pode violar a restrição do banco: guarda sem ela enquanto não finaliza.
  if (values.exceptionItems.length && !(values.exceptionReason && (values.exceptionNote ?? "").length >= 5)) {
    values.exceptionItems = [];
    values.exceptionReason = null;
    values.exceptionNote = null;
  }

  if (!existing) {
    await tx.insert(s.attendances).values({ id: a.id, agencyId: scope.agencyId, visitId, brandId: a.brandId, ...values, createdBy: promoterId });
    await audit(actor, "attendance", a.id, "started", { after: { brandId: a.brandId, visitId } }, tx);
  } else {
    await tx.update(s.attendances).set(values).where(eq(s.attendances.id, a.id));
  }

  // Fotos declaradas (o arquivo chega depois, pelo /api/photos).
  for (const p of a.photos) {
    await tx
      .insert(s.photos)
      .values({
        id: p.id,
        agencyId: scope.agencyId,
        attendanceId: a.id,
        kind: p.kind,
        ruptureId: p.ruptureId,
        occurrenceId: p.occurrenceId,
        validityId: p.validityId,
        damageId: p.damageId,
        source: p.source,
        takenAt: new Date(p.takenAt),
        createdBy: promoterId,
      })
      .onConflictDoNothing();
  }
  if (a.deletedPhotoIds.length) {
    const removed = await tx
      .update(s.photos)
      .set({ deletedAt: now, deletedBy: promoterId })
      .where(and(eq(s.photos.attendanceId, a.id), inArray(s.photos.id, a.deletedPhotoIds), isNull(s.photos.deletedAt)))
      .returning({ id: s.photos.id, kind: s.photos.kind, uploadedAt: s.photos.uploadedAt });
    for (const r of removed) {
      await audit(actor, "photo", r.id, "removed", { before: { kind: r.kind, uploaded: Boolean(r.uploadedAt), attendanceId: a.id } }, tx);
    }
  }

  // Estoque: upsert por (atendimento, produto). Limpar = volta a "pendente".
  for (const st of a.stock) {
    const quantity = storedQuantity(st.state, st.quantity);
    const unit = await productUnit(tx, st.productId);
    await tx
      .insert(s.stockEntries)
      .values({
        agencyId: scope.agencyId,
        attendanceId: a.id,
        productId: st.productId,
        state: st.state,
        quantity,
        unit,
        note: st.note,
        recordedAt: new Date(st.recordedAt),
        createdBy: promoterId,
        updatedBy: promoterId,
      })
      .onConflictDoUpdate({
        target: [s.stockEntries.attendanceId, s.stockEntries.productId],
        set: { state: st.state, quantity, note: st.note, recordedAt: new Date(st.recordedAt), updatedAt: now, updatedBy: promoterId },
      });
  }
  if (a.clearedStockProductIds.length) {
    const keep = new Set(a.stock.map((x) => x.productId));
    const clear = a.clearedStockProductIds.filter((id) => !keep.has(id));
    if (clear.length) await tx.delete(s.stockEntries).where(and(eq(s.stockEntries.attendanceId, a.id), inArray(s.stockEntries.productId, clear)));
  }

  for (const u of a.unregistered) {
    await tx
      .insert(s.unregisteredProducts)
      .values({ id: u.id, agencyId: scope.agencyId, attendanceId: a.id, description: u.description, quantity: u.quantity, note: u.note, createdBy: promoterId })
      .onConflictDoUpdate({ target: s.unregisteredProducts.id, set: { description: u.description, quantity: u.quantity, note: u.note, updatedAt: now } });
  }
  if (a.deletedUnregisteredIds.length) {
    await tx
      .update(s.unregisteredProducts)
      .set({ deletedAt: now })
      .where(and(eq(s.unregisteredProducts.attendanceId, a.id), inArray(s.unregisteredProducts.id, a.deletedUnregisteredIds)));
  }

  // Rupturas (modo SUINCO): um toque marca "Ruptura total", outro desmarca.
  if (a.deletedRuptureIds.length) {
    const removed = await tx
      .update(s.ruptures)
      .set({ deletedAt: now, updatedBy: promoterId })
      .where(and(eq(s.ruptures.attendanceId, a.id), inArray(s.ruptures.id, a.deletedRuptureIds), isNull(s.ruptures.deletedAt)))
      .returning({ id: s.ruptures.id });
    for (const r of removed) await audit(actor, "rupture", r.id, "removed_by_promoter", {}, tx);
  }
  for (const r of a.ruptures) {
    const [prev] = await tx.select({ id: s.ruptures.id, deletedAt: s.ruptures.deletedAt }).from(s.ruptures).where(eq(s.ruptures.id, r.id));
    if (prev) {
      if (prev.deletedAt) continue;
      await tx
        .update(s.ruptures)
        .set({ situation: r.situation, knownStock: r.knownStock, note: r.note, updatedAt: now, updatedBy: promoterId })
        .where(eq(s.ruptures.id, r.id));
    } else {
      const [clash] = await tx
        .select({ id: s.ruptures.id })
        .from(s.ruptures)
        .where(and(eq(s.ruptures.attendanceId, a.id), eq(s.ruptures.productId, r.productId), isNull(s.ruptures.deletedAt)));
      if (clash) continue; // Já existe ruptura deste produto neste atendimento (evita duplicidade).
      await tx.insert(s.ruptures).values({
        id: r.id,
        agencyId: scope.agencyId,
        attendanceId: a.id,
        productId: r.productId,
        situation: r.situation,
        knownStock: r.knownStock,
        note: r.note,
        fromStockSuggestion: r.fromStockSuggestion,
        recordedAt: new Date(r.recordedAt),
        createdBy: promoterId,
        updatedBy: promoterId,
      });
    }
  }

  // Validades: dias para vencer e severidade calculados aqui, sobre a data da
  // visita e as faixas da agência (o histórico guarda a classificação do dia).
  if (a.deletedValidityIds.length) {
    await tx
      .update(s.validities)
      .set({ deletedAt: now, updatedBy: promoterId })
      .where(and(eq(s.validities.attendanceId, a.id), inArray(s.validities.id, a.deletedValidityIds), isNull(s.validities.deletedAt)));
  }
  for (const v of a.validities) {
    const daysToExpiry = daysBetween(visitDate, v.expiryDate);
    const values = {
      productId: v.productId,
      location: v.location,
      quantity: v.quantity,
      unit: v.unit,
      expiryDate: v.expiryDate,
      daysToExpiry,
      severity: classify(daysToExpiry, scope.settings.validityBands),
      lot: v.lot,
      price: v.price === null ? null : v.price.toFixed(2),
      note: v.note,
    };
    await tx
      .insert(s.validities)
      .values({ id: v.id, agencyId: scope.agencyId, attendanceId: a.id, ...values, recordedAt: new Date(v.recordedAt), createdBy: promoterId, updatedBy: promoterId })
      .onConflictDoUpdate({ target: s.validities.id, set: { ...values, updatedAt: now, updatedBy: promoterId }, where: isNull(s.validities.deletedAt) });
  }

  // Avarias.
  if (a.deletedDamageIds.length) {
    await tx
      .update(s.damages)
      .set({ deletedAt: now, updatedBy: promoterId })
      .where(and(eq(s.damages.attendanceId, a.id), inArray(s.damages.id, a.deletedDamageIds), isNull(s.damages.deletedAt)));
  }
  for (const d of a.damages) {
    const values = { productId: d.productId, kind: d.kind, quantity: d.quantity, unit: d.unit, expiryDate: d.expiryDate, lot: d.lot, note: d.note };
    await tx
      .insert(s.damages)
      .values({ id: d.id, agencyId: scope.agencyId, attendanceId: a.id, ...values, recordedAt: new Date(d.recordedAt), createdBy: promoterId, updatedBy: promoterId })
      .onConflictDoUpdate({ target: s.damages.id, set: { ...values, updatedAt: now, updatedBy: promoterId }, where: isNull(s.damages.deletedAt) });
  }

  for (const o of a.occurrences) {
    await tx
      .insert(s.occurrences)
      .values({ id: o.id, agencyId: scope.agencyId, attendanceId: a.id, category: o.category, note: o.note, recordedAt: new Date(o.recordedAt), createdBy: promoterId })
      .onConflictDoUpdate({ target: s.occurrences.id, set: { category: o.category, note: o.note, updatedAt: now }, where: isNull(s.occurrences.deletedAt) });
  }
  if (a.deletedOccurrenceIds.length) {
    await tx
      .update(s.occurrences)
      .set({ deletedAt: now })
      .where(and(eq(s.occurrences.attendanceId, a.id), inArray(s.occurrences.id, a.deletedOccurrenceIds), eq(s.occurrences.status, "open")));
  }

  // Mudanças de status relevantes: responsável e horário na auditoria.
  const prevStatus = existing?.status ?? null;
  if (targetStatus !== prevStatus && existing) {
    await audit(actor, "attendance", a.id, targetStatus === "completed" ? "completed" : targetStatus === "cancelled" ? "cancelled" : "status_changed", {
      before: { status: prevStatus },
      after: { status: targetStatus, exceptionItems: values.exceptionItems },
      reason: targetStatus === "cancelled" ? a.cancelReason : values.exceptionNote,
    }, tx);
  } else if (!existing && targetStatus !== "in_progress") {
    await audit(actor, "attendance", a.id, targetStatus, { after: { status: targetStatus, exceptionItems: values.exceptionItems }, reason: values.exceptionNote ?? a.cancelReason }, tx);
  }
  if (prevStatus === "correction_requested" && targetStatus === "completed") {
    await tx
      .update(s.correctionRequests)
      .set({ status: "answered", answeredAt: now, answeredBy: promoterId })
      .where(and(eq(s.correctionRequests.attendanceId, a.id), eq(s.correctionRequests.status, "open")));
    await audit(actor, "attendance", a.id, "correction_answered", {}, tx);
  }

  return statusError ? fail("invalid", statusError) : { attendanceId: a.id, ok: true, completedNow: targetStatus === "completed" && prevStatus !== "completed" };
}

const unitCache = new Map<string, string>();
async function productUnit(tx: Tx, productId: string) {
  const hit = unitCache.get(productId);
  if (hit) return hit as typeof s.products.$inferSelect.unit;
  const [p] = await tx.select({ unit: s.products.unit }).from(s.products).where(eq(s.products.id, productId));
  unitCache.set(productId, p.unit);
  return p.unit;
}

// ───────────────────────────── Histórico ─────────────────────────────

export async function promoterHistory(scope: Scope, days = 45): Promise<PromoterHistoryItem[]> {
  const db = await getDb();
  const since = addDays(todayIso(), -days);
  const rows = await db
    .select({
      visitId: s.visits.id,
      visitDate: s.visits.visitDate,
      storeName: s.stores.name,
      chainName: s.chains.name,
      city: s.stores.city,
      status: s.visits.status,
      startedAt: s.visits.startedAt,
      finishedAt: s.visits.finishedAt,
    })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(and(eq(s.visits.promoterId, scope.userId), gte(s.visits.visitDate, since), ne(s.visits.status, "cancelled")))
    .orderBy(desc(s.visits.startedAt))
    .limit(200);
  if (!rows.length) return [];
  const atts = await db
    .select({
      id: s.attendances.id,
      visitId: s.attendances.visitId,
      brandName: s.brands.name,
      status: s.attendances.status,
      ruptures: sql<number>`(select count(*)::int from ${s.ruptures} r where r.attendance_id = ${s.attendances.id} and r.deleted_at is null)`,
    })
    .from(s.attendances)
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .where(inArray(s.attendances.visitId, rows.map((r) => r.visitId)));
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    brands: atts
      .filter((a) => a.visitId === r.visitId)
      .map((a) => ({ attendanceId: a.id, brandName: a.brandName, status: a.status, ruptures: a.ruptures, correction: a.status === "correction_requested" })),
  }));
}
