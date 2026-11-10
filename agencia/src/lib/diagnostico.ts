/**
 * DIAGNÓSTICO OPERACIONAL — MCX SOLUÇÕES OPERACIONAIS
 *
 * Perguntas, pilares, critérios de pontuação e textos do relatório. O foco é o
 * backoffice da agência: rotinas administrativas, demandas, acompanhamento do
 * campo, equipe, processos e relatórios. Tudo roda no navegador: nenhuma
 * resposta sai do aparelho do visitante.
 *
 * Pontuação
 * - Cada pergunta tem 4 alternativas que valem 0, 1, 2 ou 3 pontos.
 * - Cada pilar vale de 0 a 100 (% dos pontos possíveis nas perguntas dele).
 * - A nota operacional é a média dos seis pilares, de 0 a 10, com uma casa.
 * - Os três gargalos são os três pilares de menor percentual (empate: ordem dos pilares).
 */

export const MARCA = {
  nome: "MCX Soluções Operacionais",
  assinatura: "Organização, eficiência e inteligência para sua operação.",
  /** WhatsApp para o visitante enviar o resultado (DDD + número). */
  whatsapp: "37984103947",
} as const;

export type PilarId = "administrativo" | "demandas" | "campo" | "equipe" | "processos" | "indicadores";

export type Alternativa = { texto: string; pontos: 0 | 1 | 2 | 3 };

export type Pergunta = {
  id: string;
  pilar: PilarId;
  enunciado: string;
  alternativas: Alternativa[];
  /** O que a resposta fraca (0 ou 1 ponto) revela; entra no relatório. */
  achado: string;
};

export type Pilar = {
  id: PilarId;
  nome: string;
  rotulo: string;
  /** Onde a agência perde tempo e dinheiro quando este pilar é fraco. */
  impacto: string;
  recomendacoes: { critico: string[]; intermediario: string[]; avancado: string[] };
  /** Duas ações para o plano de 30 dias, na ordem em que devem acontecer. */
  acoes: [string, string];
};

export const PILARES: Pilar[] = [
  {
    id: "administrativo",
    nome: "Rotinas administrativas",
    rotulo: "Administrativo",
    impacto:
      "Documentos espalhados e tarefas repetitivas consomem as horas do gestor, que deveriam ir para clientes, equipe e crescimento.",
    recomendacoes: {
      critico: [
        "Centralize contratos, documentos de promotores e obrigações em uma pasta digital única, com padrão de nomes.",
        "Liste as tarefas repetitivas da semana e quanto tempo cada uma consome.",
      ],
      intermediario: [
        "Crie um controle de vencimentos (contratos, documentos e exames dos promotores) com alerta antecipado.",
        "Delegue ou automatize as três tarefas repetitivas que mais tomam tempo do gestor.",
      ],
      avancado: ["Transfira o backoffice rotineiro para uma estrutura dedicada e use o tempo liberado para clientes e crescimento."],
    },
    acoes: [
      "Organizar a pasta digital da agência e mapear as tarefas repetitivas com o tempo gasto em cada uma.",
      "Montar o controle de vencimentos e delegar ou automatizar as três tarefas mais pesadas.",
    ],
  },
  {
    id: "demandas",
    nome: "Gestão de demandas",
    rotulo: "Demandas",
    impacto:
      "Pedidos soltos em conversas geram esquecimento, retrabalho e cobrança do cliente — e o gestor vira a central de tudo.",
    recomendacoes: {
      critico: [
        "Defina um canal único para solicitações de clientes e promotores e deixe de aceitar pedidos soltos em conversas paralelas.",
        "Registre cada demanda com responsável e prazo, mesmo que em uma planilha simples.",
      ],
      intermediario: [
        "Revise as demandas abertas em uma conversa curta e diária, priorizando o que vence primeiro.",
        "Organize fotos, planilhas e arquivos por cliente e período, com padrão de nomes, para que qualquer pessoa os encontre.",
      ],
      avancado: ["Meça o tempo de resposta às demandas e use esse dado para dimensionar a equipe de backoffice."],
    },
    acoes: [
      "Escolher o canal único de demandas e registrar tudo o que está aberto hoje, com responsável e prazo.",
      "Implantar a revisão diária das demandas e organizar os arquivos por cliente e período.",
    ],
  },
  {
    id: "campo",
    nome: "Acompanhamento do campo",
    rotulo: "Campo",
    impacto:
      "Sem comprovação e roteiro planejado, visitas não feitas passam despercebidas, o cliente cobra o que não foi entregue e o contrato fica em risco.",
    recomendacoes: {
      critico: [
        "Exija check-in com foto de antes e depois em toda visita, em um canal único e organizado.",
        "Escreva o roteiro de cada promotor: lojas, dias, marcas e frequência combinada com o cliente.",
      ],
      intermediario: [
        "Confira as visitas todos os dias e trate no mesmo dia as lojas que ficaram sem atendimento.",
        "Revise os roteiros pelo resultado: lojas com mais ruptura ou venda recebem mais frequência.",
      ],
      avancado: ["Use os dados de execução no PDV para propor ações aos clientes e ampliar o escopo dos contratos."],
    },
    acoes: [
      "Formalizar o roteiro de cada promotor e padronizar a comprovação de visita (check-in e fotos).",
      "Começar a conferência diária das visitas e o tratamento das lojas não atendidas.",
    ],
  },
  {
    id: "equipe",
    nome: "Equipe e produtividade",
    rotulo: "Equipe",
    impacto:
      "Sem indicadores por promotor e sem plano de cobertura, faltas viram lojas abandonadas e o bom desempenho não é reconhecido.",
    recomendacoes: {
      critico: [
        "Registre a jornada de todos os promotores e defina o mínimo de visitas esperado por dia.",
        "Monte uma lista de cobertura: quem atende cada roteiro quando o titular falta.",
      ],
      intermediario: [
        "Acompanhe visitas realizadas, pontualidade e qualidade das fotos por promotor, toda semana.",
        "Dê retorno individual à equipe com base nos números, reconhecendo quem se destaca.",
      ],
      avancado: ["Vincule o reconhecimento da equipe aos indicadores de execução e à satisfação do cliente."],
    },
    acoes: [
      "Definir as metas mínimas por promotor e montar o plano de cobertura de faltas.",
      "Fazer a primeira reunião de resultados com a equipe, com números individuais.",
    ],
  },
  {
    id: "processos",
    nome: "Processos e padronização",
    rotulo: "Processos",
    impacto:
      "Sem processos padronizados, a agência depende de pessoas-chave, treina mal quem chega e não consegue crescer sem aumentar a desorganização.",
    recomendacoes: {
      critico: [
        "Liste as rotinas que só uma pessoa sabe fazer e comece a documentação por elas.",
        "Crie checklists curtos para as tarefas diárias e semanais do backoffice.",
      ],
      intermediario: [
        "Treine uma segunda pessoa em cada rotina crítica, usando os checklists.",
        "Revise os procedimentos a cada trimestre ou sempre que um cliente novo entrar.",
      ],
      avancado: ["Transforme os procedimentos em um manual de entrada para novos colaboradores e novos clientes."],
    },
    acoes: [
      "Mapear as rotinas críticas do backoffice e quem as executa hoje.",
      "Escrever os checklists das rotinas críticas e treinar uma segunda pessoa em cada uma.",
    ],
  },
  {
    id: "indicadores",
    nome: "Indicadores e relatórios",
    rotulo: "Indicadores",
    impacto:
      "Sem relatório padronizado, o cliente não enxerga o valor entregue, e sem indicadores a agência decide pelo que sente, não pelo que mede.",
    recomendacoes: {
      critico: [
        "Escolha três indicadores para acompanhar todo mês: visitas realizadas, lojas atendidas e ocorrências (ruptura, validade, avaria).",
        "Envie a cada cliente um resumo mensal com as visitas e as principais fotos, sempre na mesma data.",
      ],
      intermediario: [
        "Padronize o relatório ao cliente com indicadores, evolução e ocorrências, em um modelo único.",
        "Inclua produtividade por promotor e tempo de resposta às demandas no painel de decisões da agência.",
      ],
      avancado: ["Transforme o relatório em reunião de resultados com o cliente e proponha melhorias a partir dos dados."],
    },
    acoes: [
      "Definir os indicadores da agência e o modelo de relatório mensal para os clientes.",
      "Enviar o primeiro relatório padronizado e agendar a revisão mensal de indicadores.",
    ],
  },
];

const escala = (a: string, b: string, c: string, d: string): Alternativa[] => [
  { texto: a, pontos: 0 },
  { texto: b, pontos: 1 },
  { texto: c, pontos: 2 },
  { texto: d, pontos: 3 },
];

export const PERGUNTAS: Pergunta[] = [
  {
    id: "documentos",
    pilar: "administrativo",
    enunciado: "Onde ficam contratos, documentos dos promotores e obrigações da agência?",
    alternativas: escala(
      "Espalhados entre e-mail, WhatsApp e papel.",
      "Em pastas, mas sem padrão.",
      "Em uma pasta digital padronizada.",
      "Organizados, com controle de vencimentos e responsáveis.",
    ),
    achado: "Documentos estão dispersos, sem controle de vencimentos — risco trabalhista e contratual.",
  },
  {
    id: "tempo-gestor",
    pilar: "administrativo",
    enunciado: "Quanto do tempo do gestor vai para tarefas administrativas repetitivas?",
    alternativas: escala(
      "Mais da metade da semana.",
      "Cerca de um terço da semana.",
      "Algumas horas por semana.",
      "Pouco; as rotinas estão delegadas ou automatizadas.",
    ),
    achado: "Boa parte da semana do gestor vai para tarefas repetitivas que poderiam ser delegadas.",
  },
  {
    id: "solicitacoes",
    pilar: "demandas",
    enunciado: "Como chegam e são controladas as solicitações de clientes e promotores?",
    alternativas: escala(
      "Pelo WhatsApp de cada um, sem registro.",
      "Em grupos e conversas, e alguém tenta lembrar de tudo.",
      "Registradas em planilha ou lista, com responsável.",
      "Em um canal único, com responsável, prazo e situação.",
    ),
    achado: "Solicitações se perdem em conversas: nada garante que cada demanda tenha dono e prazo.",
  },
  {
    id: "busca-informacao",
    pilar: "demandas",
    enunciado: "Quanto tempo a equipe gasta procurando informações — fotos, planilhas, mensagens antigas?",
    alternativas: escala(
      "Muito; faz parte do dia de todo mundo.",
      "Algumas horas por semana, para cada pessoa.",
      "Pouco; a maior parte está organizada.",
      "Quase nada; tudo fica em um só lugar, fácil de achar.",
    ),
    achado: "A equipe perde horas procurando informações espalhadas em conversas e planilhas.",
  },
  {
    id: "comprovacao",
    pilar: "campo",
    enunciado: "Como você confirma que o promotor esteve na loja e executou o trabalho?",
    alternativas: escala(
      "Confio no que ele informa.",
      "Recebo fotos pelo WhatsApp e confiro quando dá.",
      "Aplicativo ou formulário com check-in e fotos.",
      "Check-in, fotos e checklist conferidos todos os dias.",
    ),
    achado: "A comprovação das visitas é frágil: falhas de execução chegam primeiro ao cliente.",
  },
  {
    id: "roteiro",
    pilar: "campo",
    enunciado: "Como são definidos os roteiros e a frequência de visitas?",
    alternativas: escala(
      "Cada promotor organiza o próprio dia.",
      "O roteiro é combinado verbalmente.",
      "Roteiro escrito, revisado de vez em quando.",
      "Roteiro planejado por loja e marca, ajustado pelo resultado.",
    ),
    achado: "Os roteiros não são planejados: frequência e cobertura das lojas ficam ao acaso.",
  },
  {
    id: "produtividade",
    pilar: "equipe",
    enunciado: "Como são acompanhadas a jornada e a produtividade da equipe?",
    alternativas: escala(
      "Não acompanhamos.",
      "Controle de ponto, sem análise de produtividade.",
      "Ponto e visitas realizadas acompanhados por mês.",
      "Indicadores por promotor toda semana, com retorno à equipe.",
    ),
    achado: "A produtividade da equipe não é medida: não há como separar bom e mau desempenho.",
  },
  {
    id: "cobertura",
    pilar: "equipe",
    enunciado: "Quando um promotor falta ou se desliga, o que acontece?",
    alternativas: escala(
      "As lojas ficam sem atendimento.",
      "Corremos para cobrir, sem plano.",
      "Temos alguém para cobrir na maioria dos casos.",
      "Há cobertura planejada e o cliente nem percebe.",
    ),
    achado: "Não existe plano de cobertura: cada falta vira loja sem atendimento.",
  },
  {
    id: "ausencia",
    pilar: "processos",
    enunciado: "Se a pessoa que cuida do backoffice se ausentar por uma semana, o que acontece?",
    alternativas: escala(
      "Tudo para; só ela sabe fazer.",
      "Alguém tenta cobrir, com muitos erros.",
      "Outra pessoa consegue fazer o essencial.",
      "Nada muda; as rotinas estão documentadas.",
    ),
    achado: "A operação depende de pessoas-chave: uma ausência basta para parar as rotinas.",
  },
  {
    id: "procedimentos",
    pilar: "processos",
    enunciado: "As rotinas da agência estão descritas em procedimentos e checklists?",
    alternativas: escala(
      "Não; cada um faz do seu jeito.",
      "Algumas, apenas na cabeça de quem faz.",
      "As principais estão escritas, mas desatualizadas.",
      "Sim, com checklists atualizados e revisados.",
    ),
    achado: "Sem procedimentos escritos, cada pessoa executa de um jeito e os erros se repetem.",
  },
  {
    id: "prestacao-contas",
    pilar: "indicadores",
    enunciado: "Como a agência presta contas aos clientes (marcas e indústrias)?",
    alternativas: escala(
      "Só quando o cliente pede.",
      "Envio fotos e mensagens soltas.",
      "Relatório mensal montado manualmente.",
      "Relatório padronizado, com indicadores, na data combinada.",
    ),
    achado: "A prestação de contas é informal: o cliente não enxerga o valor do que recebe.",
  },
  {
    id: "indicadores",
    pilar: "indicadores",
    enunciado: "Quais indicadores da operação você acompanha para tomar decisões?",
    alternativas: escala(
      "Nenhum de forma regular.",
      "Apenas o número de visitas.",
      "Visitas realizadas e lojas atendidas.",
      "Execução no PDV, ocorrências, produtividade e resultado por cliente.",
    ),
    achado: "As decisões não se apoiam em indicadores da operação acompanhados com regularidade.",
  },
];

export type Respostas = Record<string, number>; // id da pergunta → pontos

export type Nivel = { titulo: string; resumo: string };

export function nivelDaNota(nota: number): Nivel {
  if (nota < 4)
    return {
      titulo: "Operação em risco",
      resumo:
        "A agência funciona apoiada no esforço das pessoas, não em processos. Há perda relevante de tempo e dinheiro, e os pontos abaixo pedem ação imediata.",
    };
  if (nota < 6)
    return {
      titulo: "Operação em estruturação",
      resumo:
        "Existem rotinas, mas elas dependem de quem as executa. Organizar os gargalos indicados libera tempo do gestor e dá previsibilidade à operação.",
    };
  if (nota < 8)
    return {
      titulo: "Operação organizada",
      resumo:
        "A base está construída. O próximo passo é padronizar o que ainda é manual e usar indicadores para crescer com segurança.",
    };
  return {
    titulo: "Operação de referência",
    resumo:
      "Processos maduros e controlados. O ganho agora está em transformar dados em vantagem comercial junto aos clientes.",
  };
}

export type ResultadoPilar = Pilar & { percentual: number; achados: string[]; recomendacoesAplicaveis: string[] };

export type Resultado = {
  nota: number;
  nivel: Nivel;
  pilares: ResultadoPilar[];
  gargalos: ResultadoPilar[];
  plano: { semana: string; foco: string; acoes: string[] }[];
};

function recomendacoesPara(p: Pilar, percentual: number): string[] {
  if (percentual < 50) return p.recomendacoes.critico;
  if (percentual < 80) return p.recomendacoes.intermediario;
  return p.recomendacoes.avancado;
}

export function respondidas(respostas: Respostas): number {
  return PERGUNTAS.filter((q) => respostas[q.id] !== undefined).length;
}

export function calcularResultado(respostas: Respostas): Resultado {
  const pilares: ResultadoPilar[] = PILARES.map((p) => {
    const perguntas = PERGUNTAS.filter((q) => q.pilar === p.id);
    const pontos = perguntas.reduce((s, q) => s + (respostas[q.id] ?? 0), 0);
    const percentual = Math.round((pontos / (perguntas.length * 3)) * 100);
    const achados = perguntas.filter((q) => (respostas[q.id] ?? 0) <= 1).map((q) => q.achado);
    return { ...p, percentual, achados, recomendacoesAplicaveis: recomendacoesPara(p, percentual) };
  });

  const media = pilares.reduce((s, p) => s + p.percentual, 0) / pilares.length;
  const nota = Math.round(media) / 10;

  const gargalos = [...pilares]
    .map((p, ordem) => ({ p, ordem }))
    .sort((a, b) => a.p.percentual - b.p.percentual || a.ordem - b.ordem)
    .slice(0, 3)
    .map(({ p }) => p);

  const [g1, g2, g3] = gargalos;
  const plano = [
    { semana: "Dias 1 a 7", foco: `Base: ${g1.nome.toLowerCase()}`, acoes: [g1.acoes[0]] },
    { semana: "Dias 8 a 14", foco: "Correção do principal gargalo", acoes: [g1.acoes[1], g2.acoes[0]] },
    { semana: "Dias 15 a 21", foco: "Estruturação", acoes: [g2.acoes[1], g3.acoes[0]] },
    {
      semana: "Dias 22 a 30",
      foco: "Consolidação e medição",
      acoes: [g3.acoes[1], "Refazer este diagnóstico e comparar a nova nota com a atual."],
    },
  ];

  return { nota, nivel: nivelDaNota(nota), pilares, gargalos, plano };
}

/** Nota no formato brasileiro (6,4). */
export function formatarNota(nota: number): string {
  return nota.toFixed(1).replace(".", ",");
}

/** Resumo para o visitante enviar à MCX pelo WhatsApp, se quiser. */
export function mensagemResultado(r: Resultado): string {
  return [
    `Olá! Fiz o Diagnóstico Operacional da ${MARCA.nome}.`,
    "",
    `Nota operacional: ${formatarNota(r.nota)} de 10 (${r.nivel.titulo})`,
    `Principais gargalos: ${r.gargalos.map((g) => `${g.nome} (${g.percentual}%)`).join(", ")}`,
    "",
    "Gostaria de conversar sobre o plano de ação.",
  ].join("\n");
}

/** Link wa.me para o WhatsApp da MCX com o resumo pronto (o visitante revisa e envia). */
export function linkWhatsAppResultado(r: Resultado): string {
  const digitos = MARCA.whatsapp.replace(/\D/g, "");
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagemResultado(r))}`;
}
