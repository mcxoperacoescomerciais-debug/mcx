/**
 * Modo ações: junta a AGENDA (degustações/ações cadastradas no painel, com o financeiro)
 * e a EXECUÇÃO (atendimentos feitos pela promotora no app: check-in, fotos, resultado,
 * ocorrências). A ligação é marca + PDV + data. Usado pelo painel de ações, pelo
 * financeiro por ação e pelo relatório para a marca.
 */
import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { filterIn } from "./filter-sql";
import { actualOf, plannedMoney } from "./tastings";
import { conversion, photosComplete, readOutcome, type ActionOutcome } from "@/lib/actions";
import { tastingResult, voidStatus, type TastingMoney, type TastingResult, type TastingStatus } from "@/lib/tasting";
import { fmtTime, todayIso } from "@/lib/dates";
import { fHas } from "@/lib/filters";

export interface ActionFilters {
  from: string;
  to: string;
  brand?: string | null;
  chain?: string | null;
  city?: string | null;
  promoter?: string | null;
  store?: string | null;
  /** Campanha = código/pedido da ação na agenda (orderRef). */
  campaign?: string | null;
}

export type ActionState = "realized" | "in_progress" | "scheduled" | "cancelled" | "not_done";
export const ACTION_STATE_LABEL: Record<ActionState, string> = {
  realized: "Realizada",
  in_progress: "Em andamento",
  scheduled: "Agendada",
  cancelled: "Cancelada",
  not_done: "Não realizada",
};

export interface ActionPhoto {
  id: string;
  kind: string;
  takenAt: Date;
  uploaded: boolean;
  storageKey: string | null;
  contentType: string | null;
}

export interface ActionRecord {
  key: string;
  date: string;
  brandId: string;
  brandName: string;
  storeId: string | null;
  storeName: string;
  chainName: string | null;
  city: string;
  promoterId: string | null;
  promoterName: string | null;
  state: ActionState;
  agendaStatus: TastingStatus | null;
  tastingId: string | null;
  attendanceId: string | null;
  campaign: string | null;
  product: string | null;
  description: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
  /** Check-in até 10 minutos depois do horário agendado; null sem horário ou sem check-in. */
  onTime: boolean | null;
  /** Minutos entre check-in e check-out. */
  minutes: number | null;
  outcome: ActionOutcome | null;
  notes: string | null;
  reason: string | null;
  photos: ActionPhoto[];
  occurrences: { category: string; note: string | null }[];
  /** Realizado (ação feita) ou previsto (agendada); cancelada/não realizada: só a multa. */
  money: TastingResult | null;
  /** Valores da ação (realizado se feita; previsto se agendada). */
  parts: TastingMoney | null;
  revenueCounted: number;
}

const toMinutes = (hhmm: string | null) => (hhmm && /^\d{2}:\d{2}$/.test(hhmm) ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null);
const norm = (v: string | null | undefined) => (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export async function loadActions(scope: Scope, f: ActionFilters, opts: { withPhotos?: boolean } = {}): Promise<ActionRecord[]> {
  const db = await getDb();
  const [agenda, done, promoters] = await Promise.all([
    db
      .select({ t: s.tastings, brandName: s.brands.name, tasterName: s.tasters.name, storeChainId: s.stores.chainId, chainName: s.chains.name })
      .from(s.tastings)
      .innerJoin(s.brands, eq(s.brands.id, s.tastings.brandId))
      .leftJoin(s.tasters, eq(s.tasters.id, s.tastings.tasterId))
      .leftJoin(s.stores, eq(s.stores.id, s.tastings.storeId))
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .where(
        and(
          eq(s.tastings.agencyId, scope.agencyId),
          gte(s.tastings.date, f.from),
          lte(s.tastings.date, f.to),
          brandFilter(scope, s.tastings.brandId),
          filterIn(s.tastings.brandId, f.brand),
          f.campaign ? eq(s.tastings.orderRef, f.campaign) : undefined,
        ),
      )
      .orderBy(asc(s.tastings.date), asc(s.tastings.startTime)),
    db
      .select({
        a: s.attendances,
        visitDate: s.visits.visitDate,
        startedAt: s.visits.startedAt,
        finishedAt: s.visits.finishedAt,
        storeId: s.visits.storeId,
        storeName: s.stores.name,
        city: s.stores.city,
        chainId: s.stores.chainId,
        chainName: s.chains.name,
        brandName: s.brands.name,
        promoterId: s.visits.promoterId,
        promoterName: s.users.name,
        plannedStart: s.schedules.plannedStart,
        plannedEnd: s.schedules.plannedEnd,
      })
      .from(s.attendances)
      .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
      .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
      .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
      .leftJoin(s.schedules, eq(s.schedules.id, s.visits.scheduleId))
      .where(
        and(
          eq(s.attendances.agencyId, scope.agencyId),
          gte(s.visits.visitDate, f.from),
          lte(s.visits.visitDate, f.to),
          brandFilter(scope, s.attendances.brandId),
          promoterFilter(scope, s.visits.promoterId),
          filterIn(s.attendances.brandId, f.brand),
        ),
      ),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"))),
  ]);

  const ids = done.map((d) => d.a.id);
  const [photos, occ] = ids.length
    ? await Promise.all([
        db
          .select({ id: s.photos.id, attendanceId: s.photos.attendanceId, kind: s.photos.kind, takenAt: s.photos.takenAt, uploadedAt: s.photos.uploadedAt, storageKey: s.photos.storageKey, contentType: s.photos.contentType })
          .from(s.photos)
          .where(and(inArray(s.photos.attendanceId, ids), inArray(s.photos.kind, ["before", "after", "closing"]), isNull(s.photos.deletedAt)))
          .orderBy(asc(s.photos.takenAt)),
        db
          .select({ attendanceId: s.occurrences.attendanceId, category: s.occurrences.category, note: s.occurrences.note })
          .from(s.occurrences)
          .where(and(inArray(s.occurrences.attendanceId, ids), isNull(s.occurrences.deletedAt))),
      ])
    : [[], []];

  // Promotora da agenda (degustadora) ↔ usuário do app: mesmo nome.
  const userByName = new Map(promoters.map((p) => [norm(p.name), p]));
  const out = new Map<string, ActionRecord>();
  for (const { t, brandName, tasterName, chainName } of agenda) {
    const key = `${t.brandId}|${t.storeId ?? norm(t.storeName)}|${t.date}`;
    const user = tasterName ? userByName.get(norm(tasterName)) : undefined;
    const parts = voidStatus(t.status) ? null : t.status === "completed" ? actualOf(t) : plannedMoney(t);
    const money = parts ? tastingResult(parts) : null;
    out.set(key, {
      key,
      date: t.date,
      brandId: t.brandId,
      brandName,
      storeId: t.storeId,
      storeName: t.storeName,
      chainName: chainName ?? t.chainName,
      city: t.city,
      promoterId: user?.id ?? null,
      promoterName: tasterName ?? null,
      state: t.status === "cancelled" ? "cancelled" : t.status === "not_done" ? "not_done" : t.status === "completed" ? "realized" : t.status === "in_progress" ? "in_progress" : "scheduled",
      agendaStatus: t.status,
      tastingId: t.id,
      attendanceId: null,
      campaign: t.orderRef,
      product: t.product,
      description: t.description,
      plannedStart: t.startTime,
      plannedEnd: t.endTime,
      checkIn: null,
      checkOut: null,
      onTime: null,
      minutes: null,
      outcome: null,
      notes: null,
      reason: t.cancelReason,
      photos: [],
      occurrences: [],
      money,
      parts,
      revenueCounted: voidStatus(t.status) ? (t.cancellationFee ?? 0) : (money?.revenue ?? 0),
    });
  }
  for (const d of done) {
    const key = `${d.a.brandId}|${d.storeId}|${d.visitDate}`;
    const prev = out.get(key);
    // Ação só no app (sem agenda) entra quando não há filtro de campanha.
    if (!prev && f.campaign) continue;
    const planned = prev?.plannedStart ?? d.plannedStart;
    const startMin = toMinutes(planned);
    const inMin = toMinutes(fmtTime(d.startedAt));
    const myPhotos = photos.filter((p) => p.attendanceId === d.a.id);
    const rec: ActionRecord = {
      ...(prev ?? {
        key,
        date: d.visitDate,
        brandId: d.a.brandId,
        brandName: d.brandName,
        storeId: d.storeId,
        storeName: d.storeName,
        chainName: d.chainName,
        city: d.city,
        agendaStatus: null,
        tastingId: null,
        campaign: null,
        product: null,
        description: null,
        plannedEnd: d.plannedEnd,
        money: null,
        parts: null,
        revenueCounted: 0,
      }),
      storeName: d.storeName,
      city: d.city,
      chainName: d.chainName ?? prev?.chainName ?? null,
      promoterId: d.promoterId,
      promoterName: d.promoterName,
      state: d.a.status === "completed" ? "realized" : d.a.status === "cancelled" ? "not_done" : "in_progress",
      attendanceId: d.a.id,
      plannedStart: planned,
      checkIn: d.startedAt,
      checkOut: d.finishedAt,
      onTime: startMin !== null && inMin !== null ? inMin <= startMin + 10 : null,
      minutes: d.finishedAt ? Math.round((d.finishedAt.getTime() - d.startedAt.getTime()) / 60_000) : null,
      outcome: readOutcome(d.a.actionResult),
      notes: d.a.notes,
      reason: d.a.cancelReason ?? prev?.reason ?? null,
      photos: opts.withPhotos
        ? myPhotos.map((p) => ({ id: p.id, kind: p.kind, takenAt: p.takenAt, uploaded: Boolean(p.uploadedAt), storageKey: p.storageKey, contentType: p.contentType }))
        : myPhotos.map((p) => ({ id: p.id, kind: p.kind, takenAt: p.takenAt, uploaded: Boolean(p.uploadedAt), storageKey: null, contentType: null })),
      occurrences: occ.filter((o) => o.attendanceId === d.a.id).map((o) => ({ category: o.category, note: o.note })),
    };
    out.set(key, rec);
  }
  // Filtros de rede, cidade, PDV e promotora (valem para a agenda e para o app).
  const chainIds = new Map([...agenda.map((x) => [x.t.storeId ?? "", x.storeChainId] as const), ...done.map((x) => [x.storeId, x.chainId] as const)]);
  return [...out.values()]
    .filter((r) => !f.city || fHas(f.city, r.city))
    .filter((r) => !f.store || fHas(f.store, r.storeId))
    .filter((r) => !f.chain || fHas(f.chain, chainIds.get(r.storeId ?? "") ?? null))
    .filter((r) => !f.promoter || fHas(f.promoter, r.promoterId))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.plannedStart ?? "").localeCompare(b.plannedStart ?? "") || a.storeName.localeCompare(b.storeName));
}

export interface Group {
  name: string;
  actions: number;
  approached: number;
  samples: number;
  sold: number;
  conversion: number | null;
  acceptance: number | null;
  revenue: number;
  cost: number;
  contribution: number;
  margin: number | null;
}

function group(list: ActionRecord[], by: (r: ActionRecord) => string): Group[] {
  const m = new Map<string, ActionRecord[]>();
  for (const r of list) {
    const k = by(r) || "—";
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.entries()]
    .map(([name, rs]) => {
      const res = rs.filter((r) => r.state === "realized");
      const withOut = res.filter((r) => r.outcome);
      const approached = sum(withOut, (r) => r.outcome!.approached ?? 0);
      const sold = sum(withOut, (r) => r.outcome!.unitsSold ?? 0);
      const accs = withOut.map((r) => r.outcome!.acceptance).filter((x): x is number => x !== null);
      const revenue = sum(rs, (r) => r.revenueCounted);
      const cost = sum(res, (r) => r.money?.directCost ?? 0);
      return {
        name,
        actions: res.length,
        approached,
        samples: sum(withOut, (r) => r.outcome!.samples ?? 0),
        sold,
        conversion: conversion(sold, approached),
        acceptance: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null,
        revenue,
        cost,
        contribution: revenue - cost,
        margin: revenue > 0 ? (revenue - cost) / revenue : null,
      };
    })
    .sort((a, b) => b.actions - a.actions || a.name.localeCompare(b.name, "pt-BR"));
}

const sum = <T>(list: T[], fn: (x: T) => number) => list.reduce((t, x) => t + fn(x), 0);

export function summarize(list: ActionRecord[], today = todayIso()) {
  const due = list.filter((r) => r.date <= today);
  const realized = list.filter((r) => r.state === "realized");
  const cancelled = due.filter((r) => r.state === "cancelled").length;
  const notDone = due.filter((r) => r.state === "not_done").length;
  const timed = realized.filter((r) => r.onTime !== null);
  const withOut = realized.filter((r) => r.outcome);
  const approached = sum(withOut, (r) => r.outcome!.approached ?? 0);
  const samples = sum(withOut, (r) => r.outcome!.samples ?? 0);
  const sold = sum(withOut, (r) => r.outcome!.unitsSold ?? 0);
  const accs = withOut.map((r) => r.outcome!.acceptance).filter((x): x is number => x !== null);
  const appRecorded = realized.filter((r) => r.attendanceId);
  const photosOk = appRecorded.filter((r) => photosComplete(r.photos.map((p) => p.kind))).length;
  const revenue = sum(list, (r) => (r.state === "realized" || r.state === "cancelled" || r.state === "not_done" ? r.revenueCounted : 0));
  const cost = sum(realized, (r) => r.money?.directCost ?? 0);

  // Horas e ranking por promotora.
  const byPromoter = new Map<string, ActionRecord[]>();
  for (const r of list) if (r.promoterName) byPromoter.set(r.promoterName, [...(byPromoter.get(r.promoterName) ?? []), r]);
  const ranking = [...byPromoter.entries()]
    .map(([name, rs]) => {
      const res = rs.filter((r) => r.state === "realized");
      const dueP = rs.filter((r) => r.date <= today);
      const t = res.filter((r) => r.onTime !== null);
      const o = res.filter((r) => r.outcome);
      const ap = sum(o, (r) => r.outcome!.approached ?? 0);
      const so = sum(o, (r) => r.outcome!.unitsSold ?? 0);
      const ac = o.map((r) => r.outcome!.acceptance).filter((x): x is number => x !== null);
      const app = res.filter((r) => r.attendanceId);
      const onTime = t.length ? t.filter((r) => r.onTime).length / t.length : null;
      const conv = conversion(so, ap);
      const photoPct = app.length ? app.filter((r) => photosComplete(r.photos.map((p) => p.kind))).length / app.length : null;
      const doneRate = dueP.length ? res.length / dueP.length : null;
      // Nota de 0 a 100: execução (35), pontualidade (25), conversão (25, 20% = cheio) e fotos completas (15).
      const score = Math.round(35 * (doneRate ?? 0) + 25 * (onTime ?? 0) + 25 * Math.min(1, (conv ?? 0) / 0.2) + 15 * (photoPct ?? 0));
      return {
        name,
        actions: res.length,
        scheduled: dueP.length,
        hours: sum(res, (r) => r.minutes ?? 0) / 60,
        onTime,
        approached: ap,
        sold: so,
        conversion: conv,
        acceptance: ac.length ? ac.reduce((a, b) => a + b, 0) / ac.length : null,
        photoPct,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.actions - a.actions);

  const occByCat = new Map<string, number>();
  for (const r of realized.concat(due.filter((x) => x.state === "not_done"))) for (const o of r.occurrences) occByCat.set(o.category, (occByCat.get(o.category) ?? 0) + 1);

  const daily = new Map<string, { realized: number; lost: number }>();
  for (const r of due) {
    const d = daily.get(r.date) ?? { realized: 0, lost: 0 };
    if (r.state === "realized") d.realized++;
    else if (r.state === "cancelled" || r.state === "not_done") d.lost++;
    daily.set(r.date, d);
  }

  return {
    operation: {
      total: list.length,
      due: due.length,
      realized: realized.length,
      upcoming: list.filter((r) => r.date > today && r.state === "scheduled").length,
      cancelled,
      notDone,
      cancelRate: due.length ? (cancelled + notDone) / due.length : null,
      onTime: timed.length ? timed.filter((r) => r.onTime).length / timed.length : null,
      hours: sum(realized, (r) => r.minutes ?? 0) / 60,
    },
    result: { approached, samples, sold, conversion: conversion(sold, approached), acceptance: accs.length ? accs.reduce((a, b) => a + b, 0) / accs.length : null, withResult: withOut.length },
    quality: {
      occurrences: [...occByCat.entries()].map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n),
      photosComplete: appRecorded.length ? photosOk / appRecorded.length : null,
      appRecorded: appRecorded.length,
    },
    finance: {
      revenue,
      cost,
      contribution: revenue - cost,
      margin: revenue > 0 ? (revenue - cost) / revenue : null,
      perApproach: approached ? cost / approached : null,
      perSample: samples ? cost / samples : null,
      perAction: realized.length ? cost / realized.length : null,
    },
    ranking,
    byBrand: group(list, (r) => r.brandName),
    byChain: group(list, (r) => r.chainName ?? "Sem rede"),
    byCity: group(list, (r) => r.city),
    byStore: group(list, (r) => `${r.storeName} · ${r.city}`),
    byMonth: group(list, (r) => r.date.slice(0, 7)),
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  };
}

export type ActionSummary = ReturnType<typeof summarize>;

/** Campanhas (código da ação na agenda) para o filtro do relatório. */
export async function actionCampaigns(scope: Scope, brandId?: string | null) {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ ref: s.tastings.orderRef, brandId: s.tastings.brandId, description: s.tastings.description })
    .from(s.tastings)
    .where(and(eq(s.tastings.agencyId, scope.agencyId), brandFilter(scope, s.tastings.brandId), brandId ? eq(s.tastings.brandId, brandId) : undefined));
  const m = new Map<string, { ref: string; brandId: string; description: string | null }>();
  for (const r of rows) if (r.ref && !m.has(r.ref)) m.set(r.ref, { ref: r.ref, brandId: r.brandId, description: r.description });
  return [...m.values()].sort((a, b) => a.ref.localeCompare(b.ref));
}
