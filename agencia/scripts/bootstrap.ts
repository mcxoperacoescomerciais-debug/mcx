/**
 * Implantação inicial em produção (idempotente): cria a agência e o primeiro
 * administrador se ainda não existirem. Nenhum dado de demonstração.
 *
 *   DATABASE_URL=postgres://... AGENCY_NAME="AF Merchandising" \
 *   ADMIN_USERNAME=admin ADMIN_NAME="Nome" ADMIN_PASSWORD='senha-forte' npm run db:bootstrap
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as s from "../src/server/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...).");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema: s });
  let [agency] = await db.select().from(s.agencies).limit(1);
  if (!agency) {
    const name = process.env.AGENCY_NAME?.trim() || "Agência";
    [agency] = await db.insert(s.agencies).values({ name, slug: name.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agencia" }).returning();
    console.log(`Agência criada: ${agency.name}`);
  }
  const [admin] = await db.select().from(s.users).where(eq(s.users.role, "admin")).limit(1);
  if (!admin) {
    const username = process.env.ADMIN_USERNAME?.trim();
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!username || password.length < 10) throw new Error("Defina ADMIN_USERNAME e ADMIN_PASSWORD (mínimo 10 caracteres) para criar o primeiro administrador.");
    await db.insert(s.users).values({ agencyId: agency.id, role: "admin", name: process.env.ADMIN_NAME?.trim() || "Administrador", username, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true });
    console.log(`Administrador criado: ${username} (troca de senha exigida no primeiro acesso).`);
  } else {
    console.log("Administrador já existe — nada a fazer.");
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
