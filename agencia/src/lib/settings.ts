/**
 * Parâmetros operacionais da agência (tela Configurações). Guardados como JSON
 * em `agencies.settings` e sempre mesclados sobre os padrões abaixo — adicionar
 * um parâmetro novo nunca quebra dados antigos.
 *
 * Os padrões são as escolhas mais SEGURAS quando a agência ainda não decidiu.
 */
import { DEFAULT_ISSUE_PRIORITY, ISSUE_KINDS, WORK_MODES, type IssueKind, type WorkMode } from "./domain";
import { DEFAULT_BANDS, type SeverityBands } from "./validity";

/** Alerta de validade crítica no WhatsApp da gestão (CallMeBot). Um por agência. */
export interface AlertSettings {
  /** Validade próxima: avisa tudo que vence em até nearDays dias, qualquer quantidade. */
  nearDays: number;
  /** Também avisa itens vencendo em até bulkDays dias com quantidade acima de bulkMinQty. */
  bulkDays: number;
  bulkMinQty: number;
  /** Números com DDI e chaves do CallMeBot, separados por vírgula na mesma ordem. */
  whatsappPhone: string;
  whatsappApiKey: string;
  /** Equipe MCX: este número também recebe o aviso semanal de armazenamento (fotos e banco). */
  storageReport: boolean;
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
  /** Forma de trabalho padrão dos promotores (cada promotor pode ter a sua no cadastro). */
  defaultWorkMode: WorkMode;
  /** Custo mensal padrão do promotor (preenche o cadastro de cada um; vazio = não informado). */
  promoterCost: PromoterCostDefaults;
}

export interface PromoterCostDefaults {
  salary: number | null;
  meal: number | null;
  fuel: number | null;
  other: number | null;
  /** Encargos da agência sobre o salário (%), só para vínculo fixo (CLT). */
  chargesPct: number;
}

/** FGTS 8% + 13º 8,33% + férias com 1/3 11,11% (empresa do Simples Nacional). Ajustável em Configurações. */
export const DEFAULT_CHARGES_PCT = 27.44;

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
  alerts: { nearDays: 7, bulkDays: 15, bulkMinQty: 15, whatsappPhone: "", whatsappApiKey: "", storageReport: false },
  defaultWorkMode: "route",
  promoterCost: { salary: null, meal: null, fuel: null, other: null, chargesPct: DEFAULT_CHARGES_PCT },
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
      nearDays: num(r.alerts?.nearDays, DEFAULT_SETTINGS.alerts.nearDays, 0, 365),
      bulkDays: num(r.alerts?.bulkDays, DEFAULT_SETTINGS.alerts.bulkDays, 0, 365),
      bulkMinQty: num(r.alerts?.bulkMinQty, DEFAULT_SETTINGS.alerts.bulkMinQty, 0, 100_000),
      whatsappPhone: typeof r.alerts?.whatsappPhone === "string" ? r.alerts.whatsappPhone : "",
      whatsappApiKey: typeof r.alerts?.whatsappApiKey === "string" ? r.alerts.whatsappApiKey : "",
      storageReport: bool(r.alerts?.storageReport, false),
    },
    defaultWorkMode: (WORK_MODES as readonly string[]).includes(r.defaultWorkMode as string) ? (r.defaultWorkMode as WorkMode) : DEFAULT_SETTINGS.defaultWorkMode,
    promoterCost: {
      salary: money(r.promoterCost?.salary),
      meal: money(r.promoterCost?.meal),
      fuel: money(r.promoterCost?.fuel),
      other: money(r.promoterCost?.other),
      chargesPct: typeof r.promoterCost?.chargesPct === "number" && Number.isFinite(r.promoterCost.chargesPct) ? Math.min(200, Math.max(0, Math.round(r.promoterCost.chargesPct * 100) / 100)) : DEFAULT_CHARGES_PCT,
    },
  };
}

function money(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1_000_000 ? Math.round(v * 100) / 100 : null;
}
