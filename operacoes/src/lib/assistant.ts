/**
 * Assistente MCX (Fase 7) — regras puras: modelos, preços, custo, limites,
 * histórico enviado à API e biblioteca "Prompts MCX". Sem banco e sem rede.
 *
 * Licença: o chat usa SOMENTE a API da Anthropic com a chave da MCX
 * (ANTHROPIC_API_KEY no servidor). Nunca login, cookie ou token do claude.ai.
 */

export const ASSISTANT_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (mais barato)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (mais capaz)" },
] as const;
export type AssistantModel = (typeof ASSISTANT_MODELS)[number]["id"];

/** US$ por milhão de tokens (tabela oficial em 11/2026; ajustável nas configurações). */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const DEFAULT_PRICES: Record<AssistantModel, ModelPrice> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};

export const EFFORTS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];
export const EFFORT_LABEL: Record<Effort, string> = { low: "Rápido e econômico", medium: "Equilibrado", high: "Mais caprichado (mais caro)" };

export const DEFAULT_SYSTEM_PROMPT = `Você é o Assistente MCX, usado pela equipe interna da MCX Operações Comerciais (trade marketing e promotoria em Minas Gerais). Responda em português do Brasil, de forma direta e prática.

Contexto: a MCX atende indústrias e agências (Helvécio — Café Bravo, Queijo Barão e Danper —, AF Merchandising, Etros, Regis, Lucas). O dia a dia envolve pedidos de clientes, rotas e roteiros de promotores, relatórios para as marcas, planilhas, cobranças e degustações.

Regras:
- Nunca invente dado de cliente, preço, quantidade, data ou nome. Se faltar informação, diga o que falta e pergunte.
- Nunca peça nem aceite senhas, códigos de acesso ou dados de cartão.
- Evite repetir CPF, RG ou dados pessoais de promotores; se aparecerem, use só o necessário.
- Ao extrair dados de foto ou PDF (pedido, nota, planilha), devolva em lista ou tabela simples e marque o que ficou ilegível.
- Mensagens para WhatsApp: curtas, cordiais, sem emojis em excesso, prontas para colar.
- Quando a conversa virar uma tarefa com prazo ou responsável, sugira: "Quer transformar em demanda?".
- Você consulta os dados do sistema MCX só pelas ferramentas de consulta (somente leitura) e não pode executar ações nele.`;

export interface AssistantConfig {
  enabled: boolean;
  model: AssistantModel;
  effort: Effort;
  /** Usuários liberados (o dono libera um a um). */
  allowedUserIds: string[];
  /** Limites mensais em US$. */
  monthlyGlobalUsd: number;
  monthlyPerUserUsd: number;
  prices: Record<AssistantModel, ModelPrice>;
  retentionMonths: number;
  systemPrompt: string;
}

export const DEFAULT_CONFIG: AssistantConfig = {
  enabled: false,
  model: "claude-haiku-5-5",
  effort: "low",
  allowedUserIds: [],
  monthlyGlobalUsd: 10,
  monthlyPerUserUsd: 10,
  prices: DEFAULT_PRICES,
  retentionMonths: 6,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

const isModel = (v: unknown): v is AssistantModel => ASSISTANT_MODELS.some((m) => m.id === v);
const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);

/** Lê a configuração salva, preenchendo o que faltar com o padrão (nunca quebra por campo velho). */
export function normalizeConfig(raw: unknown): AssistantConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof AssistantConfig, unknown>>;
  const prices = { ...DEFAULT_PRICES } as Record<AssistantModel, ModelPrice>;
  const rawPrices = (r.prices && typeof r.prices === "object" ? r.prices : {}) as Record<string, Partial<ModelPrice>>;
  for (const m of ASSISTANT_MODELS) {
    const p = rawPrices[m.id] ?? {};
    const d = DEFAULT_PRICES[m.id];
    prices[m.id] = { input: num(p.input, d.input, 0, 1000), output: num(p.output, d.output, 0, 1000), cacheRead: num(p.cacheRead, d.cacheRead, 0, 1000), cacheWrite: num(p.cacheWrite, d.cacheWrite, 0, 1000) };
  }
  return {
    enabled: r.enabled === true,
    model: isModel(r.model) ? r.model : DEFAULT_CONFIG.model,
    effort: EFFORTS.includes(r.effort as Effort) ? (r.effort as Effort) : DEFAULT_CONFIG.effort,
    allowedUserIds: Array.isArray(r.allowedUserIds) ? r.allowedUserIds.filter((x): x is string => typeof x === "string") : [],
    monthlyGlobalUsd: num(r.monthlyGlobalUsd, DEFAULT_CONFIG.monthlyGlobalUsd, 0, 10000),
    monthlyPerUserUsd: num(r.monthlyPerUserUsd, DEFAULT_CONFIG.monthlyPerUserUsd, 0, 10000),
    prices,
    retentionMonths: Math.round(num(r.retentionMonths, DEFAULT_CONFIG.retentionMonths, 1, 60)),
    systemPrompt: typeof r.systemPrompt === "string" && r.systemPrompt.trim().length >= 20 ? r.systemPrompt.slice(0, 20000) : DEFAULT_SYSTEM_PROMPT,
  };
}

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Custo em micro-dólares (US$ × 1.000.000), inteiro para somar sem erro de arredondamento. */
export function costMicros(usage: TokenUsage, price: ModelPrice): number {
  return Math.round(usage.input * price.input + usage.output * price.output + usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite);
}

export const usd = (micros: number) => micros / 1_000_000;
export function fmtUsd(micros: number): string {
  const v = usd(micros);
  return `US$ ${v < 0.1 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`.replace(".", ",");
}

export type BudgetState = "ok" | "warn" | "blocked";

/** 80% avisa o dono; 100% bloqueia novas mensagens até virar o mês ou aumentar o limite. */
export function budgetState(spentMicros: number, limitUsd: number): BudgetState {
  const limit = limitUsd * 1_000_000;
  if (limit <= 0 || spentMicros >= limit) return "blocked";
  return spentMicros >= limit * 0.8 ? "warn" : "ok";
}

/** Primeiro dia do mês (AAAA-MM-01) de uma data AAAA-MM-DD. */
export const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

/** Projeção simples do mês: gasto até hoje ÷ dias corridos × dias do mês. */
export function monthProjection(spentMicros: number, today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.round((spentMicros / Math.max(1, d)) * days);
}

/** Quantas mensagens anteriores vão para a API (o resto fica só na tela). */
export const HISTORY_LIMIT = 20;
/** Teto de caracteres do histórico enviado (aprox. 4 caracteres por token). */
export const HISTORY_CHAR_LIMIT = 60_000;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: { name: string }[];
}

/**
 * Histórico enviado à API: últimas mensagens, dentro do teto, começando por
 * uma do usuário e alternando papéis. Anexos de turnos antigos não são
 * reenviados (só o nome), para não pagar a imagem a cada mensagem.
 */
export function historyForApi(messages: StoredMessage[]): { role: "user" | "assistant"; content: string }[] {
  const recent = messages.slice(-HISTORY_LIMIT);
  const out: { role: "user" | "assistant"; content: string }[] = [];
  let chars = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const note = m.attachments?.length ? `\n[Anexo enviado antes: ${m.attachments.map((a) => a.name).join(", ")}]` : "";
    const text = (m.content || "(sem texto)") + note;
    if (chars + text.length > HISTORY_CHAR_LIMIT && out.length) break;
    chars += text.length;
    out.unshift({ role: m.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  // Duas mensagens seguidas do mesmo papel (ex.: resposta que falhou) viram uma só.
  return out.reduce<{ role: "user" | "assistant"; content: string }[]>((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else acc.push({ ...m });
    return acc;
  }, []);
}

/** Anexos aceitos (imagem e PDF), com limite de tamanho. */
export const ATTACH_TYPES: Record<string, "image" | "pdf"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "application/pdf": "pdf",
};
export const MAX_ATTACH_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS = 3;
export const MAX_MESSAGE_CHARS = 20_000;

export function attachmentError(files: { name: string; type: string; size: number }[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return `No máximo ${MAX_ATTACHMENTS} arquivos por mensagem.`;
  for (const f of files) {
    if (!ATTACH_TYPES[f.type]) return `“${f.name}”: envie foto (JPG, PNG, WEBP) ou PDF.`;
    if (f.size > MAX_ATTACH_BYTES) return `“${f.name}” passa de ${MAX_ATTACH_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

/** Título automático da conversa a partir da 1ª mensagem. */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Nova conversa";
  return t.length > 60 ? `${t.slice(0, 57).trimEnd()}…` : t;
}

/** Biblioteca "Prompts MCX": modelos de instrução que preenchem a caixa de mensagem. */
export const PROMPTS_MCX: { id: string; title: string; text: string }[] = [
  {
    id: "resumo-dia",
    title: "Resumo do dia",
    text: "Como foi o dia hoje? Monte o resumo do dia: o que precisa de atenção (atrasadas, vencendo, aguardando retorno, follow-ups e, se tiver, os números de campo — lojas sem visita, rupturas, avarias, validades e ocorrências) e o que eu devo resolver amanhã, com responsável e contratante.",
  },
  {
    id: "campo-semana",
    title: "Campo da semana",
    text: "Como foi a semana no campo? Compare as agências: lojas programadas sem visita, rupturas, avarias, validades e ocorrências abertas, e diga quais lojas e marcas precisam de ação.",
  },
  {
    id: "pedido-foto",
    title: "Extrair pedido de foto",
    text: "Extraia o pedido desta foto em tabela: código, produto, quantidade e unidade. Marque com “?” o que estiver ilegível e não invente nenhum item.\n\nCliente/loja: ",
  },
  {
    id: "msg-promotor",
    title: "Mensagem para promotor",
    text: "Escreva uma mensagem curta e cordial de WhatsApp para o promotor, pronta para colar, sobre:\n\n",
  },
  {
    id: "relatorio-marca",
    title: "Relatório para a marca",
    text: "Monte um resumo objetivo para enviar à marca, com destaques, problemas encontrados (ruptura, validade, avaria) e próximos passos, a partir destas anotações:\n\n",
  },
  {
    id: "formula-planilha",
    title: "Fórmula de planilha",
    text: "Preciso de uma fórmula de Excel/Google Sheets que faça o seguinte (explique em uma linha como usar):\n\n",
  },
  {
    id: "cobranca",
    title: "Cobrança educada",
    text: "Escreva uma mensagem educada de cobrança para o cliente, sem tom agressivo, sobre:\n\n",
  },
  {
    id: "resumir",
    title: "Resumir conversa ou e-mail",
    text: "Resuma em tópicos o que foi combinado, o que está pendente e de quem é cada pendência:\n\n",
  },
];
