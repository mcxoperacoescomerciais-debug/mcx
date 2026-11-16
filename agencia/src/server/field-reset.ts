/**
 * Início da operação (equipe MCX): apaga o histórico de campo de uma agência
 * ANTES de uma data — visitas, atendimentos, fotos (arquivos também), rupturas,
 * validades, avarias, ocorrências, alertas… e a programação desses dias.
 *
 * Serve para tirar os testes e o treinamento: a partir da data, o promotor
 * começa com tudo a fazer e nada fica como "não realizado" antes dela.
 * Cadastros (lojas, marcas, produtos, mix, usuários, atribuições, roteiros)
 * não mudam; a programação da data em diante também não.
 *
 * O que depende de visitas, atendimentos e programação é lido das chaves
 * estrangeiras do banco: uma tabela nova ligada a eles entra sem mudar este
 * código. Tudo numa transação.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { SessionUser } from "./auth";
import { audit } from "./audit";
import { storage } from "./storage";

type Tx = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
type TxWithSavepoint = Tx & { transaction: <T>(fn: (sp: Tx) => Promise<T>) => Promise<T> };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

async function rows<T>(tx: Tx, query: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await tx.execute(query)) as unknown;
  return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
}

/** Tabela → condição das linhas que saem (visitas e programação antes da data, e o que depende delas). */
async function plan(tx: Tx, agencyId: string, before: string) {
  if (!UUID.test(agencyId) || !ISO.test(before)) throw new Error("Agência ou data inválida.");
  const fks = await rows<{ child: string; col: string; parent: string; pcol: string; nullable: string }>(
    tx,
    sql`select kcu.table_name as child, kcu.column_name as col, ccu.table_name as parent, ccu.column_name as pcol, c.is_nullable as nullable
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
        join information_schema.columns c on c.table_schema = kcu.table_schema and c.table_name = kcu.table_name and c.column_name = kcu.column_name
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
  );
  const lit = `'${agencyId}'::uuid`;
  const day = `'${before}'::date`;
  const del = new Map<string, string[]>([
    ["visits", [`agency_id = ${lit} and visit_date < ${day}`]],
    ["schedules", [`agency_id = ${lit} and date < ${day}`]],
  ]);
  const where = (t: string) => del.get(t)!.map((c) => `(${c})`).join(" or ");
  /** Ligações opcionais que ficam vazias (a linha de cima sai, a de baixo fica). */
  const nullify: { child: string; col: string; parent: string; pcol: string }[] = [];
  // Desce pelas chaves: obrigatória → a linha sai junto; opcional → o campo fica vazio.
  for (let depth = 0; depth < 6; depth++) {
    let grew = false;
    for (const f of fks) {
      if (!del.has(f.parent) || f.child === f.parent) continue;
      if (f.nullable === "YES") {
        if (!nullify.some((n) => n.child === f.child && n.col === f.col)) nullify.push(f);
        continue;
      }
      const cond = `${q(f.col)} in (select ${q(f.pcol)} from ${q(f.parent)} where ${"${" + f.parent + "}"})`;
      const list = del.get(f.child) ?? [];
      if (!list.includes(cond)) {
        list.push(cond);
        del.set(f.child, list);
        grew = true;
      }
    }
    if (!grew) break;
  }
  // Resolve as referências "${tabela}" (até 6 níveis).
  const resolved = new Map<string, string>();
  const resolve = (t: string, depth = 0): string => {
    if (resolved.has(t)) return resolved.get(t)!;
    if (depth > 8) throw new Error("Ligações demais entre tabelas.");
    const out = where(t).replace(/\$\{(\w+)\}/g, (_, p: string) => resolve(p, depth + 1));
    resolved.set(t, out);
    return out;
  };
  for (const t of del.keys()) resolve(t);
  return { tables: resolved, nullify };
}

export interface FieldHistoryCounts {
  visits: number;
  attendances: number;
  photos: number;
  schedules: number;
  total: number;
}

/** O que "Início da operação" apagaria com esta data. */
export async function fieldHistoryCounts(agencyId: string, before: string): Promise<FieldHistoryCounts> {
  const db = (await getDb()) as unknown as Tx;
  const { tables } = await plan(db, agencyId, before);
  const count = async (t: string) => (await rows<{ n: number }>(db, sql.raw(`select count(*)::int as n from ${q(t)} where ${tables.get(t)}`)))[0]?.n ?? 0;
  let total = 0;
  const by: Record<string, number> = {};
  for (const t of tables.keys()) {
    by[t] = await count(t);
    total += by[t];
  }
  return { visits: by.visits ?? 0, attendances: by.attendances ?? 0, photos: by.photos ?? 0, schedules: by.schedules ?? 0, total };
}

export type FieldResetResult = { ok: true; message: string; rows: number; files: number } | { ok: false; error: string };

export async function clearFieldHistory(user: SessionUser, agencyId: string, before: string, confirmName: string): Promise<FieldResetResult> {
  if (!user.platform) return { ok: false, error: "Somente a equipe MCX." };
  if (!ISO.test(before)) return { ok: false, error: "Escolha a data de início da operação." };
  const db = await getDb();
  const [agency] = UUID.test(agencyId) ? await db.select({ id: s.agencies.id, name: s.agencies.name, kind: s.agencies.kind }).from(s.agencies).where(eq(s.agencies.id, agencyId)) : [];
  if (!agency || agency.kind !== "client") return { ok: false, error: "Agência não encontrada." };
  if (confirmName.trim().toLowerCase() !== agency.name.trim().toLowerCase()) return { ok: false, error: `Para confirmar, digite exatamente o nome da agência: ${agency.name}` };

  const result = await db.transaction(async (raw) => {
    const tx = raw as unknown as TxWithSavepoint;
    const { tables, nullify } = await plan(tx, agencyId, before);
    // Arquivos (fotos) antes de apagar as linhas que os indicam.
    const files: string[] = [];
    const fileCols = await rows<{ t: string; c: string }>(
      tx,
      sql`select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' and column_name in ('storage_key', 'thumb_key')`,
    );
    for (const { t, c } of fileCols) {
      const w = tables.get(t);
      if (!w) continue;
      for (const k of await rows<{ k: string | null }>(tx, sql.raw(`select ${q(c)} as k from ${q(t)} where ${w}`))) if (k.k) files.push(k.k);
    }
    for (const n of nullify) {
      const w = tables.get(n.parent)!;
      const keep = tables.get(n.child);
      await tx.execute(sql.raw(`update ${q(n.child)} set ${q(n.col)} = null where ${q(n.col)} in (select ${q(n.pcol)} from ${q(n.parent)} where ${w})${keep ? ` and not (${keep})` : ""}`));
    }
    // Em passadas: o que ainda tem dependentes fica para a próxima (savepoint desfaz só a tentativa).
    const pending = new Map(tables);
    let deleted = 0;
    for (let pass = 0; pending.size && pass < 30; pass++) {
      let progress = false;
      for (const [t, w] of [...pending]) {
        try {
          deleted += await tx.transaction(async (sp) => (await rows<{ n: number }>(sp, sql.raw(`with d as (delete from ${q(t)} where ${w} returning 1) select count(*)::int as n from d`)))[0]?.n ?? 0);
          pending.delete(t);
          progress = true;
        } catch {
          // tenta de novo na próxima passada
        }
      }
      if (!progress) break;
    }
    if (pending.size) throw new Error(`Não foi possível apagar: ${[...pending.keys()].join(", ")}`);
    return { deleted, files };
  });

  let removed = 0;
  try {
    removed = result.files.length ? await storage().remove(result.files) : 0;
  } catch (err) {
    console.error("[agencia] arquivos não removidos:", (err as Error).message);
  }
  await audit({ agencyId, userId: user.id }, "agency", agencyId, "field_history_cleared", { after: { before, rows: result.deleted, files: removed } });
  const [y, m, d] = before.split("-");
  return {
    ok: true,
    message: `Histórico de campo da ${agency.name} antes de ${d}/${m}/${y} apagado: ${result.deleted} registros e ${removed} arquivos. A operação conta a partir de ${d}/${m}/${y}.`,
    rows: result.deleted,
    files: removed,
  };
}
