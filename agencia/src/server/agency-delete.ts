/**
 * Exclusão definitiva de uma agência cliente (equipe MCX, com o nome digitado
 * para confirmar). Apaga tudo o que é dela: cadastros, usuários, visitas,
 * atendimentos, degustações, financeiro, histórico — e os arquivos (fotos).
 *
 * "Limpar dados" usa o mesmo caminho, mas mantém a agência (nome, logo,
 * configurações, módulos), o financeiro (despesas fixas) e o log de auditoria:
 * serve para recomeçar a carga de cadastros do zero.
 *
 * As tabelas e ligações são lidas do próprio banco: uma tabela nova com
 * `agency_id` (ou ligada a uma que tenha) entra sem mudar este código. Linhas
 * de outras agências que só apontam para algo desta (campo opcional) ficam com
 * o campo vazio. Tudo numa transação: se algo não puder ser apagado, nada é.
 */
import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { SessionUser } from "./auth";
import { audit } from "./audit";
import { storage } from "./storage";

export type DeleteResult = { ok: true; message: string; rows: number; files: number } | { ok: false; error: string };

interface Fk {
  child: string;
  col: string;
  parent: string;
  pcol: string;
  nullable: boolean;
}

/** Tabelas mantidas ao limpar os dados (a agência em si também fica). */
const KEEP_ON_CLEAR = new Set(["audit_logs", "fixed_expenses"]);

type Tx = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
type TxWithSavepoint = Tx & { transaction: <T>(fn: (sp: Tx) => Promise<T>) => Promise<T> };

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function rows<T>(tx: Tx, query: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await tx.execute(query)) as unknown;
  return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
}

/** Mapa "linha desta agência" montado a partir das chaves estrangeiras do banco. */
async function ownership(tx: Tx, id: string) {
  const lit = `'${id}'::uuid`;
  const fks = await rows<{ child: string; col: string; parent: string; pcol: string; nullable: string }>(
    tx,
    sql`select kcu.table_name as child, kcu.column_name as col, ccu.table_name as parent, ccu.column_name as pcol, c.is_nullable as nullable
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
        join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
        join information_schema.columns c on c.table_schema = kcu.table_schema and c.table_name = kcu.table_name and c.column_name = kcu.column_name
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`,
  );
  const graph: Fk[] = fks.map((f) => ({ ...f, nullable: f.nullable === "YES" }));
  const withAgency = new Set(
    (await rows<{ t: string }>(tx, sql`select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'agency_id'`)).map((r) => r.t),
  );
  const tables = new Set([...withAgency, ...graph.map((f) => f.child), ...graph.map((f) => f.parent)]);

  // "Linha desta agência": tem agency_id = a agência, ou (tabela sem agency_id) aponta para uma linha dela.
  const owned = (table: string, depth = 0): string | null => {
    if (table === "agencies") return `id = ${lit}`;
    if (withAgency.has(table)) return `agency_id = ${lit}`;
    if (depth > 3) return null;
    const parts = graph
      .filter((f) => f.child === table && f.parent !== table)
      .map((f) => {
        const p = owned(f.parent, depth + 1);
        return p ? `${q(f.col)} in (select ${q(f.pcol)} from ${q(f.parent)} where ${p})` : null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(" or ") : null;
  };
  return { graph, tables, owned };
}

/** Apaga tudo o que é da agência (menos `keep` e a própria agência); devolve linhas apagadas e arquivos. */
async function wipe(tx: TxWithSavepoint, id: string, keep: Set<string>) {
  const { graph, tables, owned } = await ownership(tx, id);

  // Arquivos guardados (fotos e anexos) antes de apagar as linhas que os indicam.
  const files: string[] = [];
  const fileCols = await rows<{ t: string; c: string }>(
    tx,
    sql`select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' and column_name in ('storage_key', 'thumb_key')`,
  );
  for (const { t, c } of fileCols) {
    if (keep.has(t)) continue;
    const where = owned(t);
    if (!where) continue;
    const keys = await rows<{ k: string | null }>(tx, sql.raw(`select ${q(c)} as k from ${q(t)} where ${where}`));
    for (const k of keys) if (k.k) files.push(k.k);
  }

  // Outras agências que só apontam para algo desta (campo opcional): o campo fica vazio.
  for (const f of graph) {
    if (!f.nullable || f.parent === "agencies") continue;
    const parentOwned = owned(f.parent);
    const childOwned = owned(f.child);
    if (!parentOwned) continue;
    await tx.execute(
      sql.raw(`update ${q(f.child)} set ${q(f.col)} = null where ${q(f.col)} in (select ${q(f.pcol)} from ${q(f.parent)} where ${parentOwned})${childOwned ? ` and not (${childOwned})` : ""}`),
    );
  }

  // Apaga em passadas: o que ainda tem dependentes fica para a próxima (savepoint desfaz só a tentativa).
  const pending = new Map<string, string>();
  for (const t of tables) {
    if (t === "agencies" || keep.has(t)) continue;
    const where = owned(t);
    if (where) pending.set(t, where);
  }
  let deleted = 0;
  for (let pass = 0; pending.size && pass < 60; pass++) {
    let progress = false;
    for (const [t, where] of [...pending]) {
      try {
        // Transação aninhada = savepoint: se a tabela ainda tiver dependentes, desfaz só esta tentativa.
        const n = await tx.transaction(async (sp) => (await rows<{ n: number }>(sp, sql.raw(`with d as (delete from ${q(t)} where ${where} returning 1) select count(*)::int as n from d`)))[0]?.n ?? 0);
        deleted += n;
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
}

/** Arquivos depois do commit (falha aqui não desfaz nada; só deixa arquivo sobrando). */
async function removeFiles(files: string[]): Promise<number> {
  try {
    return await storage().remove(files);
  } catch (err) {
    console.error("[agencia] arquivos não removidos:", (err as Error).message);
    return 0;
  }
}

async function checkTarget(user: SessionUser, id: string, confirmName: string) {
  if (!user.platform) return { ok: false, error: "Somente a equipe MCX." } as const;
  if (user.agencyId === id) return { ok: false, error: "A agência da equipe MCX não pode ser alterada aqui." } as const;
  const db = await getDb();
  const [agency] = await db.select({ id: s.agencies.id, name: s.agencies.name, kind: s.agencies.kind }).from(s.agencies).where(eq(s.agencies.id, id));
  if (!agency || agency.kind !== "client") return { ok: false, error: "Agência não encontrada." } as const;
  if (confirmName.trim().toLowerCase() !== agency.name.trim().toLowerCase()) return { ok: false, error: `Para confirmar, digite exatamente o nome da agência: ${agency.name}` } as const;
  return { ok: true, db, agency } as const;
}

export async function deleteAgency(user: SessionUser, id: string, confirmName: string): Promise<DeleteResult> {
  const t = await checkTarget(user, id, confirmName);
  if (!t.ok) return { ok: false, error: t.error };
  const { db, agency } = t;
  const result = await db.transaction(async (tx) => {
    const r = await wipe(tx as unknown as TxWithSavepoint, id, new Set());
    await tx.delete(s.agencies).where(eq(s.agencies.id, id));
    return { deleted: r.deleted + 1, files: r.files };
  });
  const removed = await removeFiles(result.files);
  await audit({ agencyId: user.agencyId, userId: user.id }, "agency", id, "deleted", { before: { name: agency.name }, after: { rows: result.deleted, files: removed } });
  return { ok: true, message: `Agência ${agency.name} excluída.`, rows: result.deleted, files: removed };
}

/**
 * Limpa os dados e mantém a agência: apaga usuários (todos os perfis), marcas,
 * produtos, mix, lojas, redes, parceiros, roteiros, metas, programação,
 * visitas, atendimentos, fotos, degustações e sugestões. Ficam o nome, a logo,
 * as configurações, o financeiro e o log de auditoria.
 */
export async function clearAgencyData(user: SessionUser, id: string, confirmName: string): Promise<DeleteResult> {
  const t = await checkTarget(user, id, confirmName);
  if (!t.ok) return { ok: false, error: t.error };
  const { db, agency } = t;
  const result = await db.transaction(async (tx) => wipe(tx as unknown as TxWithSavepoint, id, KEEP_ON_CLEAR));
  const removed = await removeFiles(result.files);
  await audit({ agencyId: id, userId: user.id }, "agency", id, "data_cleared", { before: { name: agency.name }, after: { rows: result.deleted, files: removed } });
  return {
    ok: true,
    message: `Dados da ${agency.name} apagados: ${result.deleted} registros e ${removed} arquivos. A agência continua cadastrada.`,
    rows: result.deleted,
    files: removed,
  };
}

/** Quantos registros desta agência cada tabela tem (o que "Limpar dados" apagaria). */
export async function agencyDataCounts(id: string): Promise<{ table: string; n: number }[]> {
  const db = (await getDb()) as unknown as Tx;
  const { tables, owned } = await ownership(db, id);
  const out: { table: string; n: number }[] = [];
  for (const t of [...tables].sort()) {
    if (t === "agencies" || KEEP_ON_CLEAR.has(t)) continue;
    const where = owned(t);
    if (!where) continue;
    const [r] = await rows<{ n: number }>(db, sql.raw(`select count(*)::int as n from ${q(t)} where ${where}`));
    if (r?.n) out.push({ table: t, n: r.n });
  }
  return out;
}
