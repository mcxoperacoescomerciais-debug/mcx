/**
 * Importação do cronograma enviado pela marca (planilha .xlsx/.csv):
 * 1. guarda o arquivo original; 2. acha a linha de cabeçalho e mapeia as colunas;
 * 3. devolve as linhas para CONFERÊNCIA (nada é salvo sem o responsável aprovar);
 * 4. salva só as aprovadas, ligadas ao arquivo, sem duplicar eventos.
 */
import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import type { ActionResult } from "./manager";
import { addTastingFile, canManageTastings, findDuplicate, saveTasting, type TastingInput } from "./tastings";
import { isIsoDate, todayIso } from "@/lib/dates";

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Sinônimos de cabeçalho (como as marcas costumam escrever). */
const COLUMNS: Record<keyof ScheduleRow | "time", string[]> = {
  date: ["data", "dia", "data_da_acao", "data_acao", "date"],
  time: ["horario", "hora", "periodo", "horario_da_acao"],
  startTime: ["inicio", "hora_inicio", "horario_inicial", "hora_inicial", "entrada"],
  endTime: ["fim", "termino", "hora_fim", "horario_final", "hora_final", "saida"],
  chainName: ["rede", "bandeira", "cliente", "rede_varejista"],
  storeName: ["loja", "pdv", "ponto_de_venda", "filial", "unidade", "estabelecimento"],
  city: ["cidade", "municipio", "praca"],
  state: ["uf", "estado"],
  product: ["produto", "produtos", "sku", "item"],
  description: ["acao", "descricao", "atividade", "tipo", "descricao_da_acao"],
  materialsNote: ["materiais", "material", "kit", "materiais_necessarios"],
  revenue: ["valor", "valor_marca", "valor_acao", "valor_da_acao", "receita", "valor_total", "preco"],
  tasterFee: ["valor_degustadora", "cache", "diaria", "remuneracao", "pagamento_degustadora"],
  orderRef: ["pedido", "referencia", "campanha", "po", "numero_pedido"],
  actionCode: ["codigo", "cod", "codigo_acao", "id_acao"],
  notes: ["obs", "observacao", "observacoes", "notas"],
};

export interface ScheduleRow {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  chainName: string | null;
  storeName: string | null;
  city: string | null;
  state: string | null;
  product: string | null;
  description: string | null;
  materialsNote: string | null;
  revenue: number | null;
  tasterFee: number | null;
  orderRef: string | null;
  actionCode: string | null;
  notes: string | null;
}

export interface PreviewRow extends ScheduleRow {
  line: number;
  issues: string[];
  duplicate: boolean;
  storeId: string | null;
}

/** "R$ 1.234,56" / "1234.5" / 350 → número. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  const t = String(v ?? "").replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** dd/mm/aaaa, dd/mm/aa, dd/mm (ano atual), aaaa-mm-dd ou data do Excel → aaaa-mm-dd. */
export function parseDate(v: unknown, today = todayIso()): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const t = String(v ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isIsoDate(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = t.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : today.slice(0, 4);
  const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

/** "9h", "09:00", "9h30", "09:00 às 13:00" → [início, fim]. */
export function parseTimes(v: unknown): [string | null, string | null] {
  const t = String(v ?? "").toLowerCase();
  const found = [...t.matchAll(/(\d{1,2})\s*(?:[:h]\s*(\d{2})?)/g)].map((m) => `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x));
  return [found[0] ?? null, found[1] ?? null];
}

function cellText(c: ExcelJS.Cell): unknown {
  const v = c.value;
  if (v instanceof Date) return v;
  if (v && typeof v === "object" && "result" in v) return (v as { result: unknown }).result;
  if (typeof v === "number") return v;
  return String(c.text ?? "").trim();
}

/** Lê a planilha: cabeçalho é a linha (entre as 15 primeiras) que mais bate com os nomes conhecidos. */
export async function readSchedule(file: File): Promise<{ rows: { line: number; data: ScheduleRow }[]; mapped: string[]; unmapped: string[] }> {
  const buf = Buffer.from(await file.arrayBuffer());
  let grid: unknown[][] = [];
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    grid = Papa.parse<string[]>(buf.toString("utf8").replace(/^﻿/, ""), { skipEmptyLines: true, delimiter: "" }).data;
  } else {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets.find((w) => w.rowCount > 1) ?? wb.worksheets[0];
    if (!ws) return { rows: [], mapped: [], unmapped: [] };
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const vals: unknown[] = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(row.getCell(c)));
      grid.push(vals);
    }
  }
  const all = Object.entries(COLUMNS);
  let headerIdx = 0;
  let best = -1;
  for (let i = 0; i < Math.min(15, grid.length); i++) {
    const score = grid[i].filter((v) => all.some(([, syn]) => syn.includes(norm(String(v ?? ""))))).length;
    if (score > best) {
      best = score;
      headerIdx = i;
    }
  }
  const header = (grid[headerIdx] ?? []).map((v) => norm(String(v ?? "")));
  const colOf = new Map<string, number>();
  for (const [key, syn] of all) {
    const idx = header.findIndex((h) => syn.includes(h));
    if (idx >= 0) colOf.set(key, idx);
  }
  const used = new Set(colOf.values());
  const unmapped = header.filter((h, i) => h && !used.has(i));
  const get = (row: unknown[], key: string) => (colOf.has(key) ? row[colOf.get(key)!] : undefined);
  const str = (v: unknown) => {
    const t = v instanceof Date ? "" : String(v ?? "").trim();
    return t ? t : null;
  };
  const rows: { line: number; data: ScheduleRow }[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const row = grid[i];
    if (!row.some((v) => String(v ?? "").trim())) continue;
    const [t1, t2] = parseTimes(get(row, "time"));
    const [s1] = parseTimes(get(row, "startTime"));
    const [e1] = parseTimes(get(row, "endTime"));
    rows.push({
      line: i + 1,
      data: {
        date: parseDate(get(row, "date")),
        startTime: s1 ?? t1,
        endTime: e1 ?? t2,
        chainName: str(get(row, "chainName")),
        storeName: str(get(row, "storeName")),
        city: str(get(row, "city")),
        state: str(get(row, "state"))?.toUpperCase().slice(0, 2) ?? null,
        product: str(get(row, "product")),
        description: str(get(row, "description")),
        materialsNote: str(get(row, "materialsNote")),
        revenue: parseMoney(get(row, "revenue")),
        tasterFee: parseMoney(get(row, "tasterFee")),
        orderRef: str(get(row, "orderRef")),
        actionCode: str(get(row, "actionCode")),
        notes: str(get(row, "notes")),
      },
    });
  }
  return { rows, mapped: [...colOf.keys()], unmapped };
}

/** Problemas que impedem salvar (o responsável corrige na conferência). */
export function rowIssues(r: ScheduleRow): string[] {
  const out: string[] = [];
  if (!r.date) out.push("sem data");
  if (!r.storeName && !r.chainName) out.push("sem loja");
  if (!r.city) out.push("sem cidade");
  if (r.startTime && r.endTime && r.endTime <= r.startTime) out.push("horário final antes do inicial");
  if (r.revenue === null) out.push("sem valor da marca (fica pendente)");
  return out;
}
const BLOCKING = new Set(["sem data", "sem loja", "sem cidade", "horário final antes do inicial"]);

/** Passo 1: guarda o arquivo e devolve as linhas para conferência (nada de degustação é criado). */
export async function previewSchedule(scope: Scope, brandId: string, file: File): Promise<(ActionResult & { batchId?: string; rows?: PreviewRow[]; mapped?: string[]; unmapped?: string[] })> {
  if (!canManageTastings(scope)) return { ok: false, error: "Sem permissão." };
  const db = await getDb();
  const [brand] = await db.select().from(s.brands).where(and(eq(s.brands.id, brandId), eq(s.brands.agencyId, scope.agencyId)));
  if (!brand) return { ok: false, error: "Escolha a marca do cronograma." };
  let parsed;
  try {
    parsed = await readSchedule(file);
  } catch {
    return { ok: false, error: "Não consegui ler o arquivo. Envie .xlsx ou .csv (PDF fica só anexado — cadastre os eventos manualmente)." };
  }
  const [batch] = await db.insert(s.tastingBatches).values({ agencyId: scope.agencyId, brandId, rowsRead: parsed.rows.length, createdBy: scope.userId }).returning({ id: s.tastingBatches.id });
  const saved = await addTastingFile(scope, { batchId: batch.id }, "schedule", file);
  if (saved.ok && saved.id) await db.update(s.tastingBatches).set({ fileId: saved.id }).where(eq(s.tastingBatches.id, batch.id));
  const stores = await db.select({ id: s.stores.id, name: s.stores.name, city: s.stores.city }).from(s.stores).where(eq(s.stores.agencyId, scope.agencyId));
  const key = (v: string | null) => norm(v ?? "");
  const seen = new Set<string>();
  const rows: PreviewRow[] = [];
  for (const { line, data } of parsed.rows) {
    const match = stores.find((st) => key(st.name) === key(data.storeName) && (!data.city || key(st.city) === key(data.city)));
    const storeName = data.storeName ?? data.chainName ?? "";
    const k = `${data.date}|${key(storeName)}|${data.startTime}`;
    let duplicate = seen.has(k);
    seen.add(k);
    if (!duplicate && data.date && storeName) duplicate = Boolean(await findDuplicate(scope, { brandId, date: data.date, storeId: match?.id ?? null, storeName, startTime: data.startTime }));
    rows.push({ ...data, line, storeId: match?.id ?? null, issues: rowIssues(data), duplicate });
  }
  return { ok: true, batchId: batch.id, rows, mapped: parsed.mapped, unmapped: parsed.unmapped };
}

/** Passo 2: salva as linhas aprovadas (já corrigidas). Duplicadas e incompletas ficam de fora. */
export async function commitSchedule(scope: Scope, batchId: string, brandId: string, rows: PreviewRow[]): Promise<ActionResult & { created?: number; skipped?: { line: number; reason: string }[] }> {
  if (!canManageTastings(scope)) return { ok: false, error: "Sem permissão." };
  const db = await getDb();
  const [batch] = await db.select().from(s.tastingBatches).where(and(eq(s.tastingBatches.id, batchId), eq(s.tastingBatches.agencyId, scope.agencyId)));
  if (!batch) return { ok: false, error: "Importação não encontrada. Envie o arquivo de novo." };
  let created = 0;
  const skipped: { line: number; reason: string }[] = [];
  for (const r of rows) {
    const blocking = rowIssues(r).filter((x) => BLOCKING.has(x));
    if (blocking.length) {
      skipped.push({ line: r.line, reason: blocking.join(", ") });
      continue;
    }
    const input: TastingInput = {
      brandId,
      storeId: r.storeId,
      chainName: r.chainName,
      storeName: (r.storeName ?? r.chainName)!,
      city: r.city!,
      state: r.state ?? "MG",
      date: r.date!,
      startTime: r.startTime,
      endTime: r.endTime,
      product: r.product,
      description: r.description,
      materialsNote: r.materialsNote,
      notes: r.notes,
      responsibleId: scope.userId,
      orderRef: r.orderRef,
      actionCode: r.actionCode,
      billingTerms: null,
      brandPaymentDue: null,
      tasterPaymentDue: null,
      photoProof: false,
      requiredEvidence: null,
      revenue: r.revenue,
      taxes: null,
      tasterFee: r.tasterFee,
      transport: null,
      food: null,
      materialsCost: null,
      otherCost: null,
    };
    const res = await saveTasting(scope, null, input, { batchId });
    if (res.ok) created++;
    else skipped.push({ line: r.line, reason: res.error });
  }
  await db.update(s.tastingBatches).set({ rowsImported: batch.rowsImported + created }).where(eq(s.tastingBatches.id, batchId));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_batch", batchId, "imported", { after: { created, skipped } });
  return { ok: true, message: `${created} degustação(ões) importada(s).`, created, skipped };
}

export async function listBatches(scope: Scope) {
  const db = await getDb();
  return db
    .select({ b: s.tastingBatches, brandName: s.brands.name, fileName: s.tastingFiles.name, fileId: s.tastingFiles.id })
    .from(s.tastingBatches)
    .leftJoin(s.brands, eq(s.brands.id, s.tastingBatches.brandId))
    .leftJoin(s.tastingFiles, eq(s.tastingFiles.id, s.tastingBatches.fileId))
    .where(eq(s.tastingBatches.agencyId, scope.agencyId))
    .orderBy(s.tastingBatches.createdAt)
    .then((rows) => rows.reverse().slice(0, 30));
}
