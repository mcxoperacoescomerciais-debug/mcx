/**
 * Escopos de serviço enviados pela MCX a potenciais clientes: cada cliente
 * recebe um link exclusivo, marca "De acordo" ou "Ressalva" em cada item e
 * confirma o escopo. Regras puras (sem banco), usadas no editor, na página
 * pública e no servidor.
 */

export type ScopeSectionKind = "checklist" | "questions";

export const SECTION_KIND_LABEL: Record<ScopeSectionKind, string> = {
  checklist: "Checklist (De acordo / Ressalva)",
  questions: "Perguntas (resposta escrita)",
};

export type ScopeItem = { id: string; text: string };
export type ScopeSection = { id: string; title: string; kind: ScopeSectionKind; items: ScopeItem[] };

export type ScopeChoice = "ok" | "reservation";

/** Resposta de um item, com o texto do item congelado no momento do envio. */
export type ScopeAnswer = {
  itemId: string;
  section: string;
  text: string;
  kind: ScopeSectionKind;
  choice: ScopeChoice | null;
  note: string;
};

export const LIMITS = {
  sections: 30,
  itemsPerSection: 80,
  title: 200,
  item: 1000,
  longText: 4000,
  note: 2000,
  name: 120,
};

const clip = (v: unknown, max: number) => String(v ?? "").replace(/\s+$/g, "").trim().slice(0, max);

/**
 * Normaliza as seções vindas do editor: tira espaços e itens vazios, limita
 * tamanhos e numera os ids (s1-1, s1-2...). Seção sem título nem itens some.
 */
export function normalizeSections(raw: unknown): ScopeSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ScopeSection[] = [];
  for (const sec of raw.slice(0, LIMITS.sections)) {
    if (!sec || typeof sec !== "object") continue;
    const s = sec as Record<string, unknown>;
    const title = clip(s.title, LIMITS.title);
    const kind: ScopeSectionKind = s.kind === "questions" ? "questions" : "checklist";
    const rawItems = Array.isArray(s.items) ? s.items : [];
    const texts = rawItems
      .map((it) => clip(typeof it === "string" ? it : (it as { text?: unknown })?.text, LIMITS.item))
      .filter(Boolean)
      .slice(0, LIMITS.itemsPerSection);
    if (!title && !texts.length) continue;
    const n = out.length + 1;
    out.push({ id: `s${n}`, title: title || `Seção ${n}`, kind, items: texts.map((text, i) => ({ id: `s${n}-${i + 1}`, text })) });
  }
  return out;
}

/** Itens do editor: um por linha (linhas em branco são ignoradas). */
export function itemsFromLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[☐☑✓✔•\-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export type ResponseInput = {
  answers: Record<string, { choice?: string; note?: string }>;
  generalNote: string;
  signerName: string;
  signerRole: string;
  signerEmail: string;
  agree: boolean;
};

export type ResponseCheck =
  | { ok: true; answers: ScopeAnswer[] }
  | { ok: false; error: string; missing: string[] };

/**
 * Confere a resposta do cliente: todo item de checklist precisa de "De acordo"
 * ou "Ressalva", e toda ressalva precisa de um comentário. Perguntas são
 * opcionais. Também exige nome, cargo e o aceite final.
 */
export function checkResponse(sections: ScopeSection[], input: ResponseInput): ResponseCheck {
  const missing: string[] = [];
  const answers: ScopeAnswer[] = [];
  for (const sec of sections) {
    for (const item of sec.items) {
      const a = input.answers[item.id] ?? {};
      const note = clip(a.note, LIMITS.note);
      if (sec.kind === "questions") {
        answers.push({ itemId: item.id, section: sec.title, text: item.text, kind: sec.kind, choice: null, note });
        continue;
      }
      const choice: ScopeChoice | null = a.choice === "ok" ? "ok" : a.choice === "reservation" ? "reservation" : null;
      if (!choice || (choice === "reservation" && !note)) missing.push(item.id);
      answers.push({ itemId: item.id, section: sec.title, text: item.text, kind: sec.kind, choice, note: choice === "ok" ? "" : note });
    }
  }
  if (missing.length) {
    return {
      ok: false,
      missing,
      error: `Faltam ${missing.length} item(ns): marque "De acordo" ou "Ressalva" e, na ressalva, explique o ajuste.`,
    };
  }
  if (!clip(input.signerName, LIMITS.name)) return { ok: false, missing: [], error: "Informe o nome do responsável." };
  if (!clip(input.signerRole, LIMITS.name)) return { ok: false, missing: [], error: "Informe o cargo do responsável." };
  const email = clip(input.signerEmail, LIMITS.name);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, missing: [], error: "Confira o e-mail informado." };
  if (!input.agree) return { ok: false, missing: [], error: "Marque a confirmação do escopo para enviar." };
  return { ok: true, answers };
}

export function countAnswers(answers: ScopeAnswer[]) {
  return {
    ok: answers.filter((a) => a.choice === "ok").length,
    reservations: answers.filter((a) => a.choice === "reservation").length,
    questions: answers.filter((a) => a.kind === "questions").length,
  };
}

/** Modelo pronto: escopo administrativo, financeiro e de acompanhamento operacional. */
export const SCOPE_TEMPLATE_ADMIN = {
  title: "Escopo de serviços — Administrativo, Financeiro e Acompanhamento Operacional",
  intro: "Objetivo: detalhar as atividades previstas para alinhamento e validação entre as partes antes da contratação.",
  details:
    "Estrutura inicial considerada: até 2 promotores, atendendo aproximadamente 10 a 12 indústrias, com acompanhamento remoto de segunda a sexta-feira.",
  closingText:
    "Peço que os itens acima sejam revisados e assinalados para confirmar quais atividades farão parte da prestação de serviços. Os pontos não selecionados ou que precisem de ajuste deverão ser alinhados antes da formalização do contrato.",
  sections: [
    {
      title: "Gestão administrativa dos promotores",
      items: [
        "Manter cadastro e dados administrativos dos promotores atualizados.",
        "Acompanhar remotamente as rotas e os atendimentos previstos.",
        "Conferir fotos e relatórios enviados pelos promotores nos grupos de comunicação.",
        "Registrar faltas, atrasos, ocorrências, mudanças de rota e pendências comunicadas.",
        "Solicitar informações, fotos ou relatórios que estejam pendentes.",
        "Organizar e apresentar resumo periódico do acompanhamento operacional.",
      ],
    },
    {
      title: "Controle de materiais e equipamentos",
      items: [
        "Manter controle de uniformes entregues, devolvidos e substituídos.",
        "Controlar celulares, chips, acessórios e demais equipamentos disponibilizados.",
        "Controlar entrega, devolução e necessidade de reposição de EPIs, quando aplicável.",
        "Registrar entrega dos materiais por colaborador, com data e confirmação de recebimento.",
        "Acompanhar estoque, extravios, danos, manutenção e solicitações de reposição.",
        "Manter termos de recebimento e responsabilidade organizados.",
      ],
    },
    {
      title: "Admissões, desligamentos e contato com a contabilidade",
      items: [
        "Reunir e encaminhar à contabilidade os documentos e dados necessários para admissões.",
        "Solicitar e acompanhar os procedimentos de desligamento junto à contabilidade.",
        "Encaminhar informações de faltas, ponto, férias, atestados, afastamentos e benefícios.",
        "Receber a folha de pagamento preparada pela contabilidade.",
        "Conferir dados e valores informados na folha e comunicar divergências à contabilidade.",
        "Acompanhar prazos, documentos pendentes e demais solicitações da contabilidade.",
        "Organizar os documentos administrativos dos colaboradores com acesso restrito.",
      ],
    },
    {
      title: "Controle de notas fiscais das indústrias",
      items: [
        "Receber e organizar as notas fiscais encaminhadas pelas indústrias.",
        "Conferir valores, período de referência, descrição dos serviços e dados de faturamento.",
        "Comparar as notas com contratos, informações de atendimento e condições acordadas disponibilizadas.",
        "Identificar divergências e solicitar esclarecimentos ou correções aos responsáveis.",
        "Registrar nota fiscal, indústria, valor, data de emissão e vencimento em controle próprio.",
        "Manter histórico organizado por indústria.",
      ],
    },
    {
      title: "Contas a receber e conciliação dos recebimentos",
      items: [
        "Acompanhar os valores previstos para recebimento de aproximadamente 10 a 12 indústrias.",
        "Conferir os créditos diretamente no extrato da conta bancária da empresa.",
        "Conciliar cada recebimento com a respectiva nota fiscal e o valor esperado.",
        "Registrar recebimentos totais, parciais, não identificados ou divergentes.",
        "Controlar vencimentos, atrasos e valores em aberto.",
        "Comunicar pendências ao responsável pela empresa e realizar cobranças administrativas quando autorizada.",
        "Manter planilha atualizada de valores previstos, recebidos e pendentes.",
      ],
    },
    {
      title: "Contas a pagar e execução de pagamentos",
      items: [
        "Organizar contas, boletos, notas fiscais de fornecedores e demais compromissos financeiros.",
        "Controlar vencimentos e preparar a relação de pagamentos pendentes.",
        "Conferir favorecido, valor, vencimento e dados de pagamento antes da execução.",
        "Realizar pagamentos pelo acesso bancário empresarial autorizado, conforme aprovações e limites definidos.",
        "Executar pagamentos de salários com base na folha recebida da contabilidade e conforme autorização da empresa.",
        "Salvar e organizar comprovantes dos pagamentos realizados.",
        "Registrar pagamentos efetuados e comunicar pendências ou insuficiência de saldo.",
      ],
    },
    {
      title: "Controle financeiro e relatórios",
      items: [
        "Registrar receitas, despesas e pagamentos em planilha ou sistema acordado.",
        "Acompanhar o fluxo de caixa previsto e realizado.",
        "Conferir movimentações bancárias com os registros financeiros disponíveis.",
        "Organizar comprovantes, extratos e documentos para envio à contabilidade.",
        "Preparar relatório mensal de recebimentos, pagamentos, valores vencidos e compromissos futuros.",
        "Apontar divergências, despesas não identificadas e documentos pendentes ao responsável.",
      ],
    },
    {
      title: "Comunicação e organização documental",
      items: [
        "Manter arquivos administrativos e financeiros organizados em local acordado.",
        "Centralizar documentos e informações recebidos das indústrias, promotores e contabilidade.",
        "Comunicar ao responsável pela empresa situações que dependam de decisão ou aprovação.",
        "Preservar a confidencialidade das informações financeiras, fiscais e pessoais acessadas.",
      ],
    },
    {
      title: "Condições e limites a confirmar",
      items: [
        "Quantidade inicial incluída: até 2 promotores e até 12 indústrias.",
        "Atendimento remoto, de segunda a sexta-feira, em horários a combinar.",
        "Pagamentos serão realizados exclusivamente pela conta bancária da empresa, com acesso autorizado e conforme o fluxo de aprovação definido.",
        "A empresa deverá disponibilizar saldo, documentos, informações e aprovações em tempo hábil.",
        "Os cálculos técnicos de folha, tributos, encargos e procedimentos contábeis permanecem sob responsabilidade da contabilidade e dos profissionais legalmente responsáveis.",
        "Atividades extraordinárias, aumento relevante do número de promotores/indústrias ou do volume de transações poderão exigir revisão de escopo e valor.",
        "Definir se a emissão de notas fiscais, cobranças ativas, negociação de inadimplência, compras de materiais e atendimento presencial estão incluídos ou serão tratados separadamente.",
      ],
    },
  ].map((s) => ({ ...s, kind: "checklist" as ScopeSectionKind })),
};
