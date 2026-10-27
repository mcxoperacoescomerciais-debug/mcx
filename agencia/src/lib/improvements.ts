/**
 * Solicitações de melhoria: qualquer usuário (promotor, agência, equipe MCX)
 * sugere uma melhoria; o servidor pede uma análise ao Claude e avisa a MCX.
 * Regras puras (sem banco), usadas no app, no painel e no servidor.
 */
import type { Tone } from "./domain";

export type ImprovementStatus = "new" | "reviewing" | "approved" | "declined" | "done";

export const IMPROVEMENT_STATUS_LABEL: Record<ImprovementStatus, string> = {
  new: "Recebida",
  reviewing: "Em avaliação",
  approved: "Aprovada",
  declined: "Não será feita",
  done: "Concluída",
};

export const IMPROVEMENT_STATUS_TONE: Record<ImprovementStatus, Tone> = {
  new: "info",
  reviewing: "warning",
  approved: "success",
  declined: "muted",
  done: "success",
};

export type AnalysisStatus = "pending" | "done" | "failed" | "skipped";

/** Análise devolvida pelo Claude (formato fixo, validado antes de gravar). */
export type ImprovementAnalysis = {
  resumo: string;
  fazSentido: "sim" | "parcial" | "nao";
  justificativa: string;
  quemSeBeneficia: string;
  jaExiste: string;
  impacto: "baixo" | "medio" | "alto";
  esforco: "pequeno" | "medio" | "grande";
  riscos: string[];
  perguntas: string[];
  recomendacao: string;
};

export const FAZ_SENTIDO_LABEL: Record<ImprovementAnalysis["fazSentido"], string> = { sim: "Faz sentido", parcial: "Faz sentido em parte", nao: "Não recomendada" };
export const IMPACTO_LABEL: Record<ImprovementAnalysis["impacto"], string> = { baixo: "Impacto baixo", medio: "Impacto médio", alto: "Impacto alto" };
export const ESFORCO_LABEL: Record<ImprovementAnalysis["esforco"], string> = { pequeno: "Esforço pequeno", medio: "Esforço médio", grande: "Esforço grande" };

/** JSON Schema da resposta (structured outputs): todos os campos obrigatórios. */
export const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "fazSentido", "justificativa", "quemSeBeneficia", "jaExiste", "impacto", "esforco", "riscos", "perguntas", "recomendacao"],
  properties: {
    resumo: { type: "string", description: "O pedido em uma ou duas frases, em linguagem simples." },
    fazSentido: { type: "string", enum: ["sim", "parcial", "nao"] },
    justificativa: { type: "string", description: "Por que faz (ou não) sentido para a operação." },
    quemSeBeneficia: { type: "string", description: "Quais perfis ganham com a melhoria (promotor, gestor, agência, cliente da agência, MCX)." },
    jaExiste: { type: "string", description: "Se o sistema já faz algo parecido, onde; senão, string vazia." },
    impacto: { type: "string", enum: ["baixo", "medio", "alto"] },
    esforco: { type: "string", enum: ["pequeno", "medio", "grande"] },
    riscos: { type: "array", items: { type: "string" }, description: "Efeitos colaterais: dados, desempenho no celular, uso offline, custos, segurança." },
    perguntas: { type: "array", items: { type: "string" }, description: "O que precisa ser esclarecido com quem pediu antes de decidir." },
    recomendacao: { type: "string", description: "Próximo passo sugerido para a MCX." },
  },
} as const;

const oneOf = <T extends string>(v: unknown, opts: readonly T[]): T | null => (opts.includes(v as T) ? (v as T) : null);
const text = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 500)).filter(Boolean).slice(0, 8) : []);

/** Confere a resposta do modelo; devolve null se faltar algo essencial. */
export function parseAnalysis(raw: unknown): ImprovementAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fazSentido = oneOf(r.fazSentido, ["sim", "parcial", "nao"] as const);
  const impacto = oneOf(r.impacto, ["baixo", "medio", "alto"] as const);
  const esforco = oneOf(r.esforco, ["pequeno", "medio", "grande"] as const);
  const resumo = text(r.resumo);
  if (!fazSentido || !impacto || !esforco || !resumo) return null;
  return {
    resumo,
    fazSentido,
    justificativa: text(r.justificativa),
    quemSeBeneficia: text(r.quemSeBeneficia),
    jaExiste: text(r.jaExiste),
    impacto,
    esforco,
    riscos: list(r.riscos),
    perguntas: list(r.perguntas),
    recomendacao: text(r.recomendacao),
  };
}

export const IMPROVEMENT_LIMITS = { title: 120, description: 3000, reply: 2000 };

export function checkImprovementInput(i: { title: string; description: string }): { ok: true } | { ok: false; error: string } {
  if (i.title.trim().length < 4) return { ok: false, error: "Dê um título curto para a melhoria." };
  if (i.description.trim().length < 10) return { ok: false, error: "Conte um pouco mais: o que você precisa e por quê." };
  return { ok: true };
}
