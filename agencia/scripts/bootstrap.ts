/**
 * Implantação em produção (idempotente, roda a cada deploy):
 *  1. garante a agência interna da plataforma (MCX);
 *  2. garante o administrador da plataforma (ADMIN_USERNAME): se o usuário já
 *     existe em uma agência cliente (instalações anteriores), ele é movido para
 *     a MCX — os registros que ele fez continuam na agência onde foram feitos;
 *  3. se AGENCY_NAME vier definido e não houver nenhuma agência cliente, cria-a
 *     (as demais agências são criadas pela tela MCX → Agências).
 * Nenhum dado de demonstração.
 *
 *   DATABASE_URL=postgres://... ADMIN_USERNAME=admin ADMIN_NAME="Nome" ADMIN_PASSWORD='senha-forte' npm run db:bootstrap
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../src/server/db/schema";

const PLATFORM_NAME = process.env.PLATFORM_NAME?.trim() || "MCX";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...).");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client, { schema: s });

  let [platform] = await db.select().from(s.agencies).where(eq(s.agencies.kind, "platform")).limit(1);
  if (!platform) {
    [platform] = await db.insert(s.agencies).values({ name: PLATFORM_NAME, slug: "mcx-plataforma", kind: "platform" }).returning();
    console.log(`Plataforma criada: ${platform.name}`);
  }

  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  if (username) {
    const [user] = await db.select().from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
    if (user && (!user.platform || user.agencyId !== platform.id)) {
      await db.update(s.users).set({ platform: true, role: "admin", agencyId: platform.id, managerId: null, updatedAt: new Date() }).where(eq(s.users.id, user.id));
      await db.delete(s.userBrands).where(eq(s.userBrands.userId, user.id));
      await db.delete(s.userStores).where(eq(s.userStores.userId, user.id));
      console.log(`Usuário ${username} agora é da equipe ${platform.name} (vê todas as agências).`);
    } else if (!user) {
      const password = process.env.ADMIN_PASSWORD ?? "";
      if (!password) throw new Error("Defina ADMIN_PASSWORD para criar o administrador da plataforma.");
      await db.insert(s.users).values({
        agencyId: platform.id,
        role: "admin",
        platform: true,
        name: process.env.ADMIN_NAME?.trim() || "Administrador",
        username,
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: true,
      });
      console.log(`Administrador da plataforma criado: ${username} (troca de senha exigida no primeiro acesso).`);
    }

    // Recuperação de acesso: com ADMIN_RESET_PASSWORD definido, a senha do
    // ADMIN_USERNAME passa a ser essa (desbloqueia e encerra as sessões abertas).
    // Remova a variável depois de entrar — a cada deploy a senha seria redefinida.
    const reset = process.env.ADMIN_RESET_PASSWORD ?? "";
    if (reset) {
      const [target] = await db.select().from(s.users).where(sql`lower(${s.users.username}) = ${username}`);
      if (target) {
        await db
          .update(s.users)
          .set({
            passwordHash: await bcrypt.hash(reset, 12),
            mustChangePassword: false,
            failedLogins: 0,
            lockedUntil: null,
            status: "active",
            sessionVersion: target.sessionVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(s.users.id, target.id));
        await db.insert(s.auditLogs).values({ agencyId: target.agencyId, userId: null, entity: "user", entityId: target.id, action: "password_reset_bootstrap", reason: "ADMIN_RESET_PASSWORD no deploy" });
        console.log(`Senha de ${username} redefinida por ADMIN_RESET_PASSWORD. Remova essa variável no Render.`);
      }
    }
  }

  const [client1] = await db.select({ id: s.agencies.id }).from(s.agencies).where(and(eq(s.agencies.kind, "client"))).limit(1);
  const agencyName = process.env.AGENCY_NAME?.trim();
  if (!client1 && agencyName) {
    const slug = agencyName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agencia";
    await db.insert(s.agencies).values({ name: agencyName, slug, kind: "client" });
    console.log(`Agência criada: ${agencyName}`);
  }
  await client.end();
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
