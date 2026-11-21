/**
 * Importação do Notion (CSV exportado à mão do banco "Projetos e Tarefas").
 * Tudo aqui é puro: lê o CSV, reconhece as colunas e traduz status, prazo,
 * prioridade e cliente. Nada é inventado: o que não for reconhecido volta
 * marcado para a pessoa decidir na pré-visualização.
 */
import type { Priority, Status } from "./domain";
import { isIsoDate } from "./dates";

/** CSV completo (RFC 4180): aspas, aspas dobradas e quebra de linha dentro do campo. Separador , ou ;. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n/) === -1 ? src.length : src.search(/\r?\n/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

/** Sem acento, caixa e pontuação — para comparar nomes. */
export function norm(v: string): string {
  return v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** O Notion exporta relações como "Nome (https://www.notion.so/…)": fica só o nome. Várias vêm separadas por vírgula. */
export function relationNames(cell: string): string[] {
  return cell
    .replace(/\s*\((https?:\/\/[^)]*)\)/g, "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const COLUMN_ALIASES = {
  title: ["nome", "tarefa", "nome da tarefa", "titulo", "name", "projeto", "nome do projeto"],
  status: ["status", "situacao"],
  assignee: ["responsavel", "responsaveis", "pessoa", "atribuido a", "assignee"],
  due: ["data de termino", "termino", "prazo", "data de entrega", "data", "due"],
  client: ["clientes", "cliente"],
  priority: ["prioridade", "priority"],
  description: ["descricao", "observacoes", "notas"],
} as const;
type Column = keyof typeof COLUMN_ALIASES;

export function mapColumns(header: string[]): { index: Partial<Record<Column, number>>; unknown: string[] } {
  const index: Partial<Record<Column, number>> = {};
  const used = new Set<number>();
  for (const col of Object.keys(COLUMN_ALIASES) as Column[]) {
    const at = header.findIndex((h, i) => !used.has(i) && (COLUMN_ALIASES[col] as readonly string[]).includes(norm(h)));
    if (at >= 0) {
      index[col] = at;
      used.add(at);
    }
  }
  return { index, unknown: header.filter((h, i) => !used.has(i) && h) };
}

const STATUS_MAP: Record<string, Status | "skip"> = {
  "nao iniciado": "todo",
  "nao iniciada": "todo",
  "a fazer": "todo",
  pendente: "todo",
  backlog: "todo",
  "not started": "todo",
  "em andamento": "doing",
  "em progresso": "doing",
  fazendo: "doing",
  "in progress": "doing",
  aguardando: "waiting",
  "aguardando retorno": "waiting",
  "aguardando cliente": "waiting",
  "em aprovacao": "approval",
  "em revisao": "approval",
  aprovacao: "approval",
  concluido: "skip",
  concluida: "skip",
  feito: "skip",
  finalizado: "skip",
  finalizada: "skip",
  done: "skip",
  cancelado: "skip",
  cancelada: "skip",
  arquivado: "skip",
  arquivada: "skip",
};

/** Status 1:1. "skip" = concluída/cancelada (fica no Notion). null = status que o sistema não conhece. */
export function mapStatus(value: string): Status | "skip" | null {
  const key = norm(value);
  if (!key) return "todo";
  return STATUS_MAP[key] ?? null;
}

export function mapPriority(value: string): Priority | null {
  const key = norm(value);
  if (!key) return null;
  if (/^(baixa|low)/.test(key)) return "low";
  if (/^(media|medio|normal|medium)/.test(key)) return "medium";
  if (/^(alta|high)/.test(key)) return "high";
  if (/^(urgente|urgent|critica)/.test(key)) return "urgent";
  return null;
}

const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12, january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/**
 * Datas como o Notion exporta: "20 de novembro de 2026", "November 20, 2026",
 * "20/11/2026" ou "2026-11-20". Intervalo ("início → fim") usa o fim. Vazio = null;
 * texto que não é data = undefined (a tela avisa, não inventa prazo).
 */
export function parseNotionDate(value: string): string | null | undefined {
  const raw = value.trim();
  if (!raw) return null;
  const last = raw.split(/\s*(?:→|->)\s*/).pop()!.replace(/\s+\d{1,2}:\d{2}.*$/, "").trim();
  const iso = (y: number, m: number, d: number) => {
    const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return isIsoDate(out) ? out : undefined;
  };
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(last);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(last);
  if (m) return iso(+m[3], +m[2], +m[1]);
  const text = norm(last);
  m = /^(\d{1,2}) de ([a-z]+) de (\d{4})$/.exec(text);
  if (m && MONTHS[m[2]]) return iso(+m[3], MONTHS[m[2]], +m[1]);
  m = /^([a-z]+) (\d{1,2}) (\d{4})$/.exec(text);
  if (m && MONTHS[m[1]]) return iso(+m[3], MONTHS[m[1]], +m[2]);
  return undefined;
}

/**
 * De-para fixo aprovado pelo dono (seção 4.7 e respostas de 20/11/2026).
 * `client` = nome do contratante no Operações; `internal` = vira "Interno MCX".
 */
export const NOTION_CLIENT_MAP: Record<string, { client?: string; brand?: string; internal?: boolean }> = {
  "helvecio cafe": { client: "Helvécio", brand: "Café Bravo" },
  "helvecio barao": { client: "Helvécio", brand: "Barão" },
  "william danper": { client: "Helvécio", brand: "Danper" },
  adriana: { client: "AF Merchandising" },
  mcx: { internal: true },
  maria: { internal: true },
  tainara: { internal: true },
};

export interface NotionRow {
  line: number;
  title: string;
  statusRaw: string;
  status: Status | "skip" | null;
  assigneeRaw: string;
  dueRaw: string;
  dueDate: string | null | undefined;
  clientRaw: string;
  priority: Priority | null;
  description: string;
}

export function readNotionCsv(text: string): { rows: NotionRow[]; unknownColumns: string[]; error?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], unknownColumns: [], error: "O arquivo precisa do cabeçalho e de pelo menos uma linha." };
  const { index, unknown } = mapColumns(table[0]);
  if (index.title === undefined) return { rows: [], unknownColumns: unknown, error: "Não achei a coluna do nome da tarefa (ex.: “Nome”)." };
  const cell = (r: string[], col: Column) => (index[col] === undefined ? "" : (r[index[col]!] ?? ""));
  const rows = table.slice(1).flatMap((r, i): NotionRow[] => {
    const title = cell(r, "title").replace(/\s+/g, " ").trim();
    if (!title) return [];
    const statusRaw = cell(r, "status");
    const dueRaw = cell(r, "due");
    return [{ line: i + 2, title: title.slice(0, 200), statusRaw, status: mapStatus(statusRaw), assigneeRaw: relationNames(cell(r, "assignee")).join(", "), dueRaw, dueDate: parseNotionDate(dueRaw), clientRaw: relationNames(cell(r, "client")).join(", "), priority: mapPriority(cell(r, "priority")), description: cell(r, "description").slice(0, 2000) }];
  });
  return { rows, unknownColumns: unknown };
}
