/**
 * Visão operacional do DIA: programações, visitas, atendimentos e indicadores.
 *
 * Tudo é calculado a partir das mesmas linhas (um conjunto pequeno de
 * consultas por data, não uma consulta por cartão), então os indicadores e as
 * listas detalhadas SEMPRE batem. Regras de contagem: ver STOP_BUCKET_HELP
 * (domain.ts) e docs/ARQUITETURA.md.
 */
import "server-only";
import { and, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { minutesOfDay, todayIso } from "@/lib/dates";
import { stopBucket } from "@/lib/rules";
import type { AttendanceStatus, StopBucket, VisitStatus } from "@/lib/domain";
import type { PanelFilters } from "@/lib/filters";

export interface BoardAttendance {
  id: string;
  brandId: string;
  brandName: string;
  status: AttendanceStatus;
  startedAt: Date;
  finishedAt: Date | null;
  exceptionItems: string[];
  before: number;
  after: number;
  pendingUploads: number;
  ruptures: number;
  minBefore: number;
  minAfter: number;
  reviewStatus: string;
}

export interface BoardStop {
  key: string;
  scheduleId: string | null;
  date: string;
  plannedStart: string | null;
  seq: number;
  promoterId: string;
  promoterName: string;
  storeId: string;
  storeName: string;
  chainName: string | null;
  city: string;
  plannedBrands: { id: string; name: string }[];
  visit: { id: string; status: VisitStatus; startedAt: Date; finishedAt: Date | null; origin: string; closeReason: string | null; syncedAt: Date } | null;
  attendances: BoardAttendance[];
  bucket: StopBucket;
  brandsDone: number;
  brandsTotal: number;
  hasException: boolean;
  issues: number;
}

export interface DayBoard {
  date: string;
  generatedAt: Date;
  stops: BoardStop[];
  kpis: {
    promotersScheduled: number;
    promotersActive: number;
    storesScheduled: number;
    storesCompleted: number;
    storesWithException: number;
    visitsInProgress: number;
    storesPendingOrLate: number;
    storesLate: number;
    storesMissed: number;
    extraVisits: number;
    attendancesPlanned: number;
    attendancesCompleted: number;
    attendancesWithIssues: number;
    photosIncomplete: number;
    ruptureProducts: number;
    ruptureCount: number;
  };
  buckets: Record<StopBucket, number>;
  lastSyncAt: Date | null;
}

export async function getDayBoard(scope: Scope, f: Pick<PanelFilters, "date" | "brand" | "chain" | "store" | "promoter" | "city">): Promise<DayBoard> {
  const db = await getDb();
  const date = f.date;

  // ── Programações do dia (com escopo e filtros) ──
  const schedConds: (SQL | undefined)[] = [
    eq(s.schedules.agencyId, scope.agencyId),
    eq(s.schedules.date, date),
    eq(s.schedules.status, "active"),
    promoterFilter(scope, s.schedules.promoterId),
    f.promoter ? eq(s.schedules.promoterId, f.promoter) : undefined,
    f.store ? eq(s.schedules.storeId, f.store) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
  ];
  const schedRows = await db
    .select({
      id: s.schedules.id,
      date: s.schedules.date,
      plannedStart: s.schedules.plannedStart,
      seq: s.schedules.seq,
      promoterId: s.schedules.promoterId,
      promoterName: s.users.name,
      storeId: s.schedules.storeId,
      storeName: s.stores.name,
      chainName: s.chains.name,
      city: s.stores.city,
    })
    .from(s.schedules)
    .innerJoin(s.users, eq(s.users.id, s.schedules.promoterId))
    .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(and(...schedConds));

  const schedIds = schedRows.map((r) => r.id);
  const sbRows = schedIds.length
    ? await db
        .select({ scheduleId: s.scheduleBrands.scheduleId, brandId: s.brands.id, name: s.brands.name })
        .from(s.scheduleBrands)
        .innerJoin(s.brands, eq(s.brands.id, s.scheduleBrands.brandId))
        .where(and(inArray(s.scheduleBrands.scheduleId, schedIds), brandFilter(scope, s.brands.id)))
    : [];

  // ── Visitas do dia (programadas + extraordinárias) ──
  const visitConds: (SQL | undefined)[] = [
    eq(s.visits.agencyId, scope.agencyId),
    eq(s.visits.visitDate, date),
    ne(s.visits.status, "cancelled"),
    promoterFilter(scope, s.visits.promoterId),
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
  ];
  const visitRows = await db
    .select({
      id: s.visits.id,
      scheduleId: s.visits.scheduleId,
      status: s.visits.status,
      startedAt: s.visits.startedAt,
      finishedAt: s.visits.finishedAt,
      origin: s.visits.origin,
      closeReason: s.visits.closeReason,
      syncedAt: s.visits.syncedAt,
      promoterId: s.visits.promoterId,
      promoterName: s.users.name,
      storeId: s.visits.storeId,
      storeName: s.stores.name,
      chainName: s.chains.name,
      city: s.stores.city,
    })
    .from(s.visits)
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(and(...visitConds));

  const visitIds = visitRows.map((v) => v.id);
  const attRows = visitIds.length
    ? await db
        .select({
          id: s.attendances.id,
          visitId: s.attendances.visitId,
          brandId: s.attendances.brandId,
          brandName: s.brands.name,
          status: s.attendances.status,
          startedAt: s.attendances.startedAt,
          finishedAt: s.attendances.finishedAt,
          exceptionItems: s.attendances.exceptionItems,
          reviewStatus: s.attendances.reviewStatus,
          minBefore: s.brands.minBeforePhotos,
          minAfter: s.brands.minAfterPhotos,
          before: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = 'before' and p.deleted_at is null)`,
          after: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = 'after' and p.deleted_at is null)`,
          pendingUploads: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.uploaded_at is null and p.deleted_at is null)`,
          ruptures: sql<number>`(select count(*)::int from ${s.ruptures} r where r.attendance_id = ${s.attendances.id} and r.deleted_at is null)`,
        })
        .from(s.attendances)
        .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
        .where(and(inArray(s.attendances.visitId, visitIds), brandFilter(scope, s.attendances.brandId), f.brand ? eq(s.attendances.brandId, f.brand) : undefined))
    : [];

  const settings = scope.settings;
  const today = todayIso();
  const nowMin = minutesOfDay();
  const stops: BoardStop[] = [];
  const usedVisits = new Set<string>();

  const buildStop = (base: Omit<BoardStop, "bucket" | "brandsDone" | "brandsTotal" | "hasException" | "issues" | "attendances" | "visit">, visit: (typeof visitRows)[number] | undefined): BoardStop => {
    const atts = visit ? attRows.filter((a) => a.visitId === visit.id) : [];
    const brandIds = new Set([...base.plannedBrands.map((b) => b.id), ...atts.map((a) => a.brandId)]);
    const done = [...brandIds].filter((b) => atts.some((a) => a.brandId === b && (a.status === "completed" || a.status === "cancelled"))).length;
    const hasException = Boolean(
      visit &&
        (visit.status === "closed_incomplete" ||
          atts.some((a) => a.exceptionItems.length > 0 || a.status === "cancelled" || a.status === "correction_requested" || a.reviewStatus === "rejected")),
    );
    const bucket = stopBucket({
      date: base.date,
      plannedStart: base.plannedStart,
      visit: visit ? { status: visit.status, hasException } : null,
      today,
      nowMinutes: nowMin,
      settings,
    });
    const issues = atts.reduce(
      (n, a) =>
        n +
        (a.status !== "cancelled" && a.status !== "in_progress" && a.before < a.minBefore ? 1 : 0) +
        (a.status !== "cancelled" && a.status !== "in_progress" && a.after < a.minAfter ? 1 : 0) +
        (a.status === "correction_requested" ? 1 : 0) +
        (a.pendingUploads > 0 ? 1 : 0),
      0,
    );
    return {
      ...base,
      visit: visit
        ? { id: visit.id, status: visit.status, startedAt: visit.startedAt, finishedAt: visit.finishedAt, origin: visit.origin, closeReason: visit.closeReason, syncedAt: visit.syncedAt }
        : null,
      attendances: atts.map(({ visitId, ...a }) => {
        void visitId;
        return a;
      }),
      bucket,
      brandsDone: done,
      brandsTotal: brandIds.size,
      hasException,
      issues: issues + (bucket === "late" || bucket === "missed" ? 1 : 0),
    };
  };

  for (const r of schedRows) {
    const plannedBrands = sbRows.filter((b) => b.scheduleId === r.id).map((b) => ({ id: b.brandId, name: b.name }));
    if (f.brand && !plannedBrands.some((b) => b.id === f.brand)) continue;
    if (!plannedBrands.length && scope.brandIds !== null) continue; // nenhuma marca visível ao gestor restrito
    const visit = visitRows.find((v) => v.scheduleId === r.id);
    if (visit) usedVisits.add(visit.id);
    stops.push(buildStop({ key: r.id, scheduleId: r.id, date: r.date, plannedStart: r.plannedStart, seq: r.seq, promoterId: r.promoterId, promoterName: r.promoterName, storeId: r.storeId, storeName: r.storeName, chainName: r.chainName, city: r.city, plannedBrands }, visit));
  }
  // Visitas extraordinárias (sem programação).
  for (const v of visitRows) {
    if (usedVisits.has(v.id) || v.scheduleId) continue;
    const atts = attRows.filter((a) => a.visitId === v.id);
    if (!atts.length && (f.brand || scope.brandIds !== null)) continue;
    stops.push(
      buildStop(
        {
          key: v.id,
          scheduleId: null,
          date,
          plannedStart: null,
          seq: 99,
          promoterId: v.promoterId,
          promoterName: v.promoterName,
          storeId: v.storeId,
          storeName: v.storeName,
          chainName: v.chainName,
          city: v.city,
          plannedBrands: [],
        },
        v,
      ),
    );
  }

  stops.sort((a, b) => a.promoterName.localeCompare(b.promoterName, "pt-BR") || a.seq - b.seq);

  const buckets = { completed: 0, exception: 0, in_progress: 0, late: 0, pending: 0, missed: 0 } as Record<StopBucket, number>;
  for (const st of stops) buckets[st.bucket]++;
  const allAtts = stops.flatMap((st) => st.attendances);
  const scheduled = stops.filter((st) => st.scheduleId);

  // Rupturas registradas no dia (no escopo).
  const rupt = await db
    .select({ products: sql<number>`count(distinct ${s.ruptures.productId})::int`, total: sql<number>`count(*)::int` })
    .from(s.ruptures)
    .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .where(
      and(
        eq(s.ruptures.agencyId, scope.agencyId),
        isNull(s.ruptures.deletedAt),
        eq(s.visits.visitDate, date),
        brandFilter(scope, s.attendances.brandId),
        promoterFilter(scope, s.visits.promoterId),
        f.brand ? eq(s.attendances.brandId, f.brand) : undefined,
        f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
        f.store ? eq(s.visits.storeId, f.store) : undefined,
        f.chain ? eq(s.stores.chainId, f.chain) : undefined,
        f.city ? eq(s.stores.city, f.city) : undefined,
      ),
    );

  const lastSyncAt = visitRows.reduce<Date | null>((m, v) => (!m || v.syncedAt > m ? v.syncedAt : m), null);

  return {
    date,
    generatedAt: new Date(),
    stops,
    buckets,
    lastSyncAt,
    kpis: {
      promotersScheduled: new Set(scheduled.map((st) => st.promoterId)).size,
      promotersActive: new Set(stops.filter((st) => st.visit).map((st) => st.promoterId)).size,
      storesScheduled: scheduled.length,
      storesCompleted: scheduled.filter((st) => st.bucket === "completed" || st.bucket === "exception").length,
      storesWithException: scheduled.filter((st) => st.bucket === "exception").length,
      visitsInProgress: stops.filter((st) => st.bucket === "in_progress").length,
      storesPendingOrLate: scheduled.filter((st) => st.bucket === "pending" || st.bucket === "late" || st.bucket === "missed").length,
      storesLate: scheduled.filter((st) => st.bucket === "late").length,
      storesMissed: scheduled.filter((st) => st.bucket === "missed").length,
      extraVisits: stops.filter((st) => !st.scheduleId).length,
      attendancesPlanned: stops.reduce((n, st) => n + st.brandsTotal, 0),
      attendancesCompleted: allAtts.filter((a) => a.status === "completed").length,
      attendancesWithIssues: allAtts.filter((a) => a.status === "correction_requested" || a.exceptionItems.length > 0 || a.reviewStatus === "rejected" || a.pendingUploads > 0).length,
      photosIncomplete: allAtts.filter((a) => a.status !== "cancelled" && a.status !== "in_progress" && (a.before < a.minBefore || a.after < a.minAfter || a.pendingUploads > 0)).length,
      ruptureProducts: rupt[0]?.products ?? 0,
      ruptureCount: rupt[0]?.total ?? 0,
    },
  };
}

/** Opções dos filtros globais (só o que está no escopo do usuário). */
export async function filterOptions(scope: Scope) {
  const db = await getDb();
  const [brands, chains, stores, promoters] = await Promise.all([
    db
      .select({ id: s.brands.id, name: s.brands.name })
      .from(s.brands)
      .where(and(eq(s.brands.agencyId, scope.agencyId), brandFilter(scope, s.brands.id)))
      .orderBy(s.brands.name),
    db.select({ id: s.chains.id, name: s.chains.name }).from(s.chains).where(eq(s.chains.agencyId, scope.agencyId)).orderBy(s.chains.name),
    db
      .select({ id: s.stores.id, name: s.stores.name, city: s.stores.city })
      .from(s.stores)
      .where(eq(s.stores.agencyId, scope.agencyId))
      .orderBy(s.stores.name),
    db
      .select({ id: s.users.id, name: s.users.name })
      .from(s.users)
      .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), promoterFilter(scope, s.users.id)))
      .orderBy(s.users.name),
  ]);
  const cities = [...new Set(stores.map((x) => x.city))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { brands, chains, stores, promoters, cities };
}

// ───────────────────────────── Resumo por promotor ─────────────────────────────

export type PromoterOpStatus = "in_store" | "done" | "late" | "not_started" | "between" | "missed" | "no_schedule";
export const PROMOTER_STATUS_LABEL: Record<PromoterOpStatus, string> = {
  in_store: "Em loja agora",
  done: "Roteiro concluído",
  late: "Com atraso",
  not_started: "Ainda não iniciou",
  between: "Entre visitas",
  missed: "Loja não realizada",
  no_schedule: "Sem programação",
};
export const PROMOTER_STATUS_TONE = {
  in_store: "info",
  done: "success",
  late: "danger",
  not_started: "neutral",
  between: "neutral",
  missed: "danger",
  no_schedule: "muted",
} as const;

export interface PromoterSummary {
  promoterId: string;
  name: string;
  scheduled: number;
  started: number;
  completed: number;
  attendancesDone: number;
  attendancesTotal: number;
  issues: number;
  lastActivity: Date | null;
  status: PromoterOpStatus;
}

/**
 * Status factual a partir de horários programados e registros recebidos. Sem
 * registro recente NÃO significa "parado": só é "atraso" se o horário
 * previsto + tolerância passou sem a visita começar.
 */
export function summarizePromoters(board: DayBoard): PromoterSummary[] {
  const map = new Map<string, PromoterSummary>();
  for (const st of board.stops) {
    let p = map.get(st.promoterId);
    if (!p) {
      p = { promoterId: st.promoterId, name: st.promoterName, scheduled: 0, started: 0, completed: 0, attendancesDone: 0, attendancesTotal: 0, issues: 0, lastActivity: null, status: "not_started" };
      map.set(st.promoterId, p);
    }
    if (st.scheduleId) p.scheduled++;
    if (st.visit) p.started++;
    if (st.bucket === "completed" || st.bucket === "exception") p.completed++;
    p.attendancesDone += st.brandsDone;
    p.attendancesTotal += st.brandsTotal;
    p.issues += st.issues;
    const last = st.visit ? [st.visit.syncedAt, st.visit.finishedAt, ...st.attendances.map((a) => a.finishedAt ?? a.startedAt)].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] : null;
    if (last && (!p.lastActivity || last > p.lastActivity)) p.lastActivity = last;
  }
  for (const p of map.values()) {
    const mine = board.stops.filter((st) => st.promoterId === p.promoterId);
    if (mine.some((st) => st.bucket === "in_progress")) p.status = "in_store";
    else if (mine.some((st) => st.bucket === "late")) p.status = "late";
    else if (mine.length && mine.every((st) => st.bucket === "completed" || st.bucket === "exception")) p.status = "done";
    else if (mine.some((st) => st.bucket === "missed")) p.status = "missed";
    else if (p.started > 0) p.status = "between";
    else p.status = "not_started";
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
