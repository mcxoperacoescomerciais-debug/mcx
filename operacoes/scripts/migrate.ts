/**
 * Aplica as migrações (pasta drizzle/) no banco do MCX Operações.
 * TRAVA: recusa rodar se o banco de destino for o do MCX Campo (tabela "visits"),
 * para que uma DATABASE_URL colada errada nunca altere a produção do Campo.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { CAMPO_TABLES, looksLikeCampo } from "./campo-guard";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...) do MCX Operações.");
  const client = postgres(url, { max: 1 });
  try {
    const rows = await client`select table_name from information_schema.tables where table_schema = ${"public"} and table_name in ${client([...CAMPO_TABLES])}`;
    if (looksLikeCampo(rows.map((r) => String(r.table_name)))) {
      throw new Error("PARADO: este banco é o do MCX Campo. O MCX Operações precisa de um banco próprio; nada foi alterado.");
    }
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("Migrações do MCX Operações aplicadas.");
  } finally {
    await client.end();
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
