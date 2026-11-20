/**
 * Dados de base, criados uma única vez (idempotente): categorias, "Interno MCX",
 * os contratantes atuais (seção 1 da especificação) e a equipe inicial.
 * Nada aqui é inventado: nomes e marcas vêm da especificação aprovada.
 */
import bcrypt from "bcryptjs";
import { DEFAULT_STAGES, type StageKey } from "../../lib/crm";
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

/** Tipos por categoria — proposta tirada das tarefas reais (editável em Configurações). */
const TYPES: Record<string, string[]> = {
  Pedidos: ["Digitar pedido", "Cadastrar cliente na indústria", "Problema de NF/boleto"],
  "Roteiro e programação": ["Traçar ou ajustar rota", "Programar visitas", "Remanejar loja", "Alterar dias de atendimento", "Enviar lojas ao promotor", "Lojas sem visita"],
  "Fechamento e financeiro": ["Fechamento mensal", "Conferir planilha de fechamento", "Cobrar NF de promotora", "Dados de pagamento (PIX/CNPJ)"],
  "Relatórios para marcas": ["Relatório periódico da marca", "Acompanhamento (MDias/Book)", "Vídeo de ação", "Preencher planilha do cliente"],
  Degustação: ["Planejar/validar degustações do mês", "Projeção", "Cotação de insumos", "Separar kit"],
  "Promotores e RH": ["Abrir vaga", "Dados para cadastro", "Enviar logins do app", "Treinamento", "Aviso à equipe"],
  "Implantação do app": ["Configurar sistemática", "Cadastrar lojas de marca nova", "Apresentação"],
  "Comercial MCX": ["Prospecção", "Proposta", "Contato com marca"],
  "Interno MCX": ["Conteúdo", "Administração"],
};

type DraftItem = { section?: string; text: string; unit?: string; perAction?: boolean };
/**
 * Modelos iniciais — sempre RASCUNHO, com todos os itens "a validar": são
 * sugestões para a gestora revisar e publicar, nunca listas definitivas.
 */
const DRAFT_TEMPLATES: { name: string; client?: string; category: string; type?: string; doubleCheck?: boolean; items: DraftItem[] }[] = [
  {
    name: "Kit de degustação — saída para outra cidade (Helvécio)",
    client: "Helvécio",
    category: "Degustação",
    type: "Separar kit",
    doubleCheck: true,
    items: [
      { section: "Produtos", text: "Café", unit: "pct", perAction: true },
      { section: "Descartáveis", text: "Copos descartáveis", unit: "un", perAction: true },
      { section: "Descartáveis", text: "Colheres", unit: "un", perAction: true },
      { section: "Descartáveis", text: "Guardanapos", unit: "pct", perAction: true },
      { section: "Equipamentos", text: "Garrafa térmica", unit: "un" },
      { section: "Equipamentos", text: "Mesa ou balcão de degustação", unit: "un" },
      { section: "Equipamentos", text: "Toalha de mesa", unit: "un" },
      { section: "Equipamentos", text: "Display ou banner da marca", unit: "un" },
      { section: "Documentos", text: "Autorização da loja para a ação" },
    ],
  },
  {
    name: "Fechamento mensal",
    category: "Fechamento e financeiro",
    type: "Fechamento mensal",
    items: [{ text: "Conferir visitas realizadas × programadas" }, { text: "Conferir a planilha de fechamento" }, { text: "Cobrar NF das promotoras" }, { text: "Enviar o fechamento ao cliente" }],
  },
  {
    name: "Implantação de cliente novo",
    category: "Implantação do app",
    items: [{ text: "Configurar a sistemática do cliente" }, { text: "Cadastrar marcas e produtos" }, { text: "Cadastrar lojas" }, { text: "Cadastrar promotores e enviar logins" }, { text: "Treinamento da equipe" }, { text: "Apresentação ao cliente" }],
  },
  {
    name: "Cadastro de promotor novo",
    category: "Promotores e RH",
    type: "Dados para cadastro",
    items: [{ text: "Pedir os dados para cadastro" }, { text: "Dados de pagamento (PIX/CNPJ)" }, { text: "Criar o usuário no app" }, { text: "Enviar o login" }, { text: "Treinamento do app" }],
  },
];

/**
 * Modelos de mensagem iniciais — RASCUNHO "a validar". O dono ficou de enviar os
 * textos definitivos; estes só refletem o processo descrito na especificação
 * (abordagem pela dor, demonstração com dados reais, proposta com validade de
 * 10 dias, teste sem taxa de implantação). Nenhum preço ou promessa é inventado.
 */
const DRAFT_MESSAGES: { stage: StageKey; name: string; body: string }[] = [
  { stage: "prospect", name: "Primeiro contato — abordagem pela dor", body: "Olá, {nome}! Tudo bem? Falo da MCX. Trabalhamos com operações de promotoria como a da {empresa} e queria entender como vocês acompanham hoje as visitas e as fotos dos promotores. Posso te mostrar em 10 minutos como fazemos isso?" },
  { stage: "contacted", name: "Follow-up D+3", body: "Oi, {nome}! Passando para saber se você conseguiu ver minha mensagem sobre o acompanhamento dos promotores da {empresa}. Se fizer sentido, te mostro o painel funcionando em uma conversa rápida." },
  { stage: "contacted", name: "Follow-up D+7", body: "{nome}, é meu último contato por agora para não te incomodar. Se o acompanhamento da equipe de campo da {empresa} virar prioridade, é só me chamar por aqui. Abraço!" },
  { stage: "talking", name: "Convite para a demonstração", body: "{nome}, obrigado pelo retorno! Que tal uma demonstração do painel com dados reais de operação? Leva uns 20 minutos. Qual horário fica melhor para você nesta semana?" },
  { stage: "demo", name: "Depois da demonstração", body: "{nome}, obrigado pelo tempo na demonstração! Ficou alguma dúvida sobre {produto}? Se estiver tudo certo, preparo a proposta para a {empresa}." },
  { stage: "proposal", name: "Proposta enviada", body: "{nome}, enviei a proposta de {produto} para a {empresa}. Ela tem validade de 10 dias. Fico à disposição para tirar qualquer dúvida." },
  { stage: "proposal", name: "Proposta perto de vencer", body: "Oi, {nome}! A proposta que enviei para a {empresa} vence nos próximos dias. Quer conversar sobre algum ponto antes de decidir?" },
  { stage: "trial", name: "Acompanhamento do teste", body: "Oi, {nome}! Como está o teste na {empresa}? Lembrando que não há taxa de implantação. Se precisar de ajuste ou de apoio com a equipe, me avise." },
  { stage: "nurture", name: "Retomada", body: "Olá, {nome}! Conversamos há um tempo sobre {produto} para a {empresa}. Queria saber se agora é um bom momento para retomar." },
];

export async function ensureBaseData(db: DB): Promise<void> {
  const [anyStage] = await db.select({ id: s.crmStages.id }).from(s.crmStages).limit(1);
  if (!anyStage) await db.insert(s.crmStages).values(DEFAULT_STAGES.map((st, position) => ({ ...st, position })));
  const [anyMessage] = await db.select({ id: s.messageTemplates.id }).from(s.messageTemplates).limit(1);
  if (!anyMessage) {
    const stages = await db.select().from(s.crmStages);
    await db.insert(s.messageTemplates).values(DRAFT_MESSAGES.map((m) => ({ name: m.name, body: m.body, stageId: stages.find((st) => st.key === m.stage)?.id ?? null, status: "draft" as const, toValidate: true })));
  }

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

  const categories = await db.select().from(s.categories);
  const [anyType] = await db.select({ id: s.demandTypes.id }).from(s.demandTypes).limit(1);
  if (!anyType) {
    for (const [category, names] of Object.entries(TYPES)) {
      const cat = categories.find((c) => c.name === category);
      if (cat) await db.insert(s.demandTypes).values(names.map((name) => ({ categoryId: cat.id, name })));
    }
  }

  const [anyTemplate] = await db.select({ id: s.checklistTemplates.id }).from(s.checklistTemplates).limit(1);
  if (!anyTemplate) {
    const clients = await db.select().from(s.clients);
    const types = await db.select().from(s.demandTypes);
    for (const tpl of DRAFT_TEMPLATES) {
      const cat = categories.find((c) => c.name === tpl.category);
      const [row] = await db
        .insert(s.checklistTemplates)
        .values({ name: tpl.name, status: "draft", doubleCheck: !!tpl.doubleCheck, clientId: clients.find((c) => c.name === tpl.client)?.id ?? null, categoryId: cat?.id ?? null, typeId: types.find((ty) => ty.name === tpl.type && ty.categoryId === cat?.id)?.id ?? null })
        .returning({ id: s.checklistTemplates.id });
      await db.insert(s.checklistTemplateItems).values(tpl.items.map((i, position) => ({ templateId: row.id, version: 1, section: i.section ?? null, text: i.text, unit: i.unit ?? null, perAction: !!i.perAction, toValidate: true, position })));
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
