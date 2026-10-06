/**
 * Conexão com o banco.
 *
 * - Produção: `DATABASE_URL=postgres://...` (Supabase). Use a URL do *pooler*
 *   (porta 6543, modo transação) em ambiente serverless — por isso `prepare: false`.
 * - Desenvolvimento: sem `DATABASE_URL` (ou `pglite:./caminho`), usa PGlite, um
 *   Postgres embutido em WebAssembly gravando em disco. Nada para instalar.
 *   No primeiro acesso aplica as migrações e cria os dados de demonstração.
 *
 * As duas variantes expõem a mesma API do Drizzle; o resto do código não sabe
 * (nem precisa saber) qual está em uso.
 */
import "server-only";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

type GlobalWithDb = typeof globalThis & { __mcxDb?: Promise<DB> };
const g = globalThis as GlobalWithDb;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

const OPEN_TIMEOUT_MS = 30_000;

async function openPglite(dataDir: string): Promise<DB> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // Encerramento abrupto deixa a trava do Postgres para trás. Só este processo
  // usa o banco de desenvolvimento, então a trava é órfã.
  rmSync(path.join(dataDir, "postmaster.pid"), { force: true });
  const client = new PGlite(dataDir);
  const ready = (async () => {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    return db as unknown as DB;
  })();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Banco local não respondeu ao abrir.")), OPEN_TIMEOUT_MS));
  try {
    const db = await Promise.race([ready, timeout]);
    // Fecha o banco direito ao encerrar (Ctrl+C, fechar a janela), evitando corrompê-lo.
    const close = () => void client.close().finally(() => process.exit(0));
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) process.once(signal, close);
    return db;
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
    // O banco embutido é só para desenvolvimento/demonstração. Se ficou
    // danificado (ex.: computador desligado com o sistema aberto), guarda a
    // cópia de lado e recria o banco de demonstração em vez de travar o app.
    const backup = `${dataDir}-danificado-${Date.now()}`;
    console.error(`[db] Banco local não abriu (${(err as Error).message}). Cópia movida para ${backup}; criando um novo.`);
    renameSync(dataDir, backup);
    db = await openPglite(dataDir);
  }
  const { seedDemoIfEmpty } = await import("./seed");
  await seedDemoIfEmpty(db);
  return db;
}

function createPostgresDb(url: string): DB {
  const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return drizzlePostgres(client, { schema });
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return createPostgresDb(url);
  }
  // Em produção, cair no banco embutido por esquecimento perderia tudo a cada
  // reinício do servidor. Só é permitido se pedido explicitamente (pglite:...).
  if (process.env.NODE_ENV === "production" && !url.startsWith("pglite:")) {
    throw new Error("DATABASE_URL não configurado. Informe a URL do Postgres (Supabase).");
  }
  const dataDir = url.startsWith("pglite:") ? url.slice("pglite:".length) : "./.data/pglite";
  return createPgliteDb(path.resolve(dataDir));
}

/** Instância única por processo (sobrevive ao hot-reload do `next dev`). */
export function getDb(): Promise<DB> {
  if (!g.__mcxDb) {
    g.__mcxDb = connect().catch((err) => {
      g.__mcxDb = undefined;
      throw err;
    });
  }
  return g.__mcxDb;
}

export { schema };
