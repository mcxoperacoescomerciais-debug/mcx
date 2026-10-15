/**
 * Painéis do sistema que cada perfil pode acessar.
 *
 * - Gestor da agência (role "admin"): todos marcados por padrão; pode ter menos.
 * - Supervisor (role "manager"): o dono/gestor marca manualmente o que ele vê.
 * - Promotor: só o app de atendimento (nenhum painel).
 * - Equipe MCX (Dono e Master): tudo.
 * `permissions` null = padrão do perfil (compatível com usuários antigos).
 */
import type { Role } from "./domain";

export interface Panel {
  key: string;
  label: string;
  group: "Operação" | "Planejamento" | "Cadastros" | "Administração";
  paths: string[];
  /** Só o Gestor da agência pode ter (cadastros e administração). */
  adminOnly?: boolean;
}

export const PANELS: Panel[] = [
  { key: "visao_geral", label: "Visão geral", group: "Operação", paths: ["/painel"] },
  { key: "mapa", label: "Mapa operacional", group: "Operação", paths: ["/painel/mapa"] },
  { key: "visitas", label: "Visitas", group: "Operação", paths: ["/painel/visitas", "/painel/lojas"] },
  { key: "marcas", label: "Atendimentos por marca", group: "Operação", paths: ["/painel/marcas", "/painel/atendimentos"] },
  { key: "fotos", label: "Relatório fotográfico e Book", group: "Operação", paths: ["/painel/fotos"] },
  { key: "estoque", label: "Estoque, ruptura, validade e avaria", group: "Operação", paths: ["/painel/estoque", "/painel/rupturas", "/painel/validades", "/painel/avarias"] },
  { key: "promotores", label: "Promotores", group: "Operação", paths: ["/painel/promotores"] },
  { key: "pendencias", label: "Central de pendências", group: "Operação", paths: ["/painel/pendencias"] },
  { key: "metas", label: "Carteira e metas", group: "Planejamento", paths: ["/painel/metas"] },
  { key: "programacao", label: "Programação", group: "Planejamento", paths: ["/painel/programacao"] },
  { key: "roteiros", label: "Roteiros", group: "Planejamento", paths: ["/painel/roteiros"] },
  { key: "exportacoes", label: "Exportações", group: "Planejamento", paths: ["/painel/relatorios"] },
  { key: "cad_marcas", label: "Marcas", group: "Cadastros", paths: ["/painel/cadastros/marcas"], adminOnly: true },
  { key: "cad_lojas", label: "Redes e lojas", group: "Cadastros", paths: ["/painel/cadastros/lojas"], adminOnly: true },
  { key: "cad_produtos", label: "Produtos", group: "Cadastros", paths: ["/painel/cadastros/produtos"], adminOnly: true },
  { key: "usuarios", label: "Usuários e perfis", group: "Cadastros", paths: ["/painel/cadastros/usuarios"], adminOnly: true },
  { key: "importar", label: "Importar planilha", group: "Cadastros", paths: ["/painel/cadastros/importar"], adminOnly: true },
  { key: "configuracoes", label: "Configurações", group: "Administração", paths: ["/painel/configuracoes"], adminOnly: true },
  { key: "auditoria", label: "Auditoria", group: "Administração", paths: ["/painel/auditoria"], adminOnly: true },
];

export const PANEL_KEYS = PANELS.map((p) => p.key);

/** Painéis que o perfil pode receber. */
export function panelsForRole(role: Role): Panel[] {
  if (role === "promoter") return [];
  return role === "admin" ? PANELS : PANELS.filter((p) => !p.adminOnly);
}

/** Padrão ao escolher o perfil: Gestor = todos; Supervisor = nenhum (marcar manualmente). */
export function defaultPermissions(role: Role): string[] {
  return role === "admin" ? PANEL_KEYS : [];
}

/** Painel de uma rota (o mais específico). */
export function panelForPath(pathname: string): Panel | null {
  let best: Panel | null = null;
  let len = -1;
  for (const p of PANELS)
    for (const path of p.paths) {
      const match = path === "/painel" ? pathname === "/painel" : pathname === path || pathname.startsWith(path + "/");
      if (match && path.length > len) {
        best = p;
        len = path.length;
      }
    }
  return best;
}

/** Lista efetiva do usuário (null = padrão do perfil: tudo o que o perfil permite). */
export function effectivePermissions(role: Role, permissions: string[] | null | undefined): Set<string> {
  const allowed = new Set(panelsForRole(role).map((p) => p.key));
  if (!permissions) return allowed;
  return new Set(permissions.filter((k) => allowed.has(k)));
}

export const AGENCY_ROLE_LABEL: Record<Role, string> = { admin: "Gestor da agência", manager: "Supervisor", promoter: "Promotor" };
export const PLATFORM_ROLE_LABEL = { owner: "Dono", master: "Master" } as const;
export type PlatformRole = keyof typeof PLATFORM_ROLE_LABEL;
