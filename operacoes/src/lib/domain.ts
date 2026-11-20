/** Vocabulário do MCX Operações: papéis, status, prioridades e origens. */

export const ROLES = ["owner", "gestor", "operacional"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { owner: "Dono", gestor: "Gestor", operacional: "Operacional" };

export const STATUSES = ["todo", "doing", "waiting", "approval", "done", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
  todo: "A fazer",
  doing: "Em andamento",
  waiting: "Aguardando retorno",
  approval: "Em aprovação",
  done: "Concluído",
  cancelled: "Cancelado",
};
export const OPEN_STATUSES: Status[] = ["todo", "doing", "waiting", "approval"];
export const isOpen = (s: Status) => OPEN_STATUSES.includes(s);

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const ORIGINS = ["manual", "whatsapp", "email", "meeting", "call", "routine", "system"] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_LABEL: Record<Origin, string> = {
  manual: "Manual",
  whatsapp: "WhatsApp",
  email: "E-mail",
  meeting: "Reunião",
  call: "Ligação",
  routine: "Rotina",
  system: "Sistema",
};

export const CLIENT_KINDS = ["agency", "rep", "internal"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];
export const CLIENT_KIND_LABEL: Record<ClientKind, string> = { agency: "Agência", rep: "Representante", internal: "Interno" };

export const INTERNAL_CLIENT_NAME = "Interno MCX";

/** As 9 categorias iniciais (editáveis pelo gestor depois). */
export const DEFAULT_CATEGORIES = [
  "Pedidos",
  "Roteiro e programação",
  "Fechamento e financeiro",
  "Relatórios para marcas",
  "Degustação",
  "Promotores e RH",
  "Implantação do app",
  "Comercial MCX",
  "Interno MCX",
] as const;

export const HISTORY_FIELD_LABEL: Record<string, string> = {
  status: "Status",
  assignee: "Responsável",
  dueDate: "Prazo",
  priority: "Prioridade",
  created: "Criação",
};

export const TIMEZONE = "America/Sao_Paulo";
