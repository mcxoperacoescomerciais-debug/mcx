/**
 * Vocabulário do domínio compartilhado entre cliente e servidor: tipos,
 * rótulos em português e cores de cada classificação. Mantido separado do
 * schema do banco para poder ser importado no navegador.
 */
export const SEVERITIES = ["expired", "critical", "high", "attention", "monitor", "normal"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  expired: "Vencido",
  critical: "Crítico",
  high: "Alto",
  attention: "Atenção",
  monitor: "Monitoramento",
  normal: "Normal",
};

/** Cores de status — reservadas para severidade em todo o sistema (app, gráficos e PDF). */
export const SEVERITY_COLOR: Record<Severity, { bg: string; fg: string; solid: string }> = {
  expired: { bg: "#FDE8E8", fg: "#8E1B1B", solid: "#B42318" },
  critical: { bg: "#FDECEC", fg: "#B42318", solid: "#E5484D" },
  high: { bg: "#FFF1E5", fg: "#9A4A00", solid: "#F07C1B" },
  attention: { bg: "#FFF8DB", fg: "#7A5B00", solid: "#E3B008" },
  monitor: { bg: "#E8F1FE", fg: "#1D4E9E", solid: "#3B82F6" },
  normal: { bg: "#E7F6EC", fg: "#1D6B3A", solid: "#2F9E5B" },
};

export const OCCURRENCE_TYPE_LABEL = {
  validity: "Validade",
  rupture: "Ruptura",
  damage: "Avaria",
} as const;
export type OccurrenceType = keyof typeof OCCURRENCE_TYPE_LABEL;

export const LOCATION_LABEL = {
  sales_floor: "Área de vendas",
  stock: "Estoque",
  cold_room: "Câmara fria",
  other: "Outro",
} as const;
export type Location = keyof typeof LOCATION_LABEL;

export const RUPTURE_KIND_LABEL = {
  total: "Ruptura total",
  partial: "Ruptura parcial",
  not_found: "Não localizado",
  empty_space: "Espaço vazio",
  no_stock: "Sem estoque",
} as const;
export type RuptureKind = keyof typeof RUPTURE_KIND_LABEL;

export const DAMAGE_KIND_LABEL = {
  damaged_package: "Embalagem danificada",
  crushed: "Produto amassado",
  leak: "Vazamento",
  violated: "Embalagem violada",
  unfit: "Produto impróprio",
  other: "Outro",
} as const;
export type DamageKind = keyof typeof DAMAGE_KIND_LABEL;

export const OCCURRENCE_STATUS_LABEL = {
  open: "Aberto",
  analyzing: "Em análise",
  resolved: "Resolvido",
  ignored: "Ignorado",
} as const;
export type OccurrenceStatus = keyof typeof OCCURRENCE_STATUS_LABEL;

export const ROLE_LABEL = {
  admin: "Administrador",
  agency_manager: "Gestor AF Merchandising",
  client_manager: "Gestor SUINCO",
  promoter: "Promotor",
} as const;
export type Role = keyof typeof ROLE_LABEL;

export const UNITS = ["un", "cx", "kg", "pct"] as const;
export type Unit = (typeof UNITS)[number];

/** Itens do checklist de visita (configurável por cliente). */
export interface ChecklistItem {
  key: string;
  label: string;
}

export const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { key: "sales_floor", label: "Verifiquei a área de vendas" },
  { key: "stock", label: "Verifiquei o estoque" },
  { key: "validity", label: "Conferi as validades" },
  { key: "rupture", label: "Conferi rupturas" },
  { key: "damage", label: "Conferi avarias" },
];

export const STORE_STATUS_LABEL = { normal: "Normal", attention: "Atenção", critical: "Crítica" } as const;
export type StoreHealth = keyof typeof STORE_STATUS_LABEL;

/** Formato/bandeira da loja dentro da rede — define qual planilha de mix vale para ela. */
export const STORE_FORMAT_LABEL = { varejo: "Varejo", plus: "Plus", cash: "Cash" } as const;
export type StoreFormat = keyof typeof STORE_FORMAT_LABEL;
