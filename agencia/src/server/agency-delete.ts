/**
 * Exclusão definitiva de uma agência cliente (equipe MCX, com o nome digitado
 * para confirmar). Apaga tudo o que é dela: cadastros, usuários, visitas,
 * atendimentos, degustações, financeiro, histórico — e os arquivos (fotos).
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

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function rows<T>(tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }, query: ReturnType<typeof sql>): Promise<T[]> {
  const r = (await tx.execute(query)) as unknown;
  return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
}

export async function deleteAgency(user: SessionUser, id: string, confirmName: string): Promise<DeleteResult> {
  if (!user.platform) return { ok: false, error: "Somente a equipe MCX." };
  if (user.agencyId === id) return { ok: false, error: "A agência da equipe MCX não pode ser excluída." };
  const db = await getDb();
  const [agency] = await db.select({ id: s.agencies.id, name: s.agencies.name, kind: s.agencies.kind }).from(s.agencies).where(eq(s.agencies.id, id));
  if (!agency || agency.kind !== "client") return { ok: false, error: "Agência não encontrada." };
  if (confirmName.trim().toLowerCase() !== agency.name.trim().toLowerCase()) return { ok: false, error: `Para confirmar, digite exatamente o nome da agência: ${agency.name}` };

  const lit = `'${id}'::uuid`;
  const result = await db.transaction(async (tx) => {
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

    // Arquivos guardados (fotos e anexos) antes de apagar as linhas que os indicam.
    const files: string[] = [];
    const fileCols = await rows<{ t: string; c: string }>(
      tx,
      sql`select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' and column_name in ('storage_key', 'thumb_key')`,
    );
    for (const { t, c } of fileCols) {
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
      if (t === "agencies") continue;
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
    await tx.delete(s.agencies).where(eq(s.agencies.id, id));
    return { deleted: deleted + 1, files };
  });

  // Arquivos depois do commit (falha aqui não volta a agência; só deixa arquivo sobrando).
  let removed = 0;
  try {
    removed = await storage().remove(result.files);
  } catch (err) {
    console.error("[agencia] arquivos não removidos:", (err as Error).message);
  }
  await audit({ agencyId: user.agencyId, userId: user.id }, "agency", id, "deleted", { before: { name: agency.name }, after: { rows: result.deleted, files: removed } });
  return { ok: true, message: `Agência ${agency.name} excluída.`, rows: result.deleted, files: removed };
}
