/**
 * Conexão com o banco do MCX Operações (nunca o do MCX Campo).
 * - Produção: DATABASE_URL=postgres://... (projeto Supabase próprio).
 * - Desenvolvimento: sem DATABASE_URL (ou pglite:./caminho) usa PGlite em disco,
 *   aplica as migrações e cria dados de demonstração.
 */
import "server-only";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

type GlobalWithDb = typeof globalThis & { __opsDb?: Promise<DB> };
const g = globalThis as GlobalWithDb;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function openPglite(dataDir: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  rmSync(path.join(dataDir, "postmaster.pid"), { force: true });
  const client = new PGlite(dataDir);
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    const close = () => void client.close().finally(() => process.exit(0));
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.once(signal, close);
    return db as unknown as DB;
  } catch (err) {
    void client.close().catch(() => {});
    throw err;
  }
}

async function createPgliteDb(dataDir: string): Promise<DB> {
  mkdirSync(path.dirname(dataDir), { recursive: true });
  let db: DB;
  try {
    db = await openPglite(dataDir);
  } catch (err) {
    const backup = `${dataDir}-danificado-${Date.now()}`;
    console.error(`[db] Banco local não abriu (${(err as Error).message}). Cópia movida para ${backup}; criando um novo.`);
    renameSync(dataDir, backup);
    db = await openPglite(dataDir);
  }
  const { ensureBaseData } = await import("./base-data");
  const { seedDemoIfEmpty } = await import("./seed");
  await ensureBaseData(db);
  await seedDemoIfEmpty(db);
  return db;
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 5) });
    return drizzlePostgres(client, { schema });
  }
  if (process.env.NODE_ENV === "production" && !url.startsWith("pglite:")) {
    throw new Error("DATABASE_URL não configurado. Informe a URL do Postgres do MCX Operações.");
  }
  const dataDir = url.startsWith("pglite:") ? url.slice("pglite:".length) : "./.data/pglite";
  return createPgliteDb(path.resolve(dataDir));
}

/** Instância única por processo (sobrevive ao hot-reload do next dev). */
export function getDb(): Promise<DB> {
  if (!g.__opsDb) {
    g.__opsDb = connect().catch((err) => {
      g.__opsDb = undefined;
      throw err;
    });
  }
  return g.__opsDb;
}

export { schema };
