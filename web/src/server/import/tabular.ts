/**
 * Importação de cadastros por planilha (Excel ou CSV): lojas e promotores.
 * Os cabeçalhos são comparados sem acento e sem maiúsculas, então
 * "Código", "codigo" e "CÓDIGO" funcionam igual.
 */
import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "../db";
import type { Scope } from "../auth";
import { saveNetwork, saveStore, saveUser } from "../admin";
import { STORE_FORMAT_LABEL, type StoreFormat } from "@/lib/domain";

export const TEMPLATES = {
  lojas: ["rede", "formato", "nome", "codigo", "cidade", "uf", "endereco", "promotor_usuario", "latitude", "longitude"],
  promotores: ["nome", "usuario", "senha_inicial", "telefone", "email", "cpf"],
} as const;
export type ImportKind = keyof typeof TEMPLATES;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_");

export async function readTable(file: File): Promise<Record<string, string>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: norm, delimiter: "" });
    return parsed.data;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((c, i) => (headers[i] = norm(String(c.text ?? ""))));
  const rows: Record<string, string>[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const obj: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = String(row.getCell(i).text ?? "").trim();
      obj[h] = v;
      if (v) any = true;
    });
    if (any) rows.push(obj);
  }
  return rows;
}

export interface ImportReport {
  created: number;
  updated: number;
  errors: string[];
}

export async function importStores(scope: Scope, rows: Record<string, string>[]): Promise<ImportReport> {
  const db = await getDb();
  const report: ImportReport = { created: 0, updated: 0, errors: [] };
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    if (!r.rede || !r.nome || !r.cidade) {
      report.errors.push(`Linha ${line}: rede, nome e cidade são obrigatórios.`);
      continue;
    }
    let [net] = await db.select({ id: s.networks.id }).from(s.networks).where(and(eq(s.networks.clientId, scope.clientId), sql`lower(${s.networks.name}) = ${r.rede.toLowerCase()}`));
    if (!net) {
      const created = await saveNetwork(scope, { name: r.rede });
      if (!created.ok) {
        report.errors.push(`Linha ${line}: ${created.error}`);
        continue;
      }
      net = { id: created.id! };
    }
    const format = norm(r.formato ?? "varejo") as StoreFormat;
    const conds = [eq(s.stores.clientId, scope.clientId), eq(s.stores.networkId, net.id)];
    const [existing] = await db
      .select({ id: s.stores.id })
      .from(s.stores)
      .where(and(...conds, r.codigo ? eq(s.stores.code, r.codigo) : sql`lower(${s.stores.name}) = ${r.nome.toLowerCase()}`));
    let promoterId: string | null | undefined = undefined;
    if (r.promotor_usuario) {
      const [p] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.tenantId, scope.tenantId), sql`lower(${s.users.username}) = ${r.promotor_usuario.toLowerCase()}`));
      if (p) promoterId = p.id;
      else report.errors.push(`Linha ${line}: promotor "${r.promotor_usuario}" não encontrado (loja importada sem promotor).`);
    }
    const lat = Number((r.latitude ?? "").replace(",", "."));
    const lng = Number((r.longitude ?? "").replace(",", "."));
    const res = await saveStore(scope, {
      id: existing?.id,
      networkId: net.id,
      format: format in STORE_FORMAT_LABEL ? format : "varejo",
      name: r.nome,
      code: r.codigo || null,
      city: r.cidade,
      state: r.uf || "MG",
      address: r.endereco || null,
      lat: r.latitude && Number.isFinite(lat) ? lat : null,
      lng: r.longitude && Number.isFinite(lng) ? lng : null,
      status: "active",
      promoterId,
    });
    if (!res.ok) report.errors.push(`Linha ${line}: ${res.error}`);
    else if (existing) report.updated++;
    else report.created++;
  }
  return report;
}

export async function importPromoters(scope: Scope, rows: Record<string, string>[]): Promise<ImportReport> {
  const db = await getDb();
  const report: ImportReport = { created: 0, updated: 0, errors: [] };
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const username = (r.usuario ?? "").toLowerCase();
    const [existing] = username ? await db.select({ id: s.users.id }).from(s.users).where(sql`lower(${s.users.username}) = ${username}`) : [];
    const res = await saveUser(scope, {
      id: existing?.id,
      name: r.nome ?? "",
      username,
      role: "promoter",
      phone: r.telefone,
      email: r.email,
      document: r.cpf,
      status: "active",
      password: r.senha_inicial || null,
    });
    if (!res.ok) report.errors.push(`Linha ${line}: ${res.error}`);
    else if (existing) report.updated++;
    else report.created++;
  }
  return report;
}
