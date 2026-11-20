/**
 * Demandas de demonstração — SÓ no banco embutido de desenvolvimento/teste.
 * Nunca roda em produção (o bootstrap de produção chama apenas ensureBaseData).
 */
import { eq } from "drizzle-orm";
import { addDays, todayIso } from "../../lib/dates";
import type { Priority, Status } from "../../lib/domain";
import * as s from "./schema";
import type { DB } from "./index";

export async function seedDemoIfEmpty(db: DB): Promise<void> {
  const [any] = await db.select({ id: s.demands.id }).from(s.demands).limit(1);
  if (any) return;
  const users = await db.select().from(s.users);
  const clients = await db.select().from(s.clients);
  const categories = await db.select().from(s.categories);
  const user = (name: string) => users.find((u) => u.username === name)!;
  const client = (name: string) => clients.find((c) => c.name.startsWith(name))!;
  const category = (name: string) => categories.find((c) => c.name.startsWith(name))!;
  // Demonstração: a equipe já entra sem troca de senha obrigatória.
  await db.update(s.users).set({ mustChangePassword: false }).where(eq(s.users.mustChangePassword, true));

  const today = todayIso();
  const rows: { title: string; client: string; category: string; assignee: string; status?: Status; priority?: Priority; due: number | null; waitingFor?: string; followUp?: number }[] = [
    { title: "Ajustar rota de Sete Lagoas", client: "Etros", category: "Roteiro", assignee: "tainara", priority: "high", due: -1 },
    { title: "Digitar pedido Fini — Sup. Castro", client: "Lucas", category: "Pedidos", assignee: "tainara", due: 0 },
    { title: "Fechamento mensal Café Bravo", client: "Helvécio", category: "Fechamento", assignee: "maria", status: "doing", due: 3 },
    { title: "Cobrar NF da promotora", client: "AF", category: "Fechamento", assignee: "maria", status: "waiting", due: 5, waitingFor: "Promotora", followUp: 0 },
    { title: "Enviar logins do app aos promotores novos", client: "AF", category: "Promotores", assignee: "tainara", due: 2 },
    { title: "Proposta para agência de BH", client: "Interno", category: "Comercial", assignee: "eduardo", priority: "urgent", due: 1 },
    { title: "Planejar degustações do mês", client: "Helvécio", category: "Degustação", assignee: "maria", status: "approval", due: 6 },
    { title: "Organizar modelos de planilha", client: "Interno", category: "Interno", assignee: "eduardo", priority: "low", due: null },
  ];
  for (const r of rows) {
    await db.insert(s.demands).values({
      title: r.title,
      clientId: client(r.client).id,
      categoryId: category(r.category).id,
      assigneeId: user(r.assignee).id,
      status: r.status ?? "todo",
      priority: r.priority ?? "medium",
      dueDate: r.due === null ? null : addDays(today, r.due),
      waitingFor: r.waitingFor ?? null,
      followUpDate: r.followUp === undefined ? null : addDays(today, r.followUp),
      createdBy: user("maria").id,
    });
  }
}
