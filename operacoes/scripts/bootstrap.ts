/** Produção: garante os dados de base (categorias, contratantes atuais, equipe inicial). Idempotente. */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/server/db/schema";
import { ensureBaseData } from "../src/server/db/base-data";
import type { DB } from "../src/server/db";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...) do MCX Operações.");
  const client = postgres(url, { max: 1, prepare: false });
  try {
    await ensureBaseData(drizzle(client, { schema }) as unknown as DB);
    console.log("Dados de base conferidos.");
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
