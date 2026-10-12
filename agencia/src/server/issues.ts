/**
 * Central de pendências: o que exige ação do gestor, calculado dos registros
 * reais. Cada pendência tem uma chave estável ("tipo:id") — a análise do
 * gestor (issue_reviews) fica presa a ela.
 *
 * "Analisada" NÃO resolve: a pendência continua na lista (com a ação
 * registrada) até a causa desaparecer (ex.: foto chegou, correção feita) ou o
 * gestor concluir explicitamente o acompanhamento.
 */
import "server-only";
import { and, eq, gte, inArray, isNull, lte, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { getDayBoard } from "./operations";
import { EXCEPTION_ITEM_LABEL, OCCURRENCE_CATEGORY_LABEL, type ExceptionItem, type IssueKind, type IssueReviewStatus } from "@/lib/domain";
import { addDays, todayIso } from "@/lib/dates";
import type { PanelFilters } from "@/lib/filters";

export interface Issue {
  key: string;
  kind: IssueKind;
  priority: number;
  title: string;
  detail: string;
  date: string;
  at: Date | null;
  storeName: string;
  brandName: string | null;
  promoterName: string;
  href: string;
  review: { status: IssueReviewStatus; action: string; userName: string; at: Date } | null;
}

type F = Pick<PanelFilters, "from" | "to" | "brand" | "store" | "promoter" | "chain" | "city">;

function missedIssue(scheduleId: string, date: string, plannedStart: string | null, storeName: string, brands: string | null, promoterId: string, promoterName: string, priority: number): Issue {
  return {
    key: `visit_missed:${scheduleId}`,
    kind: "visit_missed",
    priority,
    title: "Visita não realizada",
    detail: `Programada para ${plannedStart ?? "o dia"} e não iniciada.`,
    date,
    at: null,
    storeName,
    brandName: brands || null,
    promoterName,
    href: `/painel/promotores/${promoterId}?date=${date}`,
    review: null,
  };
}

export async function listIssues(scope: Scope, f: F, opts: { includeConcluded?: boolean } = {}): Promise<Issue[]> {
  const db = await getDb();
  const today = todayIso();
  const pr = scope.settings.issuePriority;
  const issues: Issue[] = [];

  // Base: atendimentos do período (no escopo e filtros).
  const attConds: (SQL | undefined)[] = [
    eq(s.attendances.agencyId, scope.agencyId),
    gte(s.visits.visitDate, f.from),
    lte(s.visits.visitDate, f.to),
    ne(s.visits.status, "cancelled"),
    brandFilter(scope, s.attendances.brandId),
    promoterFilter(scope, s.visits.promoterId),
    f.brand ? eq(s.attendances.brandId, f.brand) : undefined,
    f.store ? eq(s.visits.storeId, f.store) : undefined,
    f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
    f.chain ? eq(s.stores.chainId, f.chain) : undefined,
    f.city ? eq(s.stores.city, f.city) : undefined,
  ];
  const atts = await db
    .select({
      id: s.attendances.id,
      visitId: s.visits.id,
      status: s.attendances.status,
      brandName: s.brands.name,
      brandId: s.brands.id,
      storeId: s.stores.id,
      storeName: s.stores.name,
      promoterName: s.users.name,
      date: s.visits.visitDate,
      finishedAt: s.attendances.finishedAt,
      exceptionItems: s.attendances.exceptionItems,
      exceptionNote: s.attendances.exceptionNote,
      cancelReason: s.attendances.cancelReason,
      requireStock: s.brands.requireStock,
      minBefore: s.brands.minBeforePhotos,
      minAfter: s.brands.minAfterPhotos,
      before: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = 'before' and p.deleted_at is null)`,
      after: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.kind = 'after' and p.deleted_at is null)`,
      unsynced: sql<number>`(select count(*)::int from ${s.photos} p where p.attendance_id = ${s.attendances.id} and p.uploaded_at is null and p.deleted_at is null and p.created_at < now() - interval '20 minutes')`,
      stockCount: sql<number>`(select count(*)::int from ${s.stockEntries} se where se.attendance_id = ${s.attendances.id})`,
    })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(and(...attConds));

  // Produtos acompanhados por loja/marca (para "estoque incompleto").
  const trackedCount = await trackedCounts(scope.agencyId);
  const href = (a: { id: string }) => `/painel/atendimentos/${a.id}`;

  for (const a of atts) {
    const base = { date: a.date, at: a.finishedAt, storeName: a.storeName, brandName: a.brandName, promoterName: a.promoterName, href: href(a), review: null };
    const closed = a.status === "completed" || a.status === "correction_requested";
    if (closed && a.before < a.minBefore) issues.push({ ...base, key: `missing_before:${a.id}`, kind: "missing_before", priority: pr.missing_before, title: "Atendimento sem foto do antes", detail: excuse(a, "before_photo") });
    if (closed && a.after < a.minAfter) issues.push({ ...base, key: `missing_after:${a.id}`, kind: "missing_after", priority: pr.missing_after, title: "Atendimento sem foto do depois", detail: excuse(a, "after_photo") });
    const tracked = trackedCount.get(`${a.storeId}:${a.brandId}`) ?? 0;
    if (closed && a.requireStock && a.stockCount < tracked) {
      issues.push({ ...base, key: `stock_incomplete:${a.id}`, kind: "stock_incomplete", priority: pr.stock_incomplete, title: "Registro de estoque incompleto", detail: `${a.stockCount} de ${tracked} produtos informados. ${excuse(a, "stock")}` });
    }
    if (a.status === "cancelled") issues.push({ ...base, key: `exception:cancel:${a.id}`, kind: "exception", priority: pr.exception, title: "Atendimento de marca cancelado", detail: `Justificativa: “${a.cancelReason ?? ""}”` });
    if (a.unsynced > 0) issues.push({ ...base, key: `photo_unsynced:${a.id}`, kind: "photo_unsynced", priority: pr.photo_unsynced, title: "Foto aguardando sincronização", detail: `${a.unsynced} foto(s) declaradas pelo aparelho e ainda não recebidas.` });
  }

  // Correções em aberto.
  const attIds = atts.map((a) => a.id);
  if (attIds.length) {
    const corr = await db
      .select({ id: s.correctionRequests.id, attendanceId: s.correctionRequests.attendanceId, reason: s.correctionRequests.reason, at: s.correctionRequests.requestedAt })
      .from(s.correctionRequests)
      .where(and(inArray(s.correctionRequests.attendanceId, attIds), eq(s.correctionRequests.status, "open")));
    for (const c of corr) {
      const a = atts.find((x) => x.id === c.attendanceId)!;
      issues.push({ key: `correction_pending:${c.id}`, kind: "correction_pending", priority: pr.correction_pending, title: "Atendimento aguardando correção do promotor", detail: `“${c.reason}”`, date: a.date, at: c.at, storeName: a.storeName, brandName: a.brandName, promoterName: a.promoterName, href: href(a), review: null });
    }

    // Ocorrências não tratadas.
    const occ = await db
      .select({ id: s.occurrences.id, attendanceId: s.occurrences.attendanceId, category: s.occurrences.category, note: s.occurrences.note, at: s.occurrences.recordedAt })
      .from(s.occurrences)
      .where(and(inArray(s.occurrences.attendanceId, attIds), eq(s.occurrences.status, "open"), isNull(s.occurrences.deletedAt)));
    for (const o of occ) {
      const a = atts.find((x) => x.id === o.attendanceId)!;
      issues.push({ key: `occurrence_open:${o.id}`, kind: "occurrence_open", priority: pr.occurrence_open, title: OCCURRENCE_CATEGORY_LABEL[o.category], detail: o.note ? `“${o.note}”` : "Sem observação", date: a.date, at: o.at, storeName: a.storeName, brandName: a.brandName, promoterName: a.promoterName, href: href(a), review: null });
    }
  }

  // Visitas: não finalizadas (dias anteriores) e encerradas incompletas.
  const visits = await db
    .select({ id: s.visits.id, status: s.visits.status, date: s.visits.visitDate, startedAt: s.visits.startedAt, finishedAt: s.visits.finishedAt, closeReason: s.visits.closeReason, storeName: s.stores.name, promoterName: s.users.name, origin: s.visits.origin, extraReason: s.visits.extraReason })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(
      and(
        eq(s.visits.agencyId, scope.agencyId),
        gte(s.visits.visitDate, f.from),
        lte(s.visits.visitDate, f.to),
        promoterFilter(scope, s.visits.promoterId),
        f.store ? eq(s.visits.storeId, f.store) : undefined,
        f.promoter ? eq(s.visits.promoterId, f.promoter) : undefined,
        f.chain ? eq(s.stores.chainId, f.chain) : undefined,
        f.city ? eq(s.stores.city, f.city) : undefined,
        sql`(${s.visits.status} = 'closed_incomplete' or (${s.visits.status} = 'in_progress' and ${s.visits.visitDate} < ${today}))`,
      ),
    );
  if (!f.brand) {
    for (const v of visits) {
      const base = { date: v.date, storeName: v.storeName, brandName: null, promoterName: v.promoterName, href: `/painel/visitas/${v.id}`, review: null };
      if (v.status === "in_progress") issues.push({ ...base, at: v.startedAt, key: `visit_open:${v.id}`, kind: "visit_open", priority: pr.visit_open, title: "Visita não finalizada", detail: "Iniciada e não encerrada pelo promotor." });
      else issues.push({ ...base, at: v.finishedAt, key: `exception:visit:${v.id}`, kind: "exception", priority: pr.exception, title: "Visita encerrada com marca pendente", detail: `Justificativa: “${v.closeReason ?? ""}”` });
    }
  }

  // Atrasos e não realizadas: programação do dia de hoje (e anteriores do período).
  if (f.to >= today && f.from <= today) {
    const board = await getDayBoard(scope, { date: today, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, city: f.city });
    for (const st of board.stops.filter((x) => x.bucket === "late")) {
      issues.push({ key: `visit_late:${st.scheduleId}`, kind: "visit_late", priority: pr.visit_late, title: "Visita atrasada", detail: `Previsto ${st.plannedStart ?? "—"}, ainda não iniciada (tolerância ${scope.settings.lateToleranceMin} min).`, date: st.date, at: null, storeName: st.storeName, brandName: st.plannedBrands.map((b) => b.name).join(", "), promoterName: st.promoterName, href: `/painel/promotores/${st.promoterId}?date=${st.date}`, review: null });
    }
    // Hoje, depois do fim do dia operacional, as não iniciadas viram "não realizadas".
    for (const st of board.stops.filter((x) => x.bucket === "missed" && x.scheduleId)) {
      issues.push(missedIssue(st.scheduleId!, st.date, st.plannedStart, st.storeName, st.plannedBrands.map((b) => b.name).join(", "), st.promoterId, st.promoterName, pr.visit_missed));
    }
  }
  // Dias anteriores do período: programação ativa sem visita válida.
  if (f.from < today) {
    const until = f.to < today ? f.to : addDays(today, -1);
    const missed = await db
      .select({
        id: s.schedules.id,
        date: s.schedules.date,
        plannedStart: s.schedules.plannedStart,
        storeName: s.stores.name,
        promoterId: s.users.id,
        promoterName: s.users.name,
        brands: sql<string>`(select string_agg(b.name, ', ' order by b.name) from ${s.scheduleBrands} sb join ${s.brands} b on b.id = sb.brand_id where sb.schedule_id = ${s.schedules.id})`,
      })
      .from(s.schedules)
      .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
      .innerJoin(s.users, eq(s.users.id, s.schedules.promoterId))
      .where(
        and(
          eq(s.schedules.agencyId, scope.agencyId),
          eq(s.schedules.status, "active"),
          gte(s.schedules.date, f.from),
          lte(s.schedules.date, until),
          promoterFilter(scope, s.schedules.promoterId),
          f.promoter ? eq(s.schedules.promoterId, f.promoter) : undefined,
          f.store ? eq(s.schedules.storeId, f.store) : undefined,
          f.chain ? eq(s.stores.chainId, f.chain) : undefined,
          f.city ? eq(s.stores.city, f.city) : undefined,
          f.brand ? sql`exists (select 1 from ${s.scheduleBrands} sb where sb.schedule_id = ${s.schedules.id} and sb.brand_id = ${f.brand})` : undefined,
          // Gestor restrito a marcas: só programações com alguma marca dele.
          scope.brandIds
            ? scope.brandIds.length
              ? sql`exists (select 1 from ${s.scheduleBrands} sb where sb.schedule_id = ${s.schedules.id} and sb.brand_id in (${sql.join(scope.brandIds.map((b) => sql`${b}`), sql`, `)}))`
              : sql`false`
            : undefined,
          sql`not exists (select 1 from ${s.visits} v where v.schedule_id = ${s.schedules.id} and v.status <> 'cancelled')`,
        ),
      );
    for (const m of missed) issues.push(missedIssue(m.id, m.date, m.plannedStart, m.storeName, m.brands, m.promoterId, m.promoterName, pr.visit_missed));
  }

  // Análises registradas pelo gestor.
  if (issues.length) {
    const reviews = await db
      .select({ key: s.issueReviews.issueKey, status: s.issueReviews.status, action: s.issueReviews.action, at: s.issueReviews.updatedAt, userName: s.users.name })
      .from(s.issueReviews)
      .innerJoin(s.users, eq(s.users.id, s.issueReviews.userId))
      .where(and(eq(s.issueReviews.agencyId, scope.agencyId), inArray(s.issueReviews.issueKey, issues.map((i) => i.key))));
    for (const r of reviews) {
      const issue = issues.find((i) => i.key === r.key);
      if (issue) issue.review = { status: r.status, action: r.action, userName: r.userName, at: r.at };
    }
  }

  return issues
    .filter((i) => opts.includeConcluded || i.review?.status !== "concluded")
    .sort((a, b) => a.priority - b.priority || (a.review ? 1 : 0) - (b.review ? 1 : 0) || b.date.localeCompare(a.date));
}

function excuse(a: { exceptionItems: string[]; exceptionNote: string | null }, item: ExceptionItem): string {
  return a.exceptionItems.includes(item) ? `Exceção justificada (${EXCEPTION_ITEM_LABEL[item]}): “${a.exceptionNote ?? ""}”` : "Sem exceção registrada.";
}

/** Nº de produtos acompanhados por loja+marca (lista própria da loja ou todos os ativos da marca). */
export async function trackedCounts(agencyId: string): Promise<Map<string, number>> {
  const db = await getDb();
  const all = await db
    .select({ brandId: s.products.brandId, n: sql<number>`count(*)::int` })
    .from(s.products)
    .where(and(eq(s.products.agencyId, agencyId), eq(s.products.status, "active")))
    .groupBy(s.products.brandId);
  const custom = await db
    .select({ storeId: s.storeProducts.storeId, brandId: s.products.brandId, n: sql<number>`count(*)::int` })
    .from(s.storeProducts)
    .innerJoin(s.products, eq(s.products.id, s.storeProducts.productId))
    .where(and(eq(s.products.agencyId, agencyId), eq(s.products.status, "active")))
    .groupBy(s.storeProducts.storeId, s.products.brandId);
  const stores = await db.select({ storeId: s.storeBrands.storeId, brandId: s.storeBrands.brandId }).from(s.storeBrands);
  const map = new Map<string, number>();
  const byBrand = new Map(all.map((r) => [r.brandId, r.n]));
  for (const sb of stores) map.set(`${sb.storeId}:${sb.brandId}`, byBrand.get(sb.brandId) ?? 0);
  for (const c of custom) map.set(`${c.storeId}:${c.brandId}`, c.n);
  return map;
}
