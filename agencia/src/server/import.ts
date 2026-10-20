/**
 * Importação de cadastros por planilha (Excel ou CSV): produtos, lojas e
 * promotores. Cabeçalhos comparados sem acento/maiúsculas. Cada linha é
 * validada; o relatório lista exatamente o que deu errado e em qual linha.
 * "Somente validar" percorre tudo sem gravar nada.
 */
import "server-only";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { saveChain, saveProduct, saveStore, saveUser, validateProduct } from "./admin";
import { saveTarget, syncPromoterSchedules } from "./portfolio";
import { parseMoney } from "./tasting-import";
import { importMix, importRoutes, parseWeekdays } from "./import-extra";
import { parseCoords, productNameKey } from "@/lib/rules";
import type { Unit } from "@/lib/domain";

export const TEMPLATES = {
  produtos: ["marca", "nome", "sku", "ean", "categoria", "variante", "embalagem", "unidade", "status"],
  lojas: ["rede", "nome", "codigo", "cnpj", "endereco", "bairro", "cidade", "uf", "marcas", "latitude", "longitude"],
  promotores: ["nome", "usuario", "senha_inicial", "vinculo", "forma_trabalho", "regiao", "codigo_interno", "email", "telefone", "marcas", "lojas"],
  metas: ["promotor", "loja", "marca", "vezes", "periodo", "dias", "valor"],
  mix: ["rede", "mix", "loja", "marca", "sku", "descricao"],
  roteiros: ["promotor", "dias", "loja", "horario", "roteiro"],
} as const;
export type ImportKind = keyof typeof TEMPLATES;

export const TEMPLATE_HELP: Record<ImportKind, string> = {
  produtos: "marca = identificador da marca (ex.: BRAVO). unidade: un (unidade) ou cx (caixa); outros valores viram unidade. status: ativo/inativo (padrão ativo). Produtos são localizados pelo SKU dentro da marca; nomes com grafia diferente do mesmo produto são recusados como duplicados.",
  lojas: "marcas = identificadores separados por vírgula (ex.: BRAVO, SUINCO). A loja é localizada por rede + código (ou rede + nome, se não houver código). latitude/longitude (opcionais) posicionam a loja no mapa operacional.",
  promotores: "vinculo: fixo ou freelancer. marcas = identificadores separados por vírgula. lojas = códigos ou nomes das lojas separados por “;”. A senha inicial deve ser trocada no primeiro acesso. forma_trabalho: roteiro ou carteira (vazio = padrão da agência).",
  mix: "Uma linha por produto. Para o mix de um FORMATO da rede (ex.: ABC VAREJO, PLUS, CASH): preencha rede + mix e deixe loja vazia — quando a rede tem mais de um formato, o promotor escolhe o da loja no primeiro atendimento. Para a lista de UMA loja: preencha loja (código ou nome). marca = identificador; sku = código do produto; descricao é só para conferência.",
  roteiros: "Uma linha por loja do roteiro, na ordem da visita. promotor = usuário; dias = SEG/QUI, TER/SEX, SEG/QUA/SEX…; loja = código ou nome; horario (opcional) = 08:00; roteiro (opcional) = nome — sem nome, um roteiro por promotor + dias. Depois gere a programação em Programação › Gerar a partir dos roteiros.",
  metas: "ATRIBUIÇÕES (planilha padrão): uma linha por promotor × loja × marca. promotor = usuário do promotor; loja = código ou nome da loja; marca = identificador ou nome; vezes = quantas visitas no período; periodo = semana (padrão), quinzena ou mês; dias = dias fixos (ex.: SEG/QUI) — vazio = sem dia fixo, o promotor escolhe e só a quantidade conta. valor (opcional) = VR ATEND: quanto a marca paga à agência por mês por esta loja × marca com a meta cheia (o Financeiro mostra o previsto e o realizado proporcional às visitas feitas). É isso que define a programação, a carteira e as metas. Se a atribuição já existir, é atualizada; a loja e a marca passam a ser autorizadas ao promotor.",
};

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

export async function readTable(file: File): Promise<Record<string, string>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    const text = buf.toString("utf8").replace(/^﻿/, "");
    return Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: norm, delimiter: "" }).data;
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

export async function templateWorkbook(kind: ImportKind): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(kind);
  ws.addRow([...TEMPLATES[kind]]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 20));
  const help = wb.addWorksheet("instrucoes");
  help.addRow([TEMPLATE_HELP[kind]]);
  help.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ImportReport {
  rows: number;
  created: number;
  updated: number;
  errors: { line: number; message: string }[];
  dryRun: boolean;
}

const isActive = (v: string | undefined) => !v || !/^(inativo|inactive|nao|não|0)$/i.test(v.trim());

export async function runImport(scope: Scope, kind: ImportKind, rows: Record<string, string>[], dryRun: boolean): Promise<ImportReport> {
  const report: ImportReport = { rows: rows.length, created: 0, updated: 0, errors: [], dryRun };
  if (rows.length > 5000) {
    report.errors.push({ line: 0, message: "Máximo de 5.000 linhas por arquivo." });
    return report;
  }
  const required: Record<ImportKind, string[]> = { produtos: ["nome", "sku"], lojas: ["nome", "cidade"], promotores: ["nome", "usuario"], metas: ["promotor", "loja", "marca"], mix: ["marca", "sku"], roteiros: ["promotor", "dias", "loja"] };
  const missing = required[kind].filter((h) => rows.length && !(h in rows[0]));
  if (missing.length) {
    report.errors.push({ line: 1, message: `Colunas obrigatórias ausentes: ${missing.join(", ")}. Baixe o modelo.` });
    return report;
  }
  if (kind === "mix") {
    await importMix(scope, rows, report);
    return report;
  }
  if (kind === "roteiros") {
    await importRoutes(scope, rows, report);
    return report;
  }
  const db = await getDb();
  const brands = await db.select().from(s.brands).where(eq(s.brands.agencyId, scope.agencyId));
  const brandByCode = new Map(brands.map((b) => [b.code.toLowerCase(), b]));
  const brandList = (v: string | undefined, line: number) => {
    const ids: string[] = [];
    for (const code of (v ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean)) {
      const b = brandByCode.get(code.toLowerCase()) ?? brands.find((x) => x.name.toLowerCase() === code.toLowerCase());
      if (b) ids.push(b.id);
      else report.errors.push({ line, message: `Marca “${code}” não cadastrada.` });
    }
    return ids;
  };
  const seen = new Set<string>();
  const syncPromoters = new Set<string>();

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const errorsBefore = report.errors.length;
    if (kind === "produtos") {
      const brand = brandByCode.get((r.marca ?? "").toLowerCase()) ?? brands.find((b) => b.name.toLowerCase() === (r.marca ?? "").toLowerCase());
      if (!brand) {
        report.errors.push({ line, message: `Marca “${r.marca ?? ""}” não encontrada.` });
        continue;
      }
      const unit = productUnit(r.unidade);
      const input = { id: null as string | null, brandId: brand.id, name: r.nome ?? "", sku: r.sku ?? "", ean: r.ean || null, category: r.categoria || null, variant: r.variante || null, package: r.embalagem || null, unit, status: (isActive(r.status) ? "active" : "inactive") as "active" | "inactive" };
      const v = validateProduct(input);
      if (v) {
        report.errors.push({ line, message: v });
        continue;
      }
      const key = `${brand.id}:${productNameKey(input.name)}`;
      const skuKey = `${brand.id}:sku:${input.sku.toLowerCase()}`;
      if (seen.has(key) || seen.has(skuKey)) {
        report.errors.push({ line, message: `Produto repetido na planilha (“${input.name}”).` });
        continue;
      }
      seen.add(key);
      seen.add(skuKey);
      const [existing] = await db.select({ id: s.products.id }).from(s.products).where(and(eq(s.products.brandId, brand.id), sql`lower(${s.products.sku}) = ${input.sku.trim().toLowerCase()}`));
      input.id = existing?.id ?? null;
      if (dryRun) {
        if (existing) report.updated++;
        else report.created++;
        continue;
      }
      const res = await saveProduct(scope, input);
      if (!res.ok) report.errors.push({ line, message: res.error });
      else if (existing) report.updated++;
      else report.created++;
    } else if (kind === "lojas") {
      if (!r.nome || !r.cidade) {
        report.errors.push({ line, message: "Nome e cidade são obrigatórios." });
        continue;
      }
      const brandIds = brandList(r.marcas, line);
      if (report.errors.length > errorsBefore) continue;
      let chainId: string | null = null;
      if (r.rede) {
        const [chain] = await db.select().from(s.chains).where(and(eq(s.chains.agencyId, scope.agencyId), sql`lower(${s.chains.name}) = ${r.rede.toLowerCase()}`));
        if (chain) chainId = chain.id;
        else if (!dryRun) {
          await saveChain(scope, null, r.rede, "active");
          const [c] = await db.select().from(s.chains).where(and(eq(s.chains.agencyId, scope.agencyId), sql`lower(${s.chains.name}) = ${r.rede.toLowerCase()}`));
          chainId = c?.id ?? null;
        }
      }
      const [existing] = await db
        .select({ id: s.stores.id })
        .from(s.stores)
        .where(and(eq(s.stores.agencyId, scope.agencyId), chainId ? eq(s.stores.chainId, chainId) : sql`${s.stores.chainId} is null`, r.codigo ? eq(s.stores.code, r.codigo) : sql`lower(${s.stores.name}) = ${r.nome.toLowerCase()}`));
      // Coordenadas opcionais: vazias não apagam as que já existem.
      const coords = r.latitude || r.longitude ? parseCoords(r.latitude ?? "", r.longitude ?? "") : undefined;
      if (coords === "invalid") {
        report.errors.push({ line, message: "Latitude/longitude inválidas (ex.: -19.9245 e -43.9352)." });
        continue;
      }
      if (dryRun) {
        if (r.cnpj && r.cnpj.replace(/\D/g, "").length !== 14) report.errors.push({ line, message: "CNPJ deve ter 14 dígitos." });
        else if (existing) report.updated++;
        else report.created++;
        continue;
      }
      const res = await saveStore(scope, { id: existing?.id ?? null, chainId, name: r.nome, code: r.codigo || null, cnpj: r.cnpj || null, address: r.endereco || null, district: r.bairro || null, city: r.cidade, state: r.uf || "MG", status: "active", brandIds, rules: null, notes: null, coords: coords ?? undefined });
      if (!res.ok) report.errors.push({ line, message: res.error });
      else if (existing) report.updated++;
      else report.created++;
    } else if (kind === "metas") {
      const weekdays = parseWeekdays(r.dias ?? "");
      const rawTimes = (r.vezes ?? r.visitas_semana ?? "").trim();
      const perWeek = rawTimes ? Number(rawTimes.replace(",", ".")) : weekdays.length;
      const per = (r.periodo ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const period = /quinz/.test(per) ? ("fortnight" as const) : /mes|mens/.test(per) ? ("month" as const) : ("week" as const);
      if (!Number.isInteger(perWeek) || perWeek < 1 || perWeek > (period === "month" ? 31 : 14)) {
        report.errors.push({ line, message: `vezes “${rawTimes}” inválido (informe quantas visitas no período, ou os dias).` });
        continue;
      }
      const [promoter] = await db.select({ id: s.users.id, role: s.users.role }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), sql`lower(${s.users.username}) = ${(r.promotor ?? "").trim().toLowerCase()}`));
      if (!promoter || promoter.role !== "promoter") report.errors.push({ line, message: `Promotor “${r.promotor ?? ""}” não encontrado (use o usuário).` });
      const ref = (r.loja ?? "").trim();
      const stores = ref ? await db.select({ id: s.stores.id }).from(s.stores).where(and(eq(s.stores.agencyId, scope.agencyId), sql`(${s.stores.code} = ${ref} or lower(${s.stores.name}) = ${ref.toLowerCase()})`)) : [];
      if (stores.length !== 1) report.errors.push({ line, message: stores.length ? `Loja “${ref}” é ambígua. Use o código.` : `Loja “${ref}” não encontrada.` });
      const brandIds = brandList(r.marca, line);
      if (report.errors.length > errorsBefore || !promoter || brandIds.length !== 1) continue;
      const [prev] = await db.select({ id: s.visitTargets.id }).from(s.visitTargets).where(and(eq(s.visitTargets.promoterId, promoter.id), eq(s.visitTargets.storeId, stores[0].id), eq(s.visitTargets.brandId, brandIds[0])));
      if (dryRun) {
        if (prev) report.updated++;
        else report.created++;
        continue;
      }
      const payValue = parseMoney(r.valor ?? r.vr_atend);
      if (payValue === null && (r.valor ?? "").trim()) {
        report.errors.push({ line, message: `valor “${r.valor}” inválido.` });
        continue;
      }
      const res = await saveTarget(scope, { promoterId: promoter.id, storeId: stores[0].id, brandId: brandIds[0], perWeek, period, weekdays, payValue: payValue ?? undefined }, { sync: false });
      if (res.ok) syncPromoters.add(promoter.id);
      if (!res.ok) report.errors.push({ line, message: res.error });
      else if (prev) report.updated++;
      else report.created++;
    } else {
      if (!r.nome || !r.usuario) {
        report.errors.push({ line, message: "Nome e usuário são obrigatórios." });
        continue;
      }
      const brandIds = brandList(r.marcas, line);
      const storeIds: string[] = [];
      for (const ref of (r.lojas ?? "").split(";").map((x) => x.trim()).filter(Boolean)) {
        const found = await db.select({ id: s.stores.id }).from(s.stores).where(and(eq(s.stores.agencyId, scope.agencyId), sql`(${s.stores.code} = ${ref} or lower(${s.stores.name}) = ${ref.toLowerCase()})`));
        if (found.length === 1) storeIds.push(found[0].id);
        else report.errors.push({ line, message: found.length ? `Loja “${ref}” é ambígua (${found.length} lojas). Use o nome completo.` : `Loja “${ref}” não encontrada.` });
      }
      if (report.errors.length > errorsBefore) continue;
      const [existing] = await db
        .select({ id: s.users.id, role: s.users.role, managerId: s.users.managerId, agencyId: s.users.agencyId, employment: s.users.employment, region: s.users.region })
        .from(s.users)
        .where(sql`lower(${s.users.username}) = ${r.usuario.toLowerCase()}`);
      // Usuário é único no sistema todo (todas as agências usam o mesmo login).
      if (existing && existing.agencyId !== scope.agencyId) {
        report.errors.push({ line, message: `Usuário “${r.usuario}” já está em uso. Escolha outro (ex.: com o prefixo da agência).` });
        continue;
      }
      if (existing && existing.role !== "promoter") {
        report.errors.push({ line, message: `Usuário “${r.usuario}” já existe e não é promotor.` });
        continue;
      }
      if (!existing && !r.senha_inicial) {
        report.errors.push({ line, message: "Senha inicial é obrigatória para novos promotores." });
        continue;
      }
      if (dryRun) {
        if (existing) report.updated++;
        else report.created++;
        continue;
      }
      const res = await saveUser(scope, {
        id: existing?.id ?? null,
        role: "promoter",
        name: r.nome,
        username: r.usuario,
        email: r.email || null,
        phone: r.telefone || null,
        internalCode: r.codigo_interno || null,
        employment: r.vinculo ? (/fixo/i.test(r.vinculo) ? "fixed" : "freelancer") : (existing?.employment ?? "freelancer"),
        region: r.regiao || existing?.region || null,
        managerId: existing?.managerId ?? null,
        status: "active",
        allBrands: true,
        teamOnly: false,
        // Promotor que já existe: coluna vazia = mantém o que ele já tem (a reimportação não apaga lojas).
        brandIds: existing && !r.marcas?.trim() ? undefined : brandIds,
        storeIds: existing && !r.lojas?.trim() ? undefined : storeIds,
        password: r.senha_inicial || null,
        workMode: /carteira/i.test(r.forma_trabalho ?? "") ? "portfolio" : /roteiro/i.test(r.forma_trabalho ?? "") ? "route" : undefined,
      });
      if (!res.ok) report.errors.push({ line, message: res.error });
      else if (existing) report.updated++;
      else report.created++;
    }
  }
  // Atribuições com dias fixos: a programação acompanha de uma vez só, no fim.
  if (syncPromoters.size) await syncPromoterSchedules(scope.agencyId, scope.userId, [...syncPromoters]);
  return report;
}

/** Planilha: "cx", "caixa", "fardo"… vira CAIXA; o resto (un, pct, pacote, vazio) vira UNIDADE. */
function productUnit(raw: string | undefined): Unit {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "cx" || v.startsWith("caixa") || v === "fd" || v.startsWith("fardo") ? "cx" : "un";
}
