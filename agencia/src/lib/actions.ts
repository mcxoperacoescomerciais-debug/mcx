/**
 * Modo AÇÕES (agências de degustação e ativação): o atendimento da marca vira uma "ação"
 * no PDV, com resultado (abordagens, amostras, vendas, aceitação), fotos de montagem,
 * ação e encerramento e ocorrências próprias. Liga-se pelo recurso "actions" da agência
 * (Equipe MCX › Agências). Funções puras — usadas no app, no painel, nos PDFs e nos testes.
 */

/** Resultado da ação informado pela promotora no fim do atendimento. */
export interface ActionOutcome {
  /** Pessoas abordadas. */
  approached: number | null;
  /** Amostras distribuídas. */
  samples: number | null;
  /** Unidades vendidas durante a ação. */
  unitsSold: number | null;
  /** Aceitação do produto: 1 (ruim) a 5 (ótima). */
  acceptance: number | null;
}

export const EMPTY_OUTCOME: ActionOutcome = { approached: null, samples: null, unitsSold: null, acceptance: null };

export const ACCEPTANCE_LABEL: Record<number, string> = { 1: "Ruim", 2: "Regular", 3: "Boa", 4: "Muito boa", 5: "Ótima" };

/** Resultado completo: os quatro números informados. */
export function outcomeComplete(o: ActionOutcome | null | undefined): boolean {
  return Boolean(o && o.approached !== null && o.samples !== null && o.unitsSold !== null && o.acceptance !== null);
}

/** Lê o que veio do banco ou do aparelho (valor estranho vira vazio). */
export function readOutcome(raw: unknown): ActionOutcome | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : null);
  const acc = n(r.acceptance, 5);
  return { approached: n(r.approached, 100_000), samples: n(r.samples, 100_000), unitsSold: n(r.unitsSold, 100_000), acceptance: acc && acc >= 1 ? acc : null };
}

/** Conversão: vendas ÷ abordagens (null sem abordagens). */
export function conversion(unitsSold: number, approached: number): number | null {
  return approached > 0 ? unitsSold / approached : null;
}

export const pct = (v: number | null, digits = 1) => (v === null ? "—" : `${(v * 100).toFixed(digits).replace(".", ",")}%`);

/** Vocabulário da interface: promotoria (padrão) ou ações. */
export interface Terms {
  visit: string;
  visits: string;
  promoter: string;
  promoters: string;
  store: string;
  stores: string;
  schedule: string;
  tasting: string;
  tastings: string;
  taster: string;
  tasters: string;
}

export const PROMOTORIA_TERMS: Terms = {
  visit: "Visita",
  visits: "Visitas",
  promoter: "Promotor",
  promoters: "Promotores",
  store: "Loja",
  stores: "Lojas",
  schedule: "Roteiro",
  tasting: "Degustação",
  tastings: "Degustações",
  taster: "Degustadora",
  tasters: "Degustadoras",
};

export const ACTION_TERMS: Terms = {
  visit: "Ação",
  visits: "Ações",
  promoter: "Promotora",
  promoters: "Promotoras",
  store: "PDV",
  stores: "PDVs",
  schedule: "Agenda de ações",
  tasting: "Ação",
  tastings: "Ações",
  taster: "Promotora",
  tasters: "Promotoras",
};

export const termsFor = (actions: boolean | null | undefined): Terms => (actions ? ACTION_TERMS : PROMOTORIA_TERMS);

/** Fotos da ação (mesmos tipos do atendimento): montagem = antes, ação = depois, encerramento. */
export const ACTION_PHOTO_LABEL: Record<"before" | "after" | "closing", string> = {
  before: "Montagem do ponto",
  after: "Ação acontecendo",
  closing: "Encerramento",
};

/** Ação com as três fotos (montagem, ação acontecendo e encerramento). */
export function photosComplete(kinds: Iterable<string>): boolean {
  const set = new Set(kinds);
  return set.has("before") && set.has("after") && set.has("closing");
}
