/**
 * Conjuntos de dados dos relatórios (diário e por marca) e das exportações.
 * Mesmas consultas com escopo do painel: PDF, Excel e tela mostram os mesmos
 * números.
 */
import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { getDayBoard, getRangeBoard, summarizePromoters, PROMOTER_STATUS_LABEL } from "./operations";
import { listIssues } from "./issues";
import { ruptureList, stockRecords } from "./analytics";
import { listVisits } from "./history";
import type { PanelFilters } from "@/lib/filters";
import {
  ATTENDANCE_STATUS_LABEL,
  ISSUE_KIND_LABEL,
  OCCURRENCE_CATEGORY_LABEL,
  OCCURRENCE_STATUS_LABEL,
  RUPTURE_SITUATION_LABEL,
  STOCK_STATE_LABEL,
  STOP_BUCKET_LABEL,
  VISIT_STATUS_LABEL,
} from "@/lib/domain";
import { fmtDateTime, fmtTime } from "@/lib/dates";
import type { SheetSpec } from "./xlsx";
import { filterIn } from "@/server/filter-sql";

/** Relatório do dia; com `range`, o período from → to (exportação de visitas). */
export async function dailyReport(scope: Scope, f: PanelFilters, range = false) {
  const day = range ? { ...f, page: 1, status: null, kind: null, q: "" } : { ...f, from: f.date, to: f.date, page: 1, status: null, kind: null, q: "" };
  const [board, issues, ruptures, zeroStock, occurrences] = await Promise.all([
    range ? getRangeBoard(scope, f) : getDayBoard(scope, f),
    listIssues(scope, day),
    ruptureList(scope, day, { pageSize: 2000 }),
    stockRecords(scope, { ...day, status: "zero" }, { pageSize: 2000 }),
    occurrencesOf(scope, day),
  ]);
  const promoters = summarizePromoters(board);
  const brandMap = new Map<string, { brand: string; planned: number; completed: number; inProgress: number; correction: number; cancelled: number; pending: number }>();
  for (const st of board.stops) {
    for (const b of st.plannedBrands) {
      const row = brandMap.get(b.name) ?? { brand: b.name, planned: 0, completed: 0, inProgress: 0, correction: 0, cancelled: 0, pending: 0 };
      row.planned++;
      const a = st.attendances.find((x) => x.brandId === b.id);
      if (!a) row.pending++;
      else if (a.status === "completed") row.completed++;
      else if (a.status === "in_progress") row.inProgress++;
      else if (a.status === "correction_requested") row.correction++;
      else row.cancelled++;
      brandMap.set(b.name, row);
    }
  }
  return { board, promoters, issues, ruptures: ruptures.rows, zeroStock: zeroStock.rows, occurrences, byBrand: [...brandMap.values()].sort((a, b) => a.brand.localeCompare(b.brand, "pt-BR")) };
}

async function occurrencesOf(scope: Scope, f: Pick<PanelFilters, "from" | "to" | "brand" | "store" | "promoter" | "chain" | "city">) {
  const db = await getDb();
  return db
    .select({
      id: s.occurrences.id,
      category: s.occurrences.category,
      note: s.occurrences.note,
      status: s.occurrences.status,
      recordedAt: s.occurrences.recordedAt,
      storeName: s.stores.name,
      brandName: s.brands.name,
      promoterName: s.users.name,
    })
    .from(s.occurrences)
    .innerJoin(s.attendances, eq(s.attendances.id, s.occurrences.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(
      and(
        eq(s.occurrences.agencyId, scope.agencyId),
        isNull(s.occurrences.deletedAt),
        gte(s.visits.visitDate, f.from),
        lte(s.visits.visitDate, f.to),
        brandFilter(scope, s.attendances.brandId),
        promoterFilter(scope, s.visits.promoterId),
        f.brand ? filterIn(s.attendances.brandId, f.brand) : undefined,
        f.store ? filterIn(s.visits.storeId, f.store) : undefined,
        f.promoter ? filterIn(s.visits.promoterId, f.promoter) : undefined,
        f.chain ? filterIn(s.stores.chainId, f.chain) : undefined,
        f.city ? filterIn(s.stores.city, f.city) : undefined,
      ),
    );
}

export type DailyReport = Awaited<ReturnType<typeof dailyReport>>;

export function dailySheets(r: DailyReport): SheetSpec[] {
  return [
    {
      name: "Lojas",
      columns: [
        { header: "Data", key: "date", width: 11 },
        { header: "Loja", key: "store", width: 32 },
        { header: "Rede", key: "chain", width: 16 },
        { header: "Cidade", key: "city", width: 18 },
        { header: "Promotor", key: "promoter", width: 22 },
        { header: "Previsto", key: "planned" },
        { header: "Início", key: "start" },
        { header: "Fim", key: "end" },
        { header: "Marcas previstas", key: "brands", width: 36 },
        { header: "Marcas concluídas", key: "done" },
        { header: "Marcas atendidas", key: "attended", width: 36 },
        { header: "Marcas NÃO atendidas", key: "notAttended", width: 36 },
        { header: "Situação", key: "bucket", width: 22 },
        { header: "Pendências", key: "issues" },
      ],
      rows: r.board.stops.map((st) => ({
        date: st.date.split("-").reverse().join("/"),
        store: st.storeName,
        chain: st.chainName,
        city: st.city,
        promoter: st.promoterName,
        planned: st.plannedStart ?? (st.scheduleId ? "" : st.visit?.origin === "portfolio" ? "carteira" : "extraordinária"),
        start: st.visit ? fmtTime(st.visit.startedAt) : "",
        end: st.visit?.finishedAt ? fmtTime(st.visit.finishedAt) : "",
        brands: st.plannedBrands.map((b) => b.name).join(", "),
        done: `${st.brandsDone}/${st.brandsTotal}`,
        attended: st.plannedBrands.filter((b) => st.attendances.some((a) => a.brandId === b.id && a.status === "completed")).map((b) => b.name).join(", "),
        notAttended: st.plannedBrands.filter((b) => !st.attendances.some((a) => a.brandId === b.id && a.status === "completed")).map((b) => b.name).join(", "),
        bucket: STOP_BUCKET_LABEL[st.bucket],
        issues: st.issues,
      })),
    },
    {
      name: "Atendimentos",
      columns: [
        { header: "Loja", key: "store", width: 30 },
        { header: "Promotor", key: "promoter", width: 22 },
        { header: "Marca", key: "brand", width: 18 },
        { header: "Status", key: "status", width: 22 },
        { header: "Início", key: "start" },
        { header: "Fim", key: "end" },
        { header: "Fotos antes", key: "before" },
        { header: "Fotos depois", key: "after" },
        { header: "Fotos não sincronizadas", key: "pending" },
        { header: "Rupturas", key: "ruptures" },
        { header: "Exceção", key: "exception", width: 24 },
      ],
      rows: r.board.stops.flatMap((st) =>
        st.attendances.map((a) => ({
          store: st.storeName,
          promoter: st.promoterName,
          brand: a.brandName,
          status: ATTENDANCE_STATUS_LABEL[a.status],
          start: fmtTime(a.startedAt),
          end: a.finishedAt ? fmtTime(a.finishedAt) : "",
          before: a.before,
          after: a.after,
          pending: a.pendingUploads,
          ruptures: a.ruptures,
          exception: a.exceptionItems.join(", "),
        })),
      ),
    },
    {
      name: "Promotores",
      columns: [
        { header: "Promotor", key: "name", width: 24 },
        { header: "Lojas programadas", key: "scheduled" },
        { header: "Visitas iniciadas", key: "started" },
        { header: "Lojas concluídas", key: "completed" },
        { header: "Marcas atendidas", key: "att" },
        { header: "Pendências", key: "issues" },
        { header: "Último registro", key: "last", width: 18 },
        { header: "Situação", key: "status", width: 20 },
      ],
      rows: r.promoters.map((p) => ({
        name: p.name,
        scheduled: p.scheduled,
        started: p.started,
        completed: p.completed,
        att: `${p.attendancesDone}/${p.attendancesTotal}`,
        issues: p.issues,
        last: p.lastActivity ? fmtDateTime(p.lastActivity) : "",
        status: PROMOTER_STATUS_LABEL[p.status],
      })),
    },
    rupturesSheet(r.ruptures),
    {
      name: "Estoque zero",
      columns: [
        { header: "Loja", key: "store", width: 30 },
        { header: "Marca", key: "brand", width: 16 },
        { header: "Produto", key: "product", width: 36 },
        { header: "SKU", key: "sku" },
        { header: "Promotor", key: "promoter", width: 22 },
      ],
      rows: r.zeroStock.map((z) => ({ store: z.store_name, brand: z.brand_name, product: z.product_name, sku: z.sku, promoter: z.promoter_name })),
    },
    {
      name: "Pendências",
      columns: [
        { header: "Prioridade", key: "p" },
        { header: "Tipo", key: "kind", width: 26 },
        { header: "Descrição", key: "title", width: 40 },
        { header: "Detalhe", key: "detail", width: 50 },
        { header: "Loja", key: "store", width: 28 },
        { header: "Marca", key: "brand", width: 16 },
        { header: "Promotor", key: "promoter", width: 22 },
        { header: "Análise", key: "review", width: 40 },
      ],
      rows: r.issues.map((i) => ({
        p: i.priority,
        kind: ISSUE_KIND_LABEL[i.kind],
        title: i.title,
        detail: i.detail,
        store: i.storeName,
        brand: i.brandName,
        promoter: i.promoterName,
        review: i.review ? `${i.review.userName}: ${i.review.action}` : "",
      })),
    },
    {
      name: "Ocorrências",
      columns: [
        { header: "Data/hora", key: "at", width: 18 },
        { header: "Loja", key: "store", width: 28 },
        { header: "Marca", key: "brand", width: 16 },
        { header: "Categoria", key: "category", width: 30 },
        { header: "Observação", key: "note", width: 40 },
        { header: "Status", key: "status" },
      ],
      rows: r.occurrences.map((o) => ({ at: fmtDateTime(o.recordedAt), store: o.storeName, brand: o.brandName, category: OCCURRENCE_CATEGORY_LABEL[o.category], note: o.note, status: OCCURRENCE_STATUS_LABEL[o.status] })),
    },
  ];
}

export function rupturesSheet(rows: Awaited<ReturnType<typeof ruptureList>>["rows"]): SheetSpec {
  return {
    name: "Rupturas",
    columns: [
      { header: "Registrada em", key: "at", width: 18 },
      { header: "Data da visita", key: "date", width: 13 },
      { header: "Loja", key: "store", width: 30 },
      { header: "Cidade", key: "city", width: 16 },
      { header: "Marca", key: "brand", width: 16 },
      { header: "Produto", key: "product", width: 36 },
      { header: "SKU", key: "sku" },
      { header: "Situação", key: "situation", width: 30 },
      { header: "Promotor", key: "promoter", width: 22 },
    ],
    rows: rows.map((r) => ({
      at: fmtDateTime(r.recordedAt),
      date: r.visitDate,
      store: r.storeName,
      city: r.city,
      brand: r.brandName,
      product: r.productName,
      sku: r.sku,
      situation: RUPTURE_SITUATION_LABEL[r.situation],
      promoter: r.promoterName,
    })),
  };
}

export function stockSheet(rows: Awaited<ReturnType<typeof stockRecords>>["rows"]): SheetSpec {
  return {
    name: "Estoque",
    columns: [
      { header: "Data", key: "date", width: 12 },
      { header: "Loja", key: "store", width: 30 },
      { header: "Cidade", key: "city", width: 16 },
      { header: "Marca", key: "brand", width: 16 },
      { header: "Produto", key: "product", width: 36 },
      { header: "SKU", key: "sku" },
      { header: "Situação", key: "state", width: 22 },
      { header: "Quantidade", key: "qty" },
      { header: "Unidade", key: "unit" },
      { header: "Quantidade anterior", key: "prev" },
      { header: "Data anterior", key: "prevDate", width: 12 },
      { header: "Divergência relevante", key: "div" },
      { header: "Observação", key: "note", width: 30 },
      { header: "Promotor", key: "promoter", width: 22 },
    ],
    rows: rows.map((r) => ({
      date: r.visit_date,
      store: r.store_name,
      city: r.city,
      brand: r.brand_name,
      product: r.product_name,
      sku: r.sku,
      state: STOCK_STATE_LABEL[r.state],
      qty: r.quantity,
      unit: r.unit,
      prev: r.prev_quantity,
      prevDate: r.prev_date,
      div: r.divergent ? "Sim" : "",
      note: r.note,
      promoter: r.promoter_name,
    })),
    note: "Levantamento realizado pelo promotor; não representa o saldo oficial do estoque do supermercado. Campo vazio na situação significa que não houve registro (pendente), nunca estoque zero.",
  };
}

export async function attendancesSheet(scope: Scope, f: PanelFilters): Promise<SheetSpec> {
  const visits = await listVisits(scope, f, 5000);
  return {
    name: "Atendimentos",
    columns: [
      { header: "Data", key: "date", width: 12 },
      { header: "Loja", key: "store", width: 30 },
      { header: "Rede", key: "chain", width: 16 },
      { header: "Cidade", key: "city", width: 16 },
      { header: "Promotor", key: "promoter", width: 22 },
      { header: "Visita", key: "visit", width: 20 },
      { header: "Início da visita", key: "vstart" },
      { header: "Fim da visita", key: "vend" },
      { header: "Marca", key: "brand", width: 16 },
      { header: "Status do atendimento", key: "status", width: 22 },
      { header: "Início", key: "start" },
      { header: "Fim", key: "end" },
      { header: "Fotos", key: "photos" },
      { header: "Rupturas", key: "ruptures" },
      { header: "Exceção", key: "exception", width: 20 },
    ],
    rows: visits.flatMap((v) =>
      v.attendances.map((a) => ({
        date: v.date,
        store: v.storeName,
        chain: v.chainName,
        city: v.city,
        promoter: v.promoterName,
        visit: VISIT_STATUS_LABEL[v.status],
        vstart: fmtTime(v.startedAt),
        vend: v.finishedAt ? fmtTime(v.finishedAt) : "",
        brand: a.brandName,
        status: ATTENDANCE_STATUS_LABEL[a.status],
        start: fmtTime(a.startedAt),
        end: a.finishedAt ? fmtTime(a.finishedAt) : "",
        photos: a.photos,
        ruptures: a.ruptures,
        exception: a.exceptionItems.join(", "),
      })),
    ),
  };
}

/** Relatório por marca: agrupado por loja e por produto. */
export async function brandReport(scope: Scope, f: PanelFilters) {
  const db = await getDb();
  if (!f.brand) throw new Error("Escolha a marca.");
  const [brand] = await db.select().from(s.brands).where(and(filterIn(s.brands.id, f.brand), eq(s.brands.agencyId, scope.agencyId)));
  const visits = await listVisits(scope, f, 5000);
  const atts = visits.flatMap((v) => v.attendances.map((a) => ({ ...a, storeId: v.storeId, storeName: v.storeName, city: v.city, date: v.date })));
  const byStore = new Map<string, { store: string; city: string; visits: number; completed: number; exceptions: number; ruptures: number; last: string }>();
  for (const a of atts) {
    const row = byStore.get(a.storeId) ?? { store: a.storeName, city: a.city, visits: 0, completed: 0, exceptions: 0, ruptures: 0, last: a.date };
    row.visits++;
    if (a.status === "completed") row.completed++;
    if (a.exceptionItems.length || a.status === "cancelled") row.exceptions++;
    row.ruptures += a.ruptures;
    if (a.date > row.last) row.last = a.date;
    byStore.set(a.storeId, row);
  }
  const stock = await stockRecords(scope, { ...f, status: null, q: "" }, { pageSize: 20000, page: 1 });
  // Último levantamento de cada produto em cada loja no período.
  const latest = new Map<string, (typeof stock.rows)[number]>();
  for (const r of stock.rows) {
    const k = `${r.store_id}:${r.product_id}`;
    if (!latest.has(k)) latest.set(k, r);
  }
  const byProduct = new Map<string, { product: string; sku: string; stores: number; zero: number; notFound: number; quantity: number; ruptures: number }>();
  for (const r of latest.values()) {
    const row = byProduct.get(r.product_id) ?? { product: r.product_name, sku: r.sku, stores: 0, zero: 0, notFound: 0, quantity: 0, ruptures: 0 };
    row.stores++;
    if (r.state === "zero") row.zero++;
    if (r.state === "not_found") row.notFound++;
    if (r.quantity) row.quantity += r.quantity;
    byProduct.set(r.product_id, row);
  }
  const ruptures = await ruptureList(scope, { ...f, status: null, kind: null, q: "" }, { pageSize: 5000, page: 1 });
  const rupCount = await db
    .select({ productId: s.ruptures.productId, n: sql<number>`count(*)::int` })
    .from(s.ruptures)
    .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(filterIn(s.attendances.brandId, f.brand), isNull(s.ruptures.deletedAt), gte(s.visits.visitDate, f.from), lte(s.visits.visitDate, f.to), promoterFilter(scope, s.visits.promoterId)))
    .groupBy(s.ruptures.productId);
  for (const rc of rupCount) {
    const row = byProduct.get(rc.productId);
    if (row) row.ruptures = rc.n;
  }
  return {
    brand,
    attendances: atts,
    byStore: [...byStore.values()].sort((a, b) => a.store.localeCompare(b.store, "pt-BR")),
    byProduct: [...byProduct.values()].sort((a, b) => a.product.localeCompare(b.product, "pt-BR")),
    latest: [...latest.values()],
    ruptures: ruptures.rows,
  };
}
