/**
 * Dados de base, criados uma única vez (idempotente): categorias, "Interno MCX",
 * os contratantes atuais (seção 1 da especificação) e a equipe inicial.
 * Nada aqui é inventado: nomes e marcas vêm da especificação aprovada.
 */
import bcrypt from "bcryptjs";
import { DEFAULT_CATEGORIES, INTERNAL_CLIENT_NAME, type ClientKind, type Role } from "../../lib/domain";
import * as s from "./schema";
import type { DB } from "./index";

const TEAM: { name: string; role: Role }[] = [
  { name: "Eduardo", role: "owner" },
  { name: "Maria", role: "gestor" },
  { name: "Tainara", role: "operacional" },
];

const CLIENTS: { name: string; kind: ClientKind; notes?: string; brands: string[]; contacts: { name: string; role?: string }[] }[] = [
  { name: "Etros Promocional", kind: "agency", notes: "Maior contrato. A MCX atua em white label.", brands: [], contacts: [{ name: "Marcelo" }] },
  { name: "AF Merchandising", kind: "agency", notes: "Fixo de backoffice + app.", brands: [], contacts: [{ name: "Adriana" }] },
  { name: "Helvécio", kind: "rep", brands: ["Café Bravo", "Barão", "Danper"], contacts: [{ name: "Helvécio" }, { name: "William", role: "Danper" }] },
  { name: "Lucas", kind: "rep", brands: ["Amendupã", "Junco", "Brascoco", "Fini", "ZD"], contacts: [{ name: "Lucas" }] },
  { name: "Regis", kind: "rep", brands: ["Papel Fofinho", "Bel Chocolate", "Fralda DTM"], contacts: [{ name: "Regis" }] },
];

export async function ensureBaseData(db: DB): Promise<void> {
  const [anyCategory] = await db.select({ id: s.categories.id }).from(s.categories).limit(1);
  if (!anyCategory) {
    await db.insert(s.categories).values(DEFAULT_CATEGORIES.map((name, position) => ({ name, position })));
  }

  const [anyClient] = await db.select({ id: s.clients.id }).from(s.clients).limit(1);
  if (!anyClient) {
    await db.insert(s.clients).values({ name: INTERNAL_CLIENT_NAME, kind: "internal" });
    for (const c of CLIENTS) {
      const [row] = await db.insert(s.clients).values({ name: c.name, kind: c.kind, notes: c.notes ?? null }).returning({ id: s.clients.id });
      if (c.brands.length) await db.insert(s.clientBrands).values(c.brands.map((name) => ({ clientId: row.id, name })));
      if (c.contacts.length) await db.insert(s.clientContacts).values(c.contacts.map((k) => ({ clientId: row.id, name: k.name, role: k.role ?? null })));
    }
  }

  const [anyUser] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (!anyUser) {
    for (const member of TEAM) {
      const username = member.name.toLowerCase();
      // Senha inicial combinada com o dono (ou OPS_INITIAL_PASSWORD); a troca é obrigatória no primeiro acesso.
      const initial = process.env.OPS_INITIAL_PASSWORD || username;
      await db.insert(s.users).values({ name: member.name, username, role: member.role, passwordHash: await bcrypt.hash(initial, 12), mustChangePassword: true });
    }
  }
}
