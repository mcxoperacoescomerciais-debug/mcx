/**
 * Demandas de demonstração — SÓ no banco embutido de desenvolvimento/teste.
 * Nunca roda em produção (o bootstrap de produção chama apenas ensureBaseData).
 */
import { eq } from "drizzle-orm";
import { companyKey, phoneDigits, potentialValue } from "../../lib/crm";
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

  // Leads de demonstração (nomes fictícios, claramente de exemplo).
  const stages = await db.select().from(s.crmStages);
  const stage = (key: string) => stages.find((st) => st.key === key)!;
  const demo: { company: string; type: string; city: string; stage: string; products: string[]; promoters?: number; next: string; nextIn: number; contact: string; phone: string; contacted?: number; responded?: boolean; proposal?: number }[] = [
    { company: "Agência Exemplo Alfa", type: "Agência de promotoria", city: "Belo Horizonte", stage: "prospect", products: ["App"], promoters: 30, next: "Fazer o primeiro contato", nextIn: 0, contact: "Contato Alfa", phone: "31900000001" },
    { company: "Agência Exemplo Beta", type: "Agência de promotoria", city: "Contagem", stage: "contacted", products: ["App", "Backoffice"], promoters: 15, next: "Follow-up D+3", nextIn: -1, contact: "Contato Beta", phone: "31900000002", contacted: -4 },
    { company: "Agência Exemplo Gama", type: "Agência de ativação/promoções", city: "Divinópolis", stage: "talking", products: ["Degustação"], next: "Agendar a demonstração", nextIn: 0, contact: "Contato Gama", phone: "37900000003", contacted: -6, responded: true },
    { company: "Marca Exemplo Delta", type: "Marca/Indústria", city: "Betim", stage: "proposal", products: ["App"], promoters: 60, next: "Cobrar retorno da proposta", nextIn: 2, contact: "Contato Delta", phone: "31900000004", contacted: -15, responded: true, proposal: -8 },
  ];
  for (const d of demo) {
    const st = stage(d.stage);
    const at = (days: number) => new Date(Date.now() + days * 86_400_000);
    const potential = potentialValue(d.products, d.promoters, null).cents;
    const [lead] = await db
      .insert(s.leads)
      .values({
        company: d.company,
        companyKey: companyKey(d.company),
        type: d.type,
        city: d.city,
        source: "Prospecção ativa",
        dataSource: "Exemplo de demonstração",
        products: d.products,
        promoters: d.promoters ?? null,
        potentialCents: potential,
        ownerId: user("eduardo").id,
        stageId: st.id,
        nextAction: d.next,
        nextActionDate: addDays(today, d.nextIn),
        firstContactAt: d.contacted === undefined ? null : at(d.contacted),
        respondedAt: d.responded ? at((d.contacted ?? 0) + 1) : null,
        proposalValueCents: d.proposal === undefined ? null : potential,
        proposalDate: d.proposal === undefined ? null : addDays(today, d.proposal),
        proposalValidUntil: d.proposal === undefined ? null : addDays(today, d.proposal + 10),
        createdBy: user("eduardo").id,
      })
      .returning({ id: s.leads.id });
    await db.insert(s.leadContacts).values({ leadId: lead.id, name: d.contact, whatsapp: d.phone, whatsappDigits: phoneDigits(d.phone), isPrimary: true });
    for (const st2 of stages.filter((x) => x.kind === "open" && x.position <= st.position)) await db.insert(s.leadStageHistory).values({ leadId: lead.id, toStageId: st2.id, userId: user("eduardo").id });
  }

  // Estoque de demonstração (quantidades fictícias, só no banco embutido).
  const helvecio = client("Helvécio");
  const maria = user("maria");
  const stockDemo: { name: string; category: "product" | "disposable" | "equipment"; unit: string; min: number; expiry?: boolean; moves?: { delta: number; day: number; kind: "in" | "out"; counterpart: string; city?: string; lot?: string; expires?: number }[]; units?: string[] }[] = [
    { name: "Café (exemplo)", category: "product", unit: "pct", min: 10, expiry: true, moves: [{ delta: 20, day: -20, kind: "in", counterpart: "Recebido do cliente", lot: "L1", expires: 20 }, { delta: 12, day: -5, kind: "in", counterpart: "Recebido do cliente", lot: "L2", expires: 150 }, { delta: -8, day: -3, kind: "out", counterpart: "Degustação de exemplo", city: "Itaúna", lot: "L1", expires: 20 }] },
    { name: "Copos descartáveis (exemplo)", category: "disposable", unit: "un", min: 500, moves: [{ delta: 600, day: -20, kind: "in", counterpart: "Recebido do cliente" }, { delta: -300, day: -3, kind: "out", counterpart: "Degustação de exemplo", city: "Itaúna" }] },
    { name: "Colheres (exemplo)", category: "disposable", unit: "un", min: 200, moves: [{ delta: 1000, day: -20, kind: "in", counterpart: "Recebido do cliente" }] },
    { name: "Garrafa térmica (exemplo)", category: "equipment", unit: "un", min: 0, units: ["Garrafa térmica 1", "Garrafa térmica 2"] },
  ];
  for (const d of stockDemo) {
    const [item] = await db.insert(s.stockItems).values({ clientId: helvecio.id, name: d.name, category: d.category, unit: d.unit, minQuantity: d.min, tracksExpiry: !!d.expiry, location: "Escritório — prateleira de exemplo" }).returning({ id: s.stockItems.id });
    for (const m of d.moves ?? []) await db.insert(s.stockMovements).values({ itemId: item.id, kind: m.kind, delta: m.delta, day: addDays(today, m.day), counterpart: m.counterpart, city: m.city ?? null, lot: m.lot ?? null, expiresOn: m.expires === undefined ? null : addDays(today, m.expires), userId: maria.id });
    for (const label of d.units ?? []) await db.insert(s.stockUnits).values({ itemId: item.id, label });
  }
}
