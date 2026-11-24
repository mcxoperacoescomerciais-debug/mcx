/**
 * Comercial (CRM): vocabulário, tabela de preços, cadência, modelos de mensagem,
 * importação de CSV e os cálculos do painel. Tudo aqui é puro (sem banco).
 */
import { addDays } from "./dates";

export const LEAD_TYPES = ["Agência de promotoria", "Agência de ativação/promoções", "Representante", "Marca/Indústria", "Outro"] as const;
/** Nomes antigos de tipo que já podem estar gravados → nome atual. */
const LEGACY_TYPES: Record<string, (typeof LEAD_TYPES)[number]> = { "Agência de degustação/ação": "Agência de ativação/promoções" };
export function normalizeLeadType(type: string): string {
  return LEGACY_TYPES[type] ?? type;
}

/**
 * Foco do lead: o que a MCX quer vender. Vem dos produtos marcados no lead —
 * App = venda do aplicativo; Backoffice, Degustação e Administrativo = serviço.
 */
export const LEAD_FOCUS = ["Venda do app", "Serviço", "App + serviço"] as const;
export type LeadFocus = (typeof LEAD_FOCUS)[number];
const SERVICE_PRODUCTS = ["Backoffice", "Degustação", "Administrativo"];
export function leadFocus(products: readonly string[]): LeadFocus | null {
  const app = products.includes("App");
  const service = products.some((p) => SERVICE_PRODUCTS.includes(p));
  return app && service ? "App + serviço" : app ? "Venda do app" : service ? "Serviço" : null;
}

/** Texto livre da planilha ("Venda do aplicativo…", "serviço", "app + backoffice") → produtos. */
export function productsFromFocus(text: string): Product[] {
  const t = companyKey(text);
  if (!t) return [];
  const out = new Set<Product>();
  if (/\b(app|aplicativo|sistema)\b/.test(t)) out.add("App");
  if (/\bbackoffice\b|\bservico\b|\bservicos\b/.test(t)) out.add("Backoffice");
  if (/\bdegustac/.test(t) && !out.has("App")) out.add("Degustação");
  if (/\badministrativo\b/.test(t)) out.add("Administrativo");
  return [...out];
}
export const LEAD_SOURCES = ["Prospecção ativa", "Indicação", "Instagram", "Anúncio", "Evento", "Outro"] as const;
export const PRODUCTS = ["Backoffice", "App", "Degustação", "Administrativo"] as const;
export type Product = (typeof PRODUCTS)[number];
export const LOSS_REASONS = ["Preço", "Sem resposta", "Já tem sistema", "Sem dor agora", "Escolheu concorrente", "Outro"] as const;

export const INTERACTION_KINDS = ["whatsapp", "call", "email", "meeting", "demo"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
export const INTERACTION_KIND_LABEL: Record<InteractionKind, string> = { whatsapp: "WhatsApp", call: "Ligação", email: "E-mail", meeting: "Reunião", demo: "Demonstração" };

export const OUTCOMES = ["sent", "answered", "no_answer", "scheduled", "not_interested", "other"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABEL: Record<Outcome, string> = { sent: "Mensagem enviada", answered: "Respondeu", no_answer: "Sem resposta", scheduled: "Agendou", not_interested: "Sem interesse agora", other: "Outro" };

export type StageKind = "open" | "won" | "lost" | "nurture";
export type StageKey = "prospect" | "contacted" | "talking" | "demo" | "proposal" | "trial" | "won" | "lost" | "nurture";

/** Funil inicial (o dono pode renomear, reordenar e ajustar a chance de fechar). */
export const DEFAULT_STAGES: { key: StageKey; name: string; kind: StageKind; probability: number }[] = [
  { key: "prospect", name: "A prospectar", kind: "open", probability: 5 },
  { key: "contacted", name: "Primeiro contato feito", kind: "open", probability: 10 },
  { key: "talking", name: "Em conversa", kind: "open", probability: 25 },
  { key: "demo", name: "Demonstração", kind: "open", probability: 45 },
  { key: "proposal", name: "Proposta enviada", kind: "open", probability: 60 },
  { key: "trial", name: "Em teste/implantação", kind: "open", probability: 80 },
  { key: "won", name: "Ganho", kind: "won", probability: 100 },
  { key: "lost", name: "Perdido", kind: "lost", probability: 0 },
  { key: "nurture", name: "Nutrição", kind: "nurture", probability: 5 },
];

/** Etapas que só existem depois de o lead ter respondido. */
export const RESPONDED_KEYS: StageKey[] = ["talking", "demo", "proposal", "trial", "won"];
export const PROPOSAL_VALID_DAYS = 10;
export const NURTURE_DAYS = 30;
export const DEFAULT_DAILY_GOAL = 5;

// --- Preços (seção 4.8 da especificação) -----------------------------------

/** App MCX Trade, por promotor/mês. */
export function appPriceCents(promoters: number): number {
  if (promoters <= 0) return 0;
  const unit = promoters <= 20 ? 6000 : promoters <= 50 ? 5500 : 5000;
  return promoters * unit;
}

/** Módulo degustação por faixa de ações/mês; acima de 80 é sob proposta (0). */
export function tastingPriceCents(actions: number): number {
  if (actions <= 0) return 0;
  if (actions <= 30) return 59000;
  if (actions <= 50) return 90000;
  if (actions <= 80) return 120000;
  return 0;
}

/** Backoffice: piso do pacote (R$ 1.250/mês). Agências e Administrativo são sob proposta. */
export const BACKOFFICE_FLOOR_CENTS = 125000;

/**
 * Valor mensal potencial pelo porte. Devolve também o que ficou "sob proposta"
 * (não entra na soma) para a tela avisar, em vez de inventar um número.
 */
export function potentialValue(products: readonly string[], promoters: number | null | undefined, actions: number | null | undefined): { cents: number; underProposal: string[] } {
  let cents = 0;
  const underProposal: string[] = [];
  if (products.includes("Backoffice")) cents += BACKOFFICE_FLOOR_CENTS;
  if (products.includes("App")) {
    if (promoters && promoters > 0) cents += appPriceCents(promoters);
    else underProposal.push("App (informe o nº de promotores)");
  }
  if (products.includes("Degustação")) {
    if (!actions || actions <= 0) underProposal.push("Degustação (informe as ações por mês)");
    else if (actions > 80) underProposal.push("Degustação acima de 80 ações");
    else cents += tastingPriceCents(actions);
  }
  if (products.includes("Administrativo")) underProposal.push("Administrativo");
  return { cents, underProposal };
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: cents % 100 === 0 ? 0 : 2 });
}

/** "1.250,00" / "1250" → centavos. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

// --- Contato ---------------------------------------------------------------

/** Só dígitos, com DDI 55. Devolve null se não parecer um telefone brasileiro. */
export function phoneDigits(raw: string | null | undefined): string | null {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length === 12 || d.length === 13 ? d : null;
}

/** Chave para comparar nomes de empresa (sem acento, caixa, pontuação e sufixos societários). */
export function companyKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(ltda|me|epp|eireli|sa|s a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Modelos de mensagem ---------------------------------------------------

export const TEMPLATE_VARS = ["nome", "empresa", "cidade", "produto"] as const;

/** Troca {nome}, {empresa}, {cidade} e {produto}. Variável sem valor fica visível, para ninguém enviar sem perceber. */
export function fillTemplate(body: string, vars: Partial<Record<(typeof TEMPLATE_VARS)[number], string | null>>): string {
  return body.replace(/\{(nome|empresa|cidade|produto)\}/g, (whole, key: (typeof TEMPLATE_VARS)[number]) => {
    const v = vars[key]?.trim();
    return v ? v : whole;
  });
}

export function missingVars(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(nome|empresa|cidade|produto)\}/g)].map((m) => m[1]))];
}

/** Link que abre o WhatsApp de quem clicou com o texto pronto. O envio continua humano. */
export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// --- Cadência --------------------------------------------------------------

/**
 * Cadência D0 → D+3 → D+7. `unanswered` = contatos já feitos sem resposta
 * (contando o que está sendo registrado agora).
 */
export function cadence(unanswered: number, today: string): { nextAction: string; nextActionDate: string; suggestClose: boolean } {
  if (unanswered <= 1) return { nextAction: "Follow-up D+3", nextActionDate: addDays(today, 3), suggestClose: false };
  if (unanswered === 2) return { nextAction: "Follow-up D+7", nextActionDate: addDays(today, 4), suggestClose: false };
  return { nextAction: "Retomar contato", nextActionDate: addDays(today, NURTURE_DAYS), suggestClose: true };
}

// --- Importação de CSV -----------------------------------------------------

export interface CsvLead {
  line: number;
  company: string;
  contact: string;
  whatsapp: string;
  city: string;
  type: string;
  source: string;
  /** Colunas opcionais (planilha de prospecção). */
  region: string;
  focus: string;
  nextAction: string;
  dataSource: string;
  fit: string;
  why: string;
  notes: string;
  instagram: string;
  site: string;
  address: string;
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const HEADER_ALIASES: Record<keyof Omit<CsvLead, "line">, string[]> = {
  company: ["empresa", "agencia", "nome da empresa", "razao social"],
  contact: ["contato", "nome", "responsavel", "nome do contato"],
  whatsapp: ["whatsapp", "telefone", "celular", "fone"],
  city: ["cidade", "municipio"],
  type: ["tipo"],
  source: ["origem"],
  region: ["regiao"],
  focus: ["foco", "oferta", "produto", "produtos"],
  nextAction: ["proximo passo", "proxima acao"],
  dataSource: ["fonte", "fonte do dado"],
  fit: ["fit"],
  why: ["por que e lead", "motivo"],
  notes: ["observacao", "observacoes", "notas"],
  instagram: ["instagram"],
  site: ["site"],
  address: ["endereco"],
};

const CSV_FIELDS = Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[];

/** Lê o CSV (separador ; ou ,). A 1ª linha é o cabeçalho; só "empresa" é obrigatória. */
export function parseLeadsCsv(text: string): { rows: CsvLead[]; error?: string } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: "O arquivo precisa do cabeçalho e de pelo menos uma linha." };
  const sep = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitCsvLine(lines[0], sep).map((h) => companyKey(h));
  const col = (field: keyof typeof HEADER_ALIASES) => header.findIndex((h) => HEADER_ALIASES[field].includes(h));
  const idx = Object.fromEntries(CSV_FIELDS.map((f) => [f, col(f)])) as Record<keyof typeof HEADER_ALIASES, number>;
  if (idx.company < 0) return { rows: [], error: "Não achei a coluna “empresa” no cabeçalho." };
  const rows: CsvLead[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = splitCsvLine(line, sep);
    const get = (n: number) => (n >= 0 ? (cells[n] ?? "") : "");
    const company = get(idx.company);
    if (!company) return;
    const row = { line: i + 2 } as CsvLead;
    for (const f of CSV_FIELDS) row[f] = get(idx[f]);
    rows.push(row);
  });
  return { rows };
}

/** Aproxima o texto livre do CSV de uma opção da lista; sem correspondência, usa o padrão. */
export function matchOption<T extends string>(value: string, options: readonly T[], fallback: T): T {
  const key = companyKey(value);
  if (!key) return fallback;
  return options.find((o) => companyKey(o) === key) ?? options.find((o) => companyKey(o).includes(key) || key.includes(companyKey(o).split(" ")[0])) ?? fallback;
}

// --- Painel comercial ------------------------------------------------------

export interface MetricLead {
  id: string;
  type: string;
  source: string;
  stageKind: StageKind;
  stageProbability: number;
  valueCents: number;
  /** Datas ISO (AAAA-MM-DD) no fuso de Brasília; null se não aconteceu. */
  firstContactDay: string | null;
  respondedDay: string | null;
  wonDay: string | null;
  lostDay: string | null;
  lossReason: string | null;
}

export interface MetricMove {
  leadId: string;
  toKey: string | null;
  toPosition: number;
  day: string;
}

const between = (day: string | null, from: string, to: string) => !!day && day >= from && day <= to;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);

/** Novos contatos por semana (4 semanas) contra a meta (meta diária × 5 dias úteis). */
export function contactsByWeek(leads: MetricLead[], weeks: string[], dailyGoal: number) {
  return weeks.map((start) => ({ week: start, contacts: leads.filter((l) => between(l.firstContactDay, start, addDays(start, 6))).length, goal: dailyGoal * 5 }));
}

/** Dos leads contatados no período, quantos responderam. */
export function responseRate(leads: MetricLead[], from: string, to: string) {
  const contacted = leads.filter((l) => between(l.firstContactDay, from, to));
  const answered = contacted.filter((l) => l.respondedDay).length;
  return { contacted: contacted.length, answered, percent: contacted.length ? Math.round((answered / contacted.length) * 100) : 0 };
}

/** Leads distintos que entraram numa etapa no período. */
export function reachedInPeriod(moves: MetricMove[], key: string, from: string, to: string): number {
  return new Set(moves.filter((m) => m.toKey === key && between(m.day, from, to)).map((m) => m.leadId)).size;
}

/**
 * Conversão entre etapas abertas: um lead "chegou" numa etapa se já esteve nela
 * ou em qualquer etapa posterior (quem pulou uma etapa conta como tendo passado).
 */
export function stageConversion(moves: MetricMove[], stages: { name: string; position: number }[]) {
  const furthest = new Map<string, number>();
  for (const m of moves) furthest.set(m.leadId, Math.max(furthest.get(m.leadId) ?? -1, m.toPosition));
  const reached = stages.map((st) => ({ name: st.name, count: [...furthest.values()].filter((p) => p >= st.position).length }));
  return reached.map((r, i) => ({ ...r, percentFromPrevious: i === 0 || !reached[i - 1].count ? null : Math.round((r.count / reached[i - 1].count) * 100) }));
}

/** Dias do primeiro contato ao ganho, em média, dos leads ganhos no período. */
export function averageCycleDays(leads: MetricLead[], from: string, to: string): number | null {
  const cycles = leads.filter((l) => between(l.wonDay, from, to) && l.firstContactDay).map((l) => daysBetween(l.firstContactDay!, l.wonDay!));
  return cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null;
}

export function pipeline(leads: MetricLead[]) {
  const open = leads.filter((l) => l.stageKind === "open");
  return { count: open.length, totalCents: open.reduce((a, l) => a + l.valueCents, 0), weightedCents: Math.round(open.reduce((a, l) => a + (l.valueCents * l.stageProbability) / 100, 0)) };
}

export function wonMrr(leads: MetricLead[], from: string, to: string) {
  const won = leads.filter((l) => between(l.wonDay, from, to));
  return { count: won.length, cents: won.reduce((a, l) => a + l.valueCents, 0) };
}

export function lossReasons(leads: MetricLead[], from: string, to: string) {
  const counts = new Map<string, number>();
  for (const l of leads) if (between(l.lostDay, from, to)) counts.set(l.lossReason ?? "Sem motivo", (counts.get(l.lossReason ?? "Sem motivo") ?? 0) + 1);
  return [...counts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

export function resultsBy(leads: MetricLead[], field: "source" | "type") {
  const groups = new Map<string, { total: number; won: number; lost: number; wonCents: number }>();
  for (const l of leads) {
    const g = groups.get(l[field]) ?? { total: 0, won: 0, lost: 0, wonCents: 0 };
    g.total++;
    if (l.stageKind === "won") {
      g.won++;
      g.wonCents += l.valueCents;
    }
    if (l.stageKind === "lost") g.lost++;
    groups.set(l[field], g);
  }
  return [...groups.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.total - a.total);
}

/** Grupo do lead na tela "Comercial hoje" (null = nada a fazer hoje). */
export function todayGroup(lead: { stageKind: StageKind; nextActionDate: string | null; proposalValidUntil: string | null; stageKey: string | null }, today: string): "overdue" | "today" | "proposal" | null {
  if (lead.stageKind !== "open" && lead.stageKind !== "nurture") return null;
  if (lead.nextActionDate && lead.nextActionDate < today) return "overdue";
  if (lead.nextActionDate === today) return "today";
  if (lead.stageKey === "proposal" && lead.proposalValidUntil && lead.proposalValidUntil <= addDays(today, 3)) return "proposal";
  return null;
}
