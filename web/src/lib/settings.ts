/**
 * Parâmetros configuráveis por cliente (tela Configurações). Guardados como
 * JSON em `client_settings.settings` e sempre mesclados sobre os padrões abaixo,
 * então adicionar um parâmetro novo nunca quebra clientes antigos.
 */
import { DEFAULT_CHECKLIST, type ChecklistItem } from "./domain";
import { DEFAULT_BANDS, type SeverityBands } from "./validity";

export interface CriticalityWeights {
  expired: number;
  critical: number;
  high: number;
  attention: number;
  rupture: number;
  damage: number;
}

export interface ClientSettings {
  bands: SeverityBands;
  weights: CriticalityWeights;
  /** Índice da loja a partir do qual ela é "Atenção" / "Crítica". */
  storeThresholds: { attention: number; critical: number };
  checklist: ChecklistItem[];
  /** Loja ativa sem visita há mais que isso gera alerta. */
  staleVisitDays: number;
  /** Janela em que o promotor ainda pode editar a própria visita finalizada. */
  promoterEditHours: number;
}

export const DEFAULT_SETTINGS: ClientSettings = {
  bands: DEFAULT_BANDS,
  weights: { expired: 10, critical: 5, high: 3, attention: 1, rupture: 3, damage: 2 },
  storeThresholds: { attention: 10, critical: 25 },
  checklist: DEFAULT_CHECKLIST,
  staleVisitDays: 7,
  promoterEditHours: 24,
};

export function mergeSettings(stored: unknown): ClientSettings {
  const s = (stored ?? {}) as Partial<ClientSettings>;
  return {
    bands: { ...DEFAULT_SETTINGS.bands, ...(s.bands ?? {}) },
    weights: { ...DEFAULT_SETTINGS.weights, ...(s.weights ?? {}) },
    storeThresholds: { ...DEFAULT_SETTINGS.storeThresholds, ...(s.storeThresholds ?? {}) },
    checklist: s.checklist?.length ? s.checklist : DEFAULT_SETTINGS.checklist,
    staleVisitDays: s.staleVisitDays ?? DEFAULT_SETTINGS.staleVisitDays,
    promoterEditHours: s.promoterEditHours ?? DEFAULT_SETTINGS.promoterEditHours,
  };
}
