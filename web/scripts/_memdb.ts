/** Banco em memória com dados de demonstração — para scripts de inspeção (PDFs, relatórios). */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/server/db/schema";
import { seedDemoIfEmpty } from "../src/server/db/seed";
import type { DB } from "../src/server/db";

export async function memDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  await seedDemoIfEmpty(db);
  (globalThis as { __mcxDb?: Promise<DB> }).__mcxDb = Promise.resolve(db);
  return db;
}
