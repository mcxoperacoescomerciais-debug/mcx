/**
 * Registro de capacidades — a fonte única do "O que posso pedir?".
 * O Manual (e, nas próximas fases, o Assistente e o conector do Claude) lê daqui.
 * tests/capabilities.test.ts falha se existir rota de menu ou action sem
 * registro, ou registro sem 3 exemplos: o manual cresce junto com o sistema.
 */
import type { Role } from "../lib/domain";

export const CAPABILITY_GROUPS = ["Atribuir demanda", "Consultar", "Comercial", "Relatórios", "Documentos", "Configurar"] as const;
export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];
export type Channel = "tela" | "assistente" | "conector";

export interface Capability {
  id: string;
  group: CapabilityGroup;
  title: string;
  description: string;
  /** Três frases em português real, do jeito que a equipe fala. */
  examples: [string, string, string];
  roles: Role[];
  channels: Channel[];
  phase: number;
  /** Data de inclusão (AAAA-MM-DD) — alimenta "Novidades". */
  since: string;
  /** Rotas do menu e server actions que esta capacidade cobre. */
  routes?: string[];
  actions?: string[];
}

const ALL: Role[] = ["owner", "gestor", "operacional"];
const MANAGERS: Role[] = ["owner", "gestor"];

export const CAPABILITIES: Capability[] = [
  {
    id: "demanda.criar",
    group: "Atribuir demanda",
    title: "Registrar uma demanda",
    description: "Botão “+ Demanda”: título, contratante, responsável e prazo em poucos toques.",
    examples: [
      "Coloca para a Tainara digitar o pedido da Fini do Sup. Castro até amanhã",
      "Ajustar a rota de Sete Lagoas da Etros até sexta, prioridade alta",
      "Cobrar a NF da promotora da AF hoje",
    ],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    actions: ["createDemandAction"],
  },
  {
    id: "demanda.fila",
    group: "Consultar",
    title: "Minha fila",
    description: "O que é meu para fazer: atrasadas, hoje, cobrar hoje e próximas.",
    examples: ["O que eu tenho para hoje?", "Quais demandas minhas estão atrasadas?", "Quem eu preciso cobrar hoje?"],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/"],
  },
  {
    id: "demanda.lista",
    group: "Consultar",
    title: "Lista da equipe",
    description: "Todas as demandas com filtros por responsável, contratante, categoria, status, prioridade, atrasadas e aguardando.",
    examples: ["O que está aberto da Etros?", "Quais demandas da Tainara estão atrasadas?", "O que está aguardando retorno?"],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/demandas"],
  },
  {
    id: "demanda.kanban",
    group: "Atribuir demanda",
    title: "Kanban por status",
    description: "Mover a demanda entre A fazer, Em andamento, Aguardando retorno, Em aprovação e Concluído.",
    examples: ["Passa o fechamento do Café Bravo para Em andamento", "Conclui o pedido da Fini", "Coloca a NF da AF em Aguardando retorno da promotora, cobrar na segunda"],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/kanban"],
    actions: ["changeStatusAction"],
  },
  {
    id: "demanda.editar",
    group: "Atribuir demanda",
    title: "Detalhar e acompanhar a demanda",
    description: "Editar prazo, prioridade e descrição, comentar, montar checklist e ver o histórico de quem mudou o quê.",
    examples: ["Muda o prazo da rota de Sete Lagoas para segunda", "Comenta na demanda que o cliente já respondeu", "Adiciona “conferir colheres” no checklist da degustação"],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    actions: ["updateDemandAction", "addCommentAction", "addChecklistItemAction", "toggleChecklistItemAction", "removeChecklistItemAction"],
  },
  {
    id: "demanda.distribuir",
    group: "Atribuir demanda",
    title: "Redistribuir, compartilhar, reabrir e excluir",
    description: "O gestor troca o responsável, compartilha a demanda com outra pessoa, reabre uma concluída e exclui com motivo.",
    examples: ["Passa as demandas de roteiro da Maria para a Tainara", "Compartilha o fechamento da AF com a Tainara", "Reabre a demanda do pedido da Junco"],
    roles: MANAGERS,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    actions: ["setSharesAction", "deleteDemandAction"],
  },
  {
    id: "contratante.cadastro",
    group: "Configurar",
    title: "Contratantes, contatos e marcas",
    description: "Cadastro básico de quem a MCX atende: tipo, contatos e marcas atendidas.",
    examples: ["Quais marcas o Lucas atende?", "Cadastra a marca nova do Regis", "Adiciona o WhatsApp do contato da Etros"],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/contratantes"],
    actions: ["saveClientAction", "addContactAction", "removeContactAction", "addBrandAction", "removeBrandAction"],
  },
  {
    id: "config.categorias",
    group: "Configurar",
    title: "Categorias de demanda",
    description: "O gestor cria, renomeia e desativa as categorias usadas nas demandas.",
    examples: ["Cria a categoria “Estoque de clientes”", "Renomeia “Pedidos” para “Pedidos e cadastros”", "Desativa a categoria que não usamos mais"],
    roles: MANAGERS,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/config/categorias"],
    actions: ["saveCategoryAction", "saveTypeAction"],
  },
  {
    id: "config.usuarios",
    group: "Configurar",
    title: "Equipe e acessos",
    description: "O dono cadastra pessoas, define o papel, desativa o acesso e redefine a senha.",
    examples: ["Cadastra uma pessoa nova no operacional", "Redefine a senha da Tainara", "Desativa o acesso de quem saiu"],
    roles: ["owner"],
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/config/usuarios"],
    actions: ["createUserAction", "updateUserAction"],
  },
  {
    id: "tempo.demanda",
    group: "Atribuir demanda",
    title: "Tempo por demanda",
    description: "Ao concluir, informar quanto tempo levou (obrigatório). Cronômetro opcional e lançamento manual.",
    examples: ["Conclui o pedido da Fini, levou 15 minutos", "Inicia o cronômetro no fechamento do Café Bravo", "Lança 1 hora de ontem na rota de Sete Lagoas"],
    roles: ALL,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    actions: ["startTimerAction", "stopTimerAction", "addTimeEntryAction", "updateTimeEntryAction", "deleteTimeEntryAction"],
  },
  {
    id: "tempo.meu-dia",
    group: "Consultar",
    title: "Meu dia",
    description: "O que o sistema registra sobre você hoje: tempo no sistema, tempo apontado e demandas concluídas. É o mesmo que o gestor vê.",
    examples: ["Quanto tempo eu apontei hoje?", "O que eu concluí hoje?", "O que o sistema mede sobre mim?"],
    roles: ALL,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    routes: ["/meu-dia"],
  },
  {
    id: "painel",
    group: "Consultar",
    title: "Painel inicial",
    description: "Abertas por responsável, atrasadas, cobranças vencidas, sem responsável, concluídas no mês e rotinas geradas hoje.",
    examples: ["Como está a operação hoje?", "Tem demanda sem responsável?", "Quantas demandas concluímos este mês?"],
    roles: ALL,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    routes: ["/painel"],
  },
  {
    id: "equipe.painel",
    group: "Consultar",
    title: "Painel da equipe",
    description: "Por pessoa: tempo no sistema, tempo apontado, concluídas e carga aberta. Redistribuir demandas dali mesmo.",
    examples: ["Como está a carga da Tainara?", "Quem está com demanda atrasada?", "Passa esta demanda da Maria para a Tainara"],
    roles: MANAGERS,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    routes: ["/equipe"],
  },
  {
    id: "relatorios.horas",
    group: "Relatórios",
    title: "Horas, capacidade e margem",
    description: "Horas por contratante, por categoria e tipo, tempo médio por tipo, capacidade semanal e Horas × Receita.",
    examples: ["Com qual contratante gastamos mais tempo este mês?", "Quanto tempo leva, em média, digitar um pedido?", "A equipe está acima de 80% da capacidade?"],
    roles: MANAGERS,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    routes: ["/relatorios"],
  },
  {
    id: "rotinas",
    group: "Configurar",
    title: "Rotinas recorrentes",
    description: "Demandas que nascem sozinhas: semanal, mensal ou a cada N dias, com responsável, prazo e checklist.",
    examples: ["Cria a rotina de fechamento mensal do Barão todo dia 1º", "Gera o relatório semanal toda segunda para a Tainara", "Pausa a rotina de acompanhamento MDias"],
    roles: MANAGERS,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    routes: ["/rotinas"],
    actions: ["saveRoutineAction"],
  },
  {
    id: "checklists.modelos",
    group: "Configurar",
    title: "Modelos de checklist",
    description: "Biblioteca de listas prontas, com seções, quantidades por ação, itens obrigatórios e versões.",
    examples: ["Cria o modelo do kit de degustação do Helvécio", "Adiciona 50 colheres por ação no kit", "Duplica o modelo de fechamento para o Regis"],
    roles: MANAGERS,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    actions: ["saveTemplateAction", "duplicateTemplateAction", "saveAsTemplateAction", "addMissToTemplateAction"],
  },
  {
    id: "checklists.uso",
    group: "Atribuir demanda",
    title: "Checklist na demanda",
    description: "Aplicar um modelo (multiplicando pelo nº de ações), marcar “não se aplica”, conferir em dupla e registrar “Faltou algo”.",
    examples: ["Aplica o kit de degustação para 3 ações", "Marca a garrafa térmica como não se aplica", "Faltaram as colheres na degustação de Itaúna"],
    roles: ALL,
    channels: ["tela"],
    phase: 2,
    since: "2026-11-20",
    routes: ["/checklists"],
    actions: ["applyTemplateAction", "setItemNotApplicableAction", "verifyItemAction", "reportMissAction"],
  },
  {
    id: "manual",
    group: "Consultar",
    title: "Manual — o que posso pedir?",
    description: "Esta página: o que o sistema faz hoje, com exemplos, e o que ainda não faz.",
    examples: ["O que dá para fazer no sistema?", "O que posso pedir para a Tainara?", "O que entrou de novo este mês?"],
    roles: ALL,
    channels: ["tela"],
    phase: 1,
    since: "2026-11-20",
    routes: ["/manual"],
  },
];

/** "Ainda não dá para…" por grupo — para ninguém pedir o que não existe. */
export const LIMITS: Partial<Record<CapabilityGroup, string[]>> = {
  "Atribuir demanda": ["anexar arquivos à demanda (Fase 5)", "anexar foto da conferência do kit (Fase 5)", "criar demandas conversando com o Claude (Fase 8)"],
  Consultar: ["receber avisos por WhatsApp ou e-mail"],
  Comercial: ["cadastrar leads e follow-ups (Fase 3)"],
  Relatórios: ["exportar em PDF ou Excel"],
  Documentos: ["guardar contratos e documentos (Fase 5)"],
  Configurar: ["controlar estoque de materiais dos clientes (Fase 4)"],
};

export function capabilitiesFor(role: Role): Capability[] {
  return CAPABILITIES.filter((c) => c.roles.includes(role));
}
