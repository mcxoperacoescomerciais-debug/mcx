/** Banco em memória para os testes (migrações + dados de base + demonstração). */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/server/db/schema";
import { ensureBaseData } from "../src/server/db/base-data";
import { seedDemoIfEmpty } from "../src/server/db/seed";
import type { DB } from "../src/server/db";

export async function memDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  await ensureBaseData(db);
  await seedDemoIfEmpty(db);
  (globalThis as { __opsDb?: Promise<DB> }).__opsDb = Promise.resolve(db);
  return db;
}
