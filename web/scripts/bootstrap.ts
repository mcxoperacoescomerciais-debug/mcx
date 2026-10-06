/**
 * Implantação inicial em produção (rodar UMA vez, depois do db:migrate):
 * cria a agência (tenant), o cliente SUINCO, as redes, o catálogo/mix real
 * (src/server/db/catalog-suinco.json) e o primeiro administrador.
 *
 *   DATABASE_URL=postgres://... ADMIN_USERNAME=eduardo ADMIN_NAME="Eduardo Sampaio" \
 *   ADMIN_PASSWORD='senha-forte' npm run db:bootstrap
 *
 * Idempotente: roda a cada inicialização no Render (npm run start:render) e só
 * cria o que ainda não existe.
 * Lojas e promotores entram depois pelo painel (Importar planilha).
 */
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as s from "../src/server/db/schema";
import { applyMix, type MixPayload } from "../src/server/import/apply-mix";
import { DEFAULT_SETTINGS } from "../src/lib/settings";
import type { DB } from "../src/server/db";
import catalog from "../src/server/db/catalog-suinco.json";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) throw new Error("Defina DATABASE_URL (postgres://...).");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema: s }) as unknown as DB;

  let [tenant] = await db.select().from(s.tenants).where(eq(s.tenants.slug, "af"));
  if (!tenant) [tenant] = await db.insert(s.tenants).values({ name: "AF Merchandising", slug: "af" }).returning();
  let [clientRow] = await db.select().from(s.clients).where(eq(s.clients.slug, "suinco"));
  if (!clientRow) {
    [clientRow] = await db.insert(s.clients).values({ tenantId: tenant.id, name: "SUINCO", slug: "suinco" }).returning();
    await db.insert(s.clientSettings).values({ clientId: clientRow.id, settings: DEFAULT_SETTINGS });
  }

  for (const [networkName, payload] of Object.entries(catalog as Record<string, MixPayload>)) {
    let [net] = await db.select().from(s.networks).where(eq(s.networks.name, networkName));
    if (!net) [net] = await db.insert(s.networks).values({ tenantId: tenant.id, clientId: clientRow.id, name: networkName }).returning();
    // Roda a cada inicialização do servidor: o catálogo inicial só entra se a rede
    // ainda não tiver mix — nunca sobrescreve o que foi importado pelo painel.
    const [hasMix] = await db.select({ id: s.productMixes.productId }).from(s.productMixes).where(eq(s.productMixes.networkId, net.id)).limit(1);
    if (hasMix) continue;
    const r = await applyMix(db, { tenantId: tenant.id, clientId: clientRow.id, networkId: net.id }, payload);
    console.log(`${networkName}: ${r.productsCreated} produtos novos, ${r.mixRows} itens de mix.`);
  }

  const username = process.env.ADMIN_USERNAME?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    if (password.length < 8) throw new Error("ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.");
    const [existing] = await db.select().from(s.users).where(eq(s.users.username, username));
    if (!existing) {
      const [admin] = await db
        .insert(s.users)
        .values({ tenantId: tenant.id, role: "admin", name: process.env.ADMIN_NAME ?? username, username, passwordHash: await bcrypt.hash(password, 12) })
        .returning();
      await db.insert(s.userClients).values({ userId: admin.id, clientId: clientRow.id });
      console.log(`Administrador "${username}" criado.`);
    } else {
      console.log(`Administrador "${username}" já existe (senha não alterada).`);
    }
  }
  await ensurePhotoBucket();
  await client.end();
}

/** Cria o bucket PRIVADO de fotos no Supabase Storage, se ainda não existir. */
async function ensurePhotoBucket() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_BUCKET ?? "occurrence-photos";
  if (!url || !key) {
    console.warn("SUPABASE_URL/SUPABASE_SERVICE_KEY não configurados: as fotos não serão guardadas de forma permanente.");
    return;
  }
  const headers = { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" };
  const exists = await fetch(`${url}/storage/v1/bucket/${bucket}`, { headers });
  if (exists.ok) return;
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 6 * 1024 * 1024 }),
  });
  if (!res.ok) throw new Error(`Não foi possível criar o bucket de fotos (${res.status}): ${await res.text()}`);
  console.log(`Bucket privado "${bucket}" criado.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
