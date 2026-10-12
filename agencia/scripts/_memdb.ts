/** Banco em memória com dados de demonstração — para testes e scripts de inspeção. */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/server/db/schema";
import { seedDemoIfEmpty } from "../src/server/db/seed";
import type { DB } from "../src/server/db";

export async function memDb(options: { seed?: boolean } = {}): Promise<DB> {
  const db = drizzle(new PGlite(), { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  if (options.seed !== false) await seedDemoIfEmpty(db);
  (globalThis as { __campoDb?: Promise<DB> }).__campoDb = Promise.resolve(db);
  return db;
}
