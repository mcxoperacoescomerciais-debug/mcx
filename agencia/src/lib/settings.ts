/**
 * Parâmetros operacionais da agência (tela Configurações). Guardados como JSON
 * em `agencies.settings` e sempre mesclados sobre os padrões abaixo — adicionar
 * um parâmetro novo nunca quebra dados antigos.
 *
 * Os padrões são as escolhas mais SEGURAS quando a agência ainda não decidiu.
 */
import { DEFAULT_ISSUE_PRIORITY, ISSUE_KINDS, type IssueKind } from "./domain";
import { DEFAULT_BANDS, type SeverityBands } from "./validity";

/** Alerta de validade crítica no WhatsApp da gestão (CallMeBot). Um por agência. */
export interface AlertSettings {
  /** Também avisa itens vencendo em até bulkDays dias com quantidade acima de bulkMinQty. */
  bulkDays: number;
  bulkMinQty: number;
  /** Números com DDI e chaves do CallMeBot, separados por vírgula na mesma ordem. */
  whatsappPhone: string;
  whatsappApiKey: string;
}

export interface AgencySettings {
  /** Gestor precisa aprovar/reprovar atendimentos concluídos. */
  requireApproval: boolean;
  /** Permite encerrar a visita com marca prevista pendente (exige justificativa). */
  allowIncompleteVisit: boolean;
  /** Permite ao promotor registrar visita extraordinária (fora da programação, em loja autorizada). */
  allowExtraVisits: boolean;
  /** Pede a localização do aparelho ao iniciar a visita (se o promotor permitir). */
  captureLocation: boolean;
  /** Permite exceção justificada para foto/estoque obrigatórios. */
  allowExceptions: boolean;
  /** Minutos de tolerância após o horário previsto antes de considerar a visita atrasada. */
  lateToleranceMin: number;
  /** Hora (HH:MM) em que o dia operacional termina: depois disso, o que não começou é "Não realizada". */
  dayEndsAt: string;
  /** Variação entre registros sucessivos de estoque considerada relevante (%). */
  stockDivergencePct: number;
  /** Prioridade de cada tipo de pendência (1 = mais urgente). */
  issuePriority: Record<IssueKind, number>;
  /** Faixas de validade (dias para vencer) — "Crítico até" também define o alerta. */
  validityBands: SeverityBands;
  alerts: AlertSettings;
}

export const DEFAULT_SETTINGS: AgencySettings = {
  requireApproval: false,
  allowIncompleteVisit: true,
  allowExtraVisits: true,
  captureLocation: true,
  allowExceptions: true,
  lateToleranceMin: 60,
  dayEndsAt: "20:00",
  stockDivergencePct: 50,
  issuePriority: DEFAULT_ISSUE_PRIORITY,
  validityBands: DEFAULT_BANDS,
  alerts: { bulkDays: 15, bulkMinQty: 15, whatsappPhone: "", whatsappApiKey: "" },
};

export function mergeSettings(raw: unknown): AgencySettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AgencySettings>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
  const priority = { ...DEFAULT_ISSUE_PRIORITY };
  for (const k of ISSUE_KINDS) priority[k] = num(r.issuePriority?.[k], DEFAULT_ISSUE_PRIORITY[k], 1, 9);
  return {
    requireApproval: bool(r.requireApproval, DEFAULT_SETTINGS.requireApproval),
    allowIncompleteVisit: bool(r.allowIncompleteVisit, DEFAULT_SETTINGS.allowIncompleteVisit),
    allowExtraVisits: bool(r.allowExtraVisits, DEFAULT_SETTINGS.allowExtraVisits),
    captureLocation: bool(r.captureLocation, DEFAULT_SETTINGS.captureLocation),
    allowExceptions: bool(r.allowExceptions, DEFAULT_SETTINGS.allowExceptions),
    lateToleranceMin: num(r.lateToleranceMin, DEFAULT_SETTINGS.lateToleranceMin, 0, 600),
    dayEndsAt: typeof r.dayEndsAt === "string" && /^\d{2}:\d{2}$/.test(r.dayEndsAt) ? r.dayEndsAt : DEFAULT_SETTINGS.dayEndsAt,
    stockDivergencePct: num(r.stockDivergencePct, DEFAULT_SETTINGS.stockDivergencePct, 5, 1000),
    issuePriority: priority,
    validityBands: {
      critical: num(r.validityBands?.critical, DEFAULT_BANDS.critical, 0, 365),
      high: num(r.validityBands?.high, DEFAULT_BANDS.high, 0, 365),
      attention: num(r.validityBands?.attention, DEFAULT_BANDS.attention, 0, 365),
      monitor: num(r.validityBands?.monitor, DEFAULT_BANDS.monitor, 0, 730),
    },
    alerts: {
      bulkDays: num(r.alerts?.bulkDays, DEFAULT_SETTINGS.alerts.bulkDays, 0, 365),
      bulkMinQty: num(r.alerts?.bulkMinQty, DEFAULT_SETTINGS.alerts.bulkMinQty, 0, 100_000),
      whatsappPhone: typeof r.alerts?.whatsappPhone === "string" ? r.alerts.whatsappPhone : "",
      whatsappApiKey: typeof r.alerts?.whatsappApiKey === "string" ? r.alerts.whatsappApiKey : "",
    },
  };
}
