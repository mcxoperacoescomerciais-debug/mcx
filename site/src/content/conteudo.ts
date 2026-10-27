/**
 * Textos das seções do site. Edite aqui para mudar o conteúdo sem mexer no layout.
 * Os ícones são nomes do pacote lucide-react, mapeados em src/components/Icone.tsx.
 */
import type { NomeIcone } from "@/components/Icone";

export const navegacao = [
  { id: "inicio", rotulo: "Início" },
  { id: "sobre", rotulo: "Sobre a MCX" },
  { id: "solucoes", rotulo: "Soluções" },
  { id: "como-funciona", rotulo: "Como funciona" },
  { id: "contato", rotulo: "Contato" },
] as const;

export const hero = {
  titulo: "Um braço a mais para a sua empresa funcionar melhor.",
  subtitulo:
    "A MCX assume rotinas de operação, administrativas e financeiras e desenvolve sistemas sob medida, para empresas de qualquer área que preferem terceirizar o suporte e focar no próprio negócio.",
  botaoPrincipal: "Fale com a MCX pelo WhatsApp",
  botaoSecundario: "Conheça nossas soluções",
};

export const sobre = {
  titulo: "Soluções que acompanham a realidade da sua empresa.",
  paragrafos: [
    "A MCX Operações Comerciais funciona como um braço das empresas que a contratam: terceirizamos rotinas de suporte à operação, administrativas e financeiras, com acompanhamento, registro e comunicação clara.",
    "Nosso trabalho parte da compreensão das necessidades de cada negócio para estruturar soluções compatíveis com sua realidade e seus objetivos.",
  ],
  frentes: [
    {
      icone: "Users",
      titulo: "Suporte à operação e promotoria",
      texto: "Acompanhamento das equipes de campo, controle de rotas, ocorrências e materiais e organização das informações do varejo.",
    },
    {
      icone: "Briefcase",
      titulo: "Administrativo e financeiro",
      texto: "Apoio às rotinas internas, documentos, pagamentos, recebimentos e interface com a contabilidade.",
    },
    {
      icone: "CodeXml",
      titulo: "Tecnologia",
      texto: "Criação de sistemas personalizados, aplicativos e painéis feitos para a rotina de cada empresa.",
    },
  ] satisfies { icone: NomeIcone; titulo: string; texto: string }[],
};

export type Solucao = { icone: NomeIcone; titulo: string; descricao: string };

export type GrupoSolucoes = {
  rotulo: string;
  titulo: string;
  descricao: string;
  solucoes: Solucao[];
  /** Painel ilustrativo opcional ao lado dos cartões (sem dados reais). */
  painel?: { rotulo: string; titulo: string; itens: { icone: NomeIcone; titulo: string; detalhe: string }[] };
};

export const grupoOperacoes: GrupoSolucoes = {
  rotulo: "Frente 1",
  titulo: "Suporte à operação",
  descricao:
    "Para agências de promotoria e empresas com equipes de campo. A execução no ponto de venda fica com os promotores; a MCX cuida do acompanhamento e da gestão.",
  solucoes: [
    {
      icone: "Route",
      titulo: "Acompanhamento remoto de rotas",
      descricao:
        "Acompanhamento das rotas e dos atendimentos previstos, conferência de fotos e relatórios enviados e cobrança do que estiver pendente.",
    },
    {
      icone: "UserCog",
      titulo: "Gestão administrativa dos promotores",
      descricao:
        "Cadastro atualizado, registro de faltas, atrasos, ocorrências e mudanças de rota, com resumo periódico do acompanhamento.",
    },
    {
      icone: "Shirt",
      titulo: "Controle de materiais e equipamentos",
      descricao:
        "Uniformes, celulares, chips e EPIs: entrega, devolução e reposição por colaborador, com termos de recebimento organizados.",
    },
    {
      icone: "ClipboardCheck",
      titulo: "Relatórios operacionais",
      descricao:
        "Organização das informações de campo em resumos claros para a agência e para as indústrias atendidas.",
    },
  ],
  painel: {
    rotulo: "Para agências de promotoria",
    titulo: "Acompanhamento",
    itens: [
      { icone: "MapPin", titulo: "Roteiro de visitas", detalhe: "Rotas e atendimentos previstos" },
      { icone: "Camera", titulo: "Fotos e relatórios", detalhe: "Conferidos a cada atendimento" },
      { icone: "TriangleAlert", titulo: "Ocorrências", detalhe: "Faltas, atrasos e mudanças de rota" },
      { icone: "Shirt", titulo: "Materiais e equipamentos", detalhe: "Uniformes, celulares e EPIs" },
      { icone: "ChartColumn", titulo: "Resumo periódico", detalhe: "Acompanhamento apresentado à agência" },
    ],
  },
};

export const grupoAdministrativo: GrupoSolucoes = {
  rotulo: "Frente 2",
  titulo: "Administrativo e financeiro",
  descricao: "Para empresas que precisam de apoio nas rotinas de gestão e controle.",
  solucoes: [
    {
      icone: "Calculator",
      titulo: "Pessoal e contabilidade",
      descricao:
        "Documentos de admissões e desligamentos, envio de faltas, férias e atestados, conferência da folha recebida da contabilidade e acompanhamento de prazos.",
    },
    {
      icone: "Receipt",
      titulo: "Notas fiscais e contas a receber",
      descricao:
        "Conferência das notas, controle de vencimentos e conciliação de cada recebimento no extrato, com registro de valores em aberto ou divergentes.",
    },
    {
      icone: "Wallet",
      titulo: "Contas a pagar",
      descricao:
        "Controle de boletos e vencimentos, conferência antes de pagar e pagamentos pela conta da empresa, conforme as aprovações e limites definidos.",
    },
    {
      icone: "FolderOpen",
      titulo: "Controle financeiro e documentos",
      descricao:
        "Fluxo de caixa previsto e realizado, relatório mensal e arquivos organizados para a empresa e para a contabilidade.",
    },
  ],
};

export const grupoTecnologia: GrupoSolucoes = {
  rotulo: "Frente 3",
  titulo: "Tecnologia",
  descricao: "Para empresas que precisam de um sistema feito para a própria rotina, e não o contrário.",
  solucoes: [
    {
      icone: "Blocks",
      titulo: "Sistemas personalizados",
      descricao:
        "Desenvolvimento de sistemas sob medida, a partir do levantamento dos processos e das necessidades da empresa.",
    },
    {
      icone: "MonitorSmartphone",
      titulo: "Aplicativos para equipes",
      descricao:
        "Aplicativos para registrar atividades, fotos e informações no dia a dia das equipes, inclusive em campo.",
    },
    {
      icone: "LayoutDashboard",
      titulo: "Painéis e relatórios",
      descricao:
        "Painéis para acompanhar indicadores e pendências da operação, com as informações reunidas em um só lugar.",
    },
    {
      icone: "Workflow",
      titulo: "Automação de rotinas",
      descricao:
        "Automação de tarefas repetitivas e organização de planilhas e importações de dados para reduzir o trabalho manual.",
    },
  ],
};

export const gruposSolucoes = [grupoOperacoes, grupoAdministrativo, grupoTecnologia];

export const avisoEscopo =
  "As soluções podem ser contratadas de forma independente ou combinada. O escopo de cada trabalho é definido de acordo com as necessidades da empresa e com o que for contratado.";

export const perfis = [
  {
    icone: "Route",
    titulo: "Agências de promotoria",
    texto:
      "Agências que precisam de apoio para acompanhar promotores, rotas, ocorrências e materiais, sem montar uma equipe interna para isso.",
  },
  {
    icone: "Building2",
    titulo: "Empresas de qualquer área",
    texto: "Negócios que preferem terceirizar rotinas de suporte e manter a equipe focada na atividade principal.",
  },
  {
    icone: "Landmark",
    titulo: "Empresas que precisam de suporte administrativo e financeiro",
    texto:
      "Negócios que desejam organizar rotinas, documentos, pagamentos, recebimentos e processos de apoio à gestão.",
  },
  {
    icone: "CodeXml",
    titulo: "Empresas que precisam de um sistema próprio",
    texto:
      "Organizações que controlam a rotina em planilhas ou mensagens e precisam de uma ferramenta feita para a sua operação.",
  },
] satisfies { icone: NomeIcone; titulo: string; texto: string }[];

export const diferenciais = {
  titulo: "Organização que faz parte da operação.",
  texto:
    "Mais do que executar tarefas, a MCX trabalha para que cada atividade tenha acompanhamento, registro e uma comunicação clara com quem contrata.",
  itens: [
    { icone: "Eye", titulo: "Acompanhamento das atividades" },
    { icone: "LayoutList", titulo: "Organização de processos e informações" },
    { icone: "MessagesSquare", titulo: "Comunicação clara" },
    { icone: "SlidersHorizontal", titulo: "Controles adequados à realidade do negócio" },
    { icone: "Handshake", titulo: "Suporte alinhado às necessidades do cliente" },
    { icone: "Workflow", titulo: "Estruturação de rotinas operacionais e administrativas" },
  ] satisfies { icone: NomeIcone; titulo: string }[],
};

export const etapas = [
  {
    icone: "Search",
    titulo: "Entendimento da necessidade",
    texto: "Conhecemos a empresa, sua operação e os desafios que precisam ser resolvidos.",
  },
  {
    icone: "ListChecks",
    titulo: "Levantamento das demandas",
    texto: "Identificamos os processos, controles e atividades que precisam de acompanhamento ou suporte.",
  },
  {
    icone: "FileText",
    titulo: "Definição do escopo",
    texto: "Estruturamos uma proposta de acordo com as necessidades e as responsabilidades contratadas.",
  },
  {
    icone: "CircleCheck",
    titulo: "Execução e acompanhamento",
    texto: "Realizamos as atividades definidas e organizamos o acompanhamento das entregas previstas.",
  },
] satisfies { icone: NomeIcone; titulo: string; texto: string }[];

export const conversao = {
  titulo: "Vamos conversar sobre a sua operação?",
  texto:
    "Conte para a MCX quais são as necessidades da sua empresa. Vamos entender sua demanda e avaliar como podemos contribuir.",
  botao: "Conversar com a MCX",
};

/** Opções do campo "Serviço de interesse" do formulário. */
export const opcoesInteresse = [
  ...gruposSolucoes.flatMap((g) => g.solucoes.map((s) => s.titulo)),
  "Ainda não sei / quero uma avaliação",
];
