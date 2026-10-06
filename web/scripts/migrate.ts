/**
 * Aplica as migrações SQL (pasta drizzle/) no banco de produção.
 *   DATABASE_URL=postgres://... npm run db:migrate
 * Use a URL de conexão DIRETA do Supabase (porta 5432), não a do pooler.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...).");
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migrações aplicadas.");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
