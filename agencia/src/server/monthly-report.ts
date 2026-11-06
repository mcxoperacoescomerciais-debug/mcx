/**
 * Relatório mensal de atendimentos por marca (formato usado pela Etros com as
 * indústrias): uma aba por semana do mês com cada visita prevista (realizada,
 * não realizada ou feriado) agrupada por PDV com subtotal, o acumulado do mês
 * por PDV e semana (previstas, válidas, % e valor), a sistemática (quem atende
 * cada loja, em que dias, visitas no mês e valor por visita) e o resumo por
 * estabelecimento.
 *
 * Regras:
 *  - prevista = programação ativa da loja com a marca naquele dia (vem dos dias
 *    fixos da atribuição); atribuição sem dia fixo conta a quantidade da semana
 *    (proporcional aos dias da semana dentro do mês), com "Sem dia fixo";
 *  - realizada = atendimento da marca concluído na loja naquele dia — ou em
 *    outro dia da mesma semana, se aquele dia não teve atendimento;
 *  - feriado (Configurações › Feriados) sem atendimento conta como válida;
 *  - válidas = realizadas + feriados; valor = válidas × valor por visita.
 */
import "server-only";
import ExcelJS from "exceljs";
import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { brandFilter, promoterFilter } from "./scope";
import { filterIn } from "./filter-sql";
import { addDays, weekdayOf } from "@/lib/dates";
import { expectedInRange, type TargetPeriod } from "@/lib/portfolio";
import { sectorOf } from "@/lib/sectors-mg";

const UF: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};
const DAY_COLS = [1, 2, 3, 4, 5, 6] as const;

export interface MonthlyFilters {
  brandId: string;
  month: string; // AAAA-MM
  chain: string | null;
  promoter: string | null;
}

interface StoreInfo {
  id: string;
  pdv: string;
  cnpj: string;
  address: string;
  state: string;
  city: string;
  sector: string;
  chain: string;
}

export interface VisitRow {
  store: StoreInfo;
  promoter: string;
  agenda: string;
  done: string;
  status: "Realizada" | "Não realizada";
  holiday: boolean;
  note: string;
  ruptureNote: string;
}

export interface MonthWeek {
  index: number;
  from: string;
  to: string;
  label: string;
  rows: VisitRow[];
}

const ddmmyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const doneAt = (d: Date) => {
  const p = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}:${g("minute")}`;
};

/** Semanas de segunda a domingo, cortadas no mês. */
export function monthWeeks(month: string): { index: number; from: string; to: string; label: string }[] {
  const first = `${month}-01`;
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  const parts: { from: string; to: string }[] = [];
  let from = first;
  while (from <= last) {
    let to = addDays(from, (7 - weekdayOf(from)) % 7); // até domingo
    if (to > last) to = last;
    parts.push({ from, to });
    from = addDays(to, 1);
  }
  // Mês que começa num domingo: esse domingo entra na semana seguinte (não vira "semana" de um dia).
  if (parts.length > 1 && parts[0].from === parts[0].to && weekdayOf(parts[0].from) === 0) parts.splice(0, 2, { from: parts[0].from, to: parts[1].to });
  return parts.map((p, i) => ({ index: i + 1, ...p, label: `SEMANA ${i + 1} (${ddmm(p.from).slice(0, 2)}–${ddmm(p.to)})` }));
}

export function monthRange(month: string) {
  const weeks = monthWeeks(month);
  return { from: weeks[0].from, to: weeks[weeks.length - 1].to };
}

export async function monthlyReport(scope: Scope, f: MonthlyFilters) {
  const db = await getDb();
  const { from, to } = monthRange(f.month);
  const weeks = monthWeeks(f.month);
  const holidays = new Set(scope.settings.holidays);
  const visitValue = scope.settings.visitValue ?? 0;
  const [brand] = await db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(and(eq(s.brands.id, f.brandId), eq(s.brands.agencyId, scope.agencyId), brandFilter(scope, s.brands.id)));
  if (!brand) return null;

  const storeCols = { id: s.stores.id, name: s.stores.name, code: s.stores.code, cnpj: s.stores.cnpj, address: s.stores.address, district: s.stores.district, city: s.stores.city, state: s.stores.state, chain: s.chains.name };
  const toStore = (r: { id: string; name: string; code: string | null; cnpj: string | null; address: string | null; district: string | null; city: string; state: string; chain: string | null }): StoreInfo => ({
    id: r.id,
    pdv: r.code && !r.name.startsWith(r.code) ? `${r.code} - ${r.name}` : r.name,
    cnpj: r.cnpj ?? "",
    address: [r.address, r.district].filter(Boolean).join(" - "),
    state: UF[r.state?.toUpperCase()] ?? r.state ?? "",
    city: r.city,
    sector: sectorOf(r.city, r.state) ?? "",
    chain: r.chain ?? "",
  });

  // Programação (previstas) da marca no mês.
  const scheduled = await db
    .select({ date: s.schedules.date, promoterId: s.schedules.promoterId, promoter: s.users.name, store: storeCols })
    .from(s.schedules)
    .innerJoin(s.scheduleBrands, and(eq(s.scheduleBrands.scheduleId, s.schedules.id), eq(s.scheduleBrands.brandId, brand.id)))
    .innerJoin(s.stores, eq(s.stores.id, s.schedules.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.schedules.promoterId))
    .where(and(eq(s.schedules.agencyId, scope.agencyId), eq(s.schedules.status, "active"), gte(s.schedules.date, from), lte(s.schedules.date, to), filterIn(s.stores.chainId, f.chain), filterIn(s.schedules.promoterId, f.promoter), promoterFilter(scope, s.schedules.promoterId)))
    .orderBy(asc(s.schedules.date));

  // Atendimentos concluídos da marca no mês.
  const done = await db
    .select({ id: s.attendances.id, date: s.visits.visitDate, storeId: s.visits.storeId, promoterId: s.visits.promoterId, finishedAt: s.attendances.finishedAt, notes: s.attendances.notes, visitNotes: s.visits.notes, store: storeCols, promoter: s.users.name })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(and(eq(s.attendances.agencyId, scope.agencyId), eq(s.attendances.brandId, brand.id), eq(s.attendances.status, "completed"), gte(s.visits.visitDate, from), lte(s.visits.visitDate, to), filterIn(s.stores.chainId, f.chain), filterIn(s.visits.promoterId, f.promoter), promoterFilter(scope, s.visits.promoterId)))
    .orderBy(asc(s.attendances.finishedAt));
  const ruptures = done.length
    ? await db
        .select({ attendanceId: s.ruptures.attendanceId, product: s.products.name })
        .from(s.ruptures)
        .innerJoin(s.products, eq(s.products.id, s.ruptures.productId))
        .where(and(inArray(s.ruptures.attendanceId, done.map((d) => d.id)), isNull(s.ruptures.deletedAt)))
    : [];
  const ruptureByAtt = new Map<string, string[]>();
  for (const r of ruptures) ruptureByAtt.set(r.attendanceId, [...(ruptureByAtt.get(r.attendanceId) ?? []), r.product]);

  // Atribuições (sistemática) e lojas da marca sem promotor (OPEN).
  const targets = await db
    .select({ promoterId: s.visitTargets.promoterId, promoter: s.users.name, perWeek: s.visitTargets.perWeek, period: s.visitTargets.period, weekdays: s.visitTargets.weekdays, store: storeCols })
    .from(s.visitTargets)
    .innerJoin(s.stores, eq(s.stores.id, s.visitTargets.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.visitTargets.promoterId))
    .where(and(eq(s.visitTargets.agencyId, scope.agencyId), eq(s.visitTargets.brandId, brand.id), eq(s.users.status, "active"), filterIn(s.stores.chainId, f.chain), filterIn(s.visitTargets.promoterId, f.promoter), promoterFilter(scope, s.visitTargets.promoterId)));
  const open = f.promoter
    ? []
    : await db
        .select({ store: storeCols })
        .from(s.storeBrands)
        .innerJoin(s.stores, eq(s.stores.id, s.storeBrands.storeId))
        .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
        .where(and(eq(s.storeBrands.brandId, brand.id), eq(s.stores.agencyId, scope.agencyId), eq(s.stores.status, "active"), filterIn(s.stores.chainId, f.chain)));

  // Semanas: casa a programação com os atendimentos (mesmo dia; senão outro dia da semana).
  const used = new Set<string>();
  const doneOf = (storeId: string, wFrom: string, wTo: string) => done.filter((d) => d.storeId === storeId && d.date >= wFrom && d.date <= wTo && !used.has(d.id));
  const rowOf = (store: StoreInfo, promoter: string, agenda: string, att: (typeof done)[number] | undefined, holiday: boolean): VisitRow => {
    if (att) used.add(att.id);
    return {
      store,
      promoter,
      agenda,
      done: att ? (att.finishedAt ? doneAt(att.finishedAt) : ddmmyy(att.date)) : holiday ? "FERIADO" : "",
      status: att ? "Realizada" : "Não realizada",
      holiday: !att && holiday,
      note: att ? [att.notes, att.visitNotes].filter(Boolean).join(" · ") : "",
      ruptureNote: att ? (ruptureByAtt.get(att.id) ?? []).join(", ") : "",
    };
  };
  const result: MonthWeek[] = weeks.map((w) => {
    const rows: VisitRow[] = [];
    const inWeek = scheduled.filter((x) => x.date >= w.from && x.date <= w.to);
    // 1º: atendimento no próprio dia.
    const exact = new Map<(typeof inWeek)[number], VisitRow>();
    for (const sc of inWeek) {
      const att = doneOf(sc.store.id, sc.date, sc.date)[0];
      if (att) exact.set(sc, rowOf(toStore(sc.store), sc.promoter, ddmmyy(sc.date), att, false));
    }
    // 2º: atendimento em outro dia da mesma semana cobre a prevista que ficou sem.
    for (const sc of inWeek) {
      if (exact.has(sc)) continue;
      const att = doneOf(sc.store.id, w.from, w.to)[0];
      exact.set(sc, rowOf(toStore(sc.store), sc.promoter, ddmmyy(sc.date), att, holidays.has(sc.date)));
    }
    for (const sc of inWeek) rows.push(exact.get(sc)!);
    // Atribuição sem dia fixo: a quantidade da semana (proporcional aos dias do mês).
    for (const t of targets) {
      if (t.weekdays.length) continue;
      if (inWeek.some((sc) => sc.store.id === t.store.id && sc.promoterId === t.promoterId)) continue;
      const expected = Math.round(expectedInRange(t.perWeek, t.period as TargetPeriod, w.from, w.to));
      for (let i = 0; i < expected; i++) {
        const att = doneOf(t.store.id, w.from, w.to).find((d) => d.promoterId === t.promoterId) ?? doneOf(t.store.id, w.from, w.to)[0];
        rows.push(rowOf(toStore(t.store), t.promoter, att ? ddmmyy(att.date) : "Sem dia fixo", att, false));
      }
    }
    rows.sort((a, b) => a.store.pdv.localeCompare(b.store.pdv, "pt-BR", { numeric: true }) || a.agenda.localeCompare(b.agenda));
    return { ...w, rows };
  });

  // Acumulado por PDV.
  const stores = new Map<string, StoreInfo>();
  for (const w of result) for (const r of w.rows) stores.set(r.store.id, r.store);
  const count = (rows: VisitRow[]) => {
    const previstas = rows.length;
    const realizadas = rows.filter((r) => r.status === "Realizada").length;
    const feriados = rows.filter((r) => r.holiday).length;
    return { previstas, realizadas, feriados, validas: realizadas + feriados };
  };
  const accumulated = [...stores.values()]
    .sort((a, b) => a.pdv.localeCompare(b.pdv, "pt-BR", { numeric: true }))
    .map((st) => {
      const perWeek = result.map((w) => count(w.rows.filter((r) => r.store.id === st.id)));
      const month = count(result.flatMap((w) => w.rows.filter((r) => r.store.id === st.id)));
      return { store: st, perWeek, month };
    });

  // Sistemática.
  const monthlyVisits = (perWeek: number, period: string) => Math.round(expectedInRange(perWeek, period as TargetPeriod, from, to));
  const withTarget = new Set(targets.map((t) => t.store.id));
  const systematic = [
    ...targets.map((t) => ({
      promoter: t.promoter,
      store: toStore(t.store),
      days: DAY_COLS.map((d) => t.weekdays.includes(d)),
      weekly: t.period === "week" ? t.perWeek : t.period === "fortnight" ? t.perWeek / 2 : null,
      monthly: monthlyVisits(t.perWeek, t.period),
    })),
    ...open.filter((o) => !withTarget.has(o.store.id)).map((o) => ({ promoter: "OPEN", store: toStore(o.store), days: DAY_COLS.map(() => false), weekly: null, monthly: null })),
  ].sort((a, b) => (a.promoter === "OPEN" ? 1 : 0) - (b.promoter === "OPEN" ? 1 : 0) || a.promoter.localeCompare(b.promoter, "pt-BR") || a.store.pdv.localeCompare(b.store.pdv, "pt-BR", { numeric: true }));

  return { brand, month: f.month, from, to, weeks: result, accumulated, systematic, visitValue };
}

export type MonthlyReport = NonNullable<Awaited<ReturnType<typeof monthlyReport>>>;

/**
 * Tela Sistemática: quem atende cada loja × marca, em que dias e quantas
 * visitas (semana e mês), mais as lojas × marcas sem promotor (OPEN).
 */
export async function systematicList(scope: Scope, f: { brand: string | null; chain: string | null; promoter: string | null; city: string | null }, month: string) {
  const db = await getDb();
  const { from, to } = monthRange(month);
  const cols = {
    brandId: s.brands.id,
    brand: s.brands.name,
    storeId: s.stores.id,
    name: s.stores.name,
    code: s.stores.code,
    city: s.stores.city,
    state: s.stores.state,
    chain: s.chains.name,
  };
  const targets = await db
    .select({ ...cols, promoter: s.users.name, perWeek: s.visitTargets.perWeek, period: s.visitTargets.period, weekdays: s.visitTargets.weekdays })
    .from(s.visitTargets)
    .innerJoin(s.brands, eq(s.brands.id, s.visitTargets.brandId))
    .innerJoin(s.stores, eq(s.stores.id, s.visitTargets.storeId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .innerJoin(s.users, eq(s.users.id, s.visitTargets.promoterId))
    .where(
      and(
        eq(s.visitTargets.agencyId, scope.agencyId),
        eq(s.users.status, "active"),
        filterIn(s.visitTargets.brandId, f.brand),
        filterIn(s.stores.chainId, f.chain),
        filterIn(s.visitTargets.promoterId, f.promoter),
        filterIn(s.stores.city, f.city),
        brandFilter(scope, s.visitTargets.brandId),
        promoterFilter(scope, s.visitTargets.promoterId),
      ),
    );
  const covered = new Set(targets.map((t) => `${t.storeId}:${t.brandId}`));
  const open = f.promoter
    ? []
    : (
        await db
          .select(cols)
          .from(s.storeBrands)
          .innerJoin(s.brands, eq(s.brands.id, s.storeBrands.brandId))
          .innerJoin(s.stores, eq(s.stores.id, s.storeBrands.storeId))
          .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
          .where(
            and(
              eq(s.stores.agencyId, scope.agencyId),
              eq(s.stores.status, "active"),
              eq(s.brands.status, "active"),
              filterIn(s.storeBrands.brandId, f.brand),
              filterIn(s.stores.chainId, f.chain),
              filterIn(s.stores.city, f.city),
              brandFilter(scope, s.storeBrands.brandId),
            ),
          )
      ).filter((o) => !covered.has(`${o.storeId}:${o.brandId}`));
  const pdv = (r: { name: string; code: string | null }) => (r.code && !r.name.startsWith(r.code) ? `${r.code} - ${r.name}` : r.name);
  const rows = [
    ...targets.map((t) => ({
      promoter: t.promoter,
      brand: t.brand,
      chain: t.chain ?? "",
      pdv: pdv(t),
      state: UF[t.state?.toUpperCase()] ?? t.state,
      city: t.city,
      sector: sectorOf(t.city, t.state) ?? "",
      days: DAY_COLS.map((d) => t.weekdays.includes(d)),
      noFixedDay: !t.weekdays.length,
      weekly: t.period === "week" ? t.perWeek : t.period === "fortnight" ? t.perWeek / 2 : null,
      monthly: Math.round(expectedInRange(t.perWeek, t.period as TargetPeriod, from, to)),
    })),
    ...open.map((o) => ({
      promoter: "OPEN",
      brand: o.brand,
      chain: o.chain ?? "",
      pdv: pdv(o),
      state: UF[o.state?.toUpperCase()] ?? o.state,
      city: o.city,
      sector: sectorOf(o.city, o.state) ?? "",
      days: DAY_COLS.map(() => false),
      noFixedDay: false,
      weekly: null as number | null,
      monthly: null as number | null,
    })),
  ];
  return rows.sort(
    (a, b) =>
      (a.promoter === "OPEN" ? 1 : 0) - (b.promoter === "OPEN" ? 1 : 0) ||
      a.promoter.localeCompare(b.promoter, "pt-BR") ||
      a.brand.localeCompare(b.brand, "pt-BR") ||
      a.pdv.localeCompare(b.pdv, "pt-BR", { numeric: true }),
  );
}

// ───────────────────────────── Planilha ─────────────────────────────

const HEAD = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C323A" } } as ExcelJS.Fill };
const SUB = { font: { bold: true }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF6F7" } } as ExcelJS.Fill };
const PCT = "0.00%";
const BRL = '"R$" #,##0.00';
const MONTHS = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

function styleRow(row: ExcelJS.Row, st: { font?: Partial<ExcelJS.Font>; fill?: ExcelJS.Fill }, cols: number) {
  for (let c = 1; c <= cols; c++) {
    const cell = row.getCell(c);
    if (st.font) cell.font = st.font;
    if (st.fill) cell.fill = st.fill;
  }
}

export async function monthlyWorkbook(r: MonthlyReport, agency: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${agency} · MCX`;
  wb.created = new Date();
  const monthLabel = `${MONTHS[Number(r.month.slice(5, 7)) - 1]}/${r.month.slice(2, 4)}`;

  // Uma aba por semana.
  const weekHeader = ["PDV", "Caixas abastecidas", "Estado contagem", "PDV CNPJ", "PDV. END.", "PDV. Estado", "PDV. Cidade", "SETOR", "COLIGADA", "SITUAÇÃO", "DATA AGENDA", "DATA CONCLUÍDO", "OBSERVAÇÃO", "OBS. RUPTURA O.S.", "PROMOTOR"];
  for (const w of r.weeks) {
    const ws = wb.addWorksheet(`Semana ${w.index} (${w.from.slice(8, 10)} a ${w.to.slice(8, 10)})`, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = weekHeader.map((h, i) => ({ header: h, width: [34, 10, 14, 17, 48, 14, 18, 32, 10, 14, 13, 17, 30, 30, 26][i] }));
    styleRow(ws.getRow(1), HEAD, weekHeader.length);
    const totals = { previstas: 0, realizadas: 0, feriados: 0 };
    const groups = new Map<string, VisitRow[]>();
    for (const row of w.rows) groups.set(row.store.id, [...(groups.get(row.store.id) ?? []), row]);
    for (const rows of groups.values()) {
      for (const x of rows)
        ws.addRow([x.store.pdv, null, "Não aplicável", x.store.cnpj, x.store.address, x.store.state, x.store.city, x.store.sector, null, x.status, x.agenda, x.done, x.note, x.ruptureNote, x.promoter]);
      const previstas = rows.length;
      const realizadas = rows.filter((x) => x.status === "Realizada").length;
      const feriados = rows.filter((x) => x.holiday).length;
      totals.previstas += previstas;
      totals.realizadas += realizadas;
      totals.feriados += feriados;
      const sub = ws.addRow([null, previstas, realizadas, feriados, realizadas + feriados, "% Realizadas", previstas ? (realizadas + feriados) / previstas : 0, null, null, previstas - realizadas - feriados]);
      sub.getCell(7).numFmt = PCT;
      styleRow(sub, SUB, 10);
      ws.addRow([]);
    }
    if (!w.rows.length) ws.addRow(["Nenhuma visita prevista nesta semana."]);
    const val = totals.realizadas + totals.feriados;
    const tot = ws.addRow(["Total", totals.previstas, totals.realizadas, totals.feriados, val, "% Total", totals.previstas ? val / totals.previstas : 0, null, null, totals.previstas - val]);
    tot.getCell(7).numFmt = PCT;
    styleRow(tot, HEAD, 10);
    ws.addRow([]);
    ws.addRow(["Linha de subtotal: B = previstas · C = realizadas · D = feriados · E = válidas (realizadas + feriados) · G = % · J = não realizadas"]).font = { italic: true, color: { argb: "FF687175" } };
  }

  // Acumulado do mês.
  const acc = wb.addWorksheet("Acumulado mês", { views: [{ state: "frozen", ySplit: 4, xSplit: 1 }] });
  const nW = r.weeks.length;
  acc.getCell(1, 1).value = `ACUMULADO DO MÊS – ${monthLabel} – % DE APROVEITAMENTO POR PDV (Realizadas + Feriados ÷ Previstas) · ${r.brand.name}`;
  acc.getCell(1, 1).font = { bold: true, size: 13 };
  acc.getCell(2, 1).value = "Valor por visita válida (R$) →";
  acc.getCell(2, 2).value = r.visitValue;
  acc.getCell(2, 2).numFmt = BRL;
  const groupStart = (i: number) => 4 + i * 4;
  for (let i = 0; i <= nW; i++) {
    const c = groupStart(i);
    acc.mergeCells(3, c, 3, c + 3);
    acc.getCell(3, c).value = i < nW ? r.weeks[i].label : "ACUMULADO MÊS";
    acc.getCell(3, c).alignment = { horizontal: "center" };
  }
  const accHead = ["PDV", "Cidade", "Setor", ...Array.from({ length: nW + 1 }, (_, i) => ["Previstas", "Válidas*", i < nW ? "%" : "% Mês", "Valor (R$)"]).flat()];
  acc.getRow(4).values = accHead;
  styleRow(acc.getRow(3), HEAD, accHead.length);
  styleRow(acc.getRow(4), HEAD, accHead.length);
  acc.getColumn(1).width = 36;
  acc.getColumn(2).width = 18;
  acc.getColumn(3).width = 32;
  const sum = Array.from({ length: nW + 1 }, () => ({ previstas: 0, validas: 0 }));
  for (const a of r.accumulated) {
    const vals: (string | number | null)[] = [a.store.pdv, a.store.city, a.store.sector];
    [...a.perWeek, a.month].forEach((x, i) => {
      vals.push(x.previstas, x.validas, x.previstas ? x.validas / x.previstas : null, x.validas * r.visitValue);
      sum[i].previstas += x.previstas;
      sum[i].validas += x.validas;
    });
    const row = acc.addRow(vals);
    for (let i = 0; i <= nW; i++) {
      row.getCell(groupStart(i) + 2).numFmt = PCT;
      row.getCell(groupStart(i) + 3).numFmt = BRL;
    }
  }
  const totalRow = acc.addRow(["TOTAL GERAL", null, null, ...sum.flatMap((x) => [x.previstas, x.validas, x.previstas ? x.validas / x.previstas : null, x.validas * r.visitValue])]);
  for (let i = 0; i <= nW; i++) {
    totalRow.getCell(groupStart(i) + 2).numFmt = PCT;
    totalRow.getCell(groupStart(i) + 3).numFmt = BRL;
  }
  styleRow(totalRow, HEAD, accHead.length);
  acc.addRow([]);
  acc.addRow(["* Válidas = realizadas + feriados (Configurações › Feriados). Valor = válidas × valor por visita."]).font = { italic: true, color: { argb: "FF687175" } };

  // Sistemática.
  const sys = wb.addWorksheet("Sistemática", { views: [{ state: "frozen", ySplit: 1 }] });
  const sysHead = ["Promotor", "Indústria", "Rede", "Loja", "Estado", "Cidade", "Setor", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb.", "Visitas semanais", "Visitas mensais", "VF por visita"];
  sys.columns = sysHead.map((h, i) => ({ header: h, width: [32, 30, 16, 34, 14, 18, 32, 6, 6, 6, 6, 6, 6, 10, 10, 12][i] }));
  styleRow(sys.getRow(1), HEAD, sysHead.length);
  for (const x of r.systematic) {
    const row = sys.addRow([x.promoter, r.brand.name, x.store.chain, x.store.pdv, x.store.state, x.store.city, x.store.sector, ...x.days.map((d) => (d ? "X" : null)), x.weekly, x.monthly, r.visitValue]);
    row.getCell(16).numFmt = BRL;
  }
  if (r.systematic.length) sys.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sysHead.length } };

  // Por estabelecimento.
  const est = wb.addWorksheet("Por estab.", { views: [{ state: "frozen", ySplit: 1 }] });
  const estHead = ["CLIENTE", "PDV", "PDV CNPJ", "PDV END.", "PDV. Estado", "PDV. Cidade", "SETOR", "VISITAS PREVISTAS", "VISITAS VÁLIDAS", "% REALIZADO", "VALOR A PAGAR"];
  est.columns = estHead.map((h, i) => ({ header: h, width: [30, 34, 17, 48, 14, 18, 32, 12, 12, 12, 14][i] }));
  styleRow(est.getRow(1), HEAD, estHead.length);
  for (const a of r.accumulated) {
    const row = est.addRow([r.brand.name, a.store.pdv, a.store.cnpj, a.store.address, a.store.state, a.store.city, a.store.sector, a.month.previstas, a.month.validas, a.month.previstas ? a.month.validas / a.month.previstas : null, a.month.validas * r.visitValue]);
    row.getCell(10).numFmt = PCT;
    row.getCell(11).numFmt = BRL;
  }
  const m = sum[nW];
  est.addRow([]);
  const foot = est.addRow([null, null, null, null, null, null, "Total", m.previstas, m.validas, m.previstas ? m.validas / m.previstas : null, m.validas * r.visitValue]);
  foot.getCell(10).numFmt = PCT;
  foot.getCell(11).numFmt = BRL;
  styleRow(foot, SUB, estHead.length);
  const prev = est.addRow([null, null, null, null, null, null, "Valor previsto", null, null, null, m.previstas * r.visitValue]);
  prev.getCell(11).numFmt = BRL;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
