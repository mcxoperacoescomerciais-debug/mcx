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
  titulo: "Mais organização e eficiência para a sua operação comercial.",
  subtitulo:
    "A MCX Operações Comerciais oferece soluções para apoiar empresas na execução no ponto de venda, no acompanhamento das equipes e na organização dos processos administrativos e financeiros.",
  botaoPrincipal: "Fale com a MCX pelo WhatsApp",
  botaoSecundario: "Conheça nossas soluções",
};

export const sobre = {
  titulo: "Soluções que acompanham a realidade da sua empresa.",
  paragrafos: [
    "A MCX Operações Comerciais atua no suporte às operações comerciais, contribuindo para a organização dos processos, o acompanhamento das atividades de campo e o controle das rotinas operacionais e administrativas.",
    "Nosso trabalho parte da compreensão das necessidades de cada negócio para estruturar soluções compatíveis com sua realidade e seus objetivos.",
  ],
  frentes: [
    {
      icone: "Store",
      titulo: "Operações comerciais e promotoria",
      texto: "Execução no ponto de venda, acompanhamento das equipes de campo e organização das informações do varejo.",
    },
    {
      icone: "Briefcase",
      titulo: "Administrativo e financeiro",
      texto: "Apoio às rotinas internas, documentos, pagamentos, recebimentos e interface com a contabilidade.",
    },
  ] satisfies { icone: NomeIcone; titulo: string; texto: string }[],
};

export type Solucao = { icone: NomeIcone; titulo: string; descricao: string };

export const grupoOperacoes = {
  rotulo: "Frente 1",
  titulo: "Operações comerciais",
  descricao: "Para empresas que precisam acompanhar e organizar a execução no varejo.",
  solucoes: [
    {
      icone: "Store",
      titulo: "Promotoria e execução no ponto de venda",
      descricao:
        "Apoio à execução das atividades de campo, organização das rotinas e acompanhamento das ações realizadas nos pontos de venda.",
    },
    {
      icone: "Users",
      titulo: "Gestão e acompanhamento de equipes",
      descricao:
        "Suporte à organização das equipes, acompanhamento de rotas, registros de visitas e monitoramento das atividades previstas.",
    },
    {
      icone: "Camera",
      titulo: "Informações e pesquisas de varejo",
      descricao:
        "Organização de pesquisas de preços, registros fotográficos e informações coletadas durante as atividades de campo.",
    },
    {
      icone: "ClipboardCheck",
      titulo: "Acompanhamento operacional",
      descricao:
        "Estruturação de controles, acompanhamento de ocorrências e organização de informações para apoiar a gestão da operação.",
    },
  ] satisfies Solucao[],
};

export const grupoAdministrativo = {
  rotulo: "Frente 2",
  titulo: "Administrativo e financeiro",
  descricao: "Para empresas que precisam de apoio nas rotinas de gestão e controle.",
  solucoes: [
    {
      icone: "FolderOpen",
      titulo: "Suporte administrativo",
      descricao:
        "Organização de documentos, acompanhamento de demandas administrativas e apoio aos processos internos.",
    },
    {
      icone: "Receipt",
      titulo: "Controles financeiros",
      descricao:
        "Organização de informações financeiras, conferência de recebimentos, acompanhamento de pagamentos e controles definidos com o cliente.",
    },
    {
      icone: "Package",
      titulo: "Controle de recursos operacionais",
      descricao:
        "Organização e acompanhamento de materiais, uniformes, celulares e outros recursos utilizados pelas equipes, quando previsto no escopo.",
    },
    {
      icone: "Calculator",
      titulo: "Interface com a contabilidade",
      descricao:
        "Apoio na troca de informações e no acompanhamento de demandas com o escritório contábil, respeitando as responsabilidades de cada parte.",
    },
  ] satisfies Solucao[],
};

export const avisoEscopo =
  "As soluções podem ser contratadas de forma independente ou combinada. O escopo de cada trabalho é definido de acordo com as necessidades da empresa e com o que for contratado.";

export const perfis = [
  {
    icone: "Factory",
    titulo: "Indústrias e marcas",
    texto:
      "Empresas que precisam de apoio para acompanhar a execução no varejo, organizar informações e melhorar a visibilidade das atividades realizadas nos pontos de venda.",
  },
  {
    icone: "Route",
    titulo: "Empresas com equipes de campo",
    texto: "Negócios que precisam organizar rotas, acompanhar visitas e estruturar registros e controles operacionais.",
  },
  {
    icone: "Landmark",
    titulo: "Empresas que precisam de suporte administrativo e financeiro",
    texto:
      "Negócios que desejam organizar rotinas, documentos, pagamentos, recebimentos e processos de apoio à gestão.",
  },
  {
    icone: "SlidersHorizontal",
    titulo: "Empresas que buscam soluções personalizadas",
    texto:
      "Organizações que precisam avaliar suas necessidades e definir um escopo de suporte compatível com sua operação.",
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
  ...grupoOperacoes.solucoes.map((s) => s.titulo),
  ...grupoAdministrativo.solucoes.map((s) => s.titulo),
  "Ainda não sei / quero uma avaliação",
];
