/** Menu do MCX Operações. Cada rota precisa de uma capacidade registrada (teste). */
import type { Action } from "./permissions";

export interface NavItem {
  href: string;
  label: string;
  /** Permissão exigida (ausente = todos os perfis). */
  needs?: Action;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Minha fila" },
  { href: "/painel", label: "Painel" },
  { href: "/demandas", label: "Lista da equipe" },
  { href: "/kanban", label: "Kanban" },
  { href: "/meu-dia", label: "Meu dia" },
  { href: "/comercial", label: "Comercial", needs: "crm.view" },
  { href: "/equipe", label: "Equipe", needs: "team.view" },
  { href: "/relatorios", label: "Relatórios", needs: "report.view" },
  { href: "/rotinas", label: "Rotinas", needs: "routine.manage" },
  { href: "/checklists", label: "Checklists" },
  { href: "/estoque", label: "Estoque", needs: "stock.view" },
  { href: "/contratantes", label: "Contratantes", needs: "client.view" },
  { href: "/contratos", label: "Contratos", needs: "contract.view" },
  { href: "/documentos", label: "Documentos", needs: "document.view" },
  { href: "/config/categorias", label: "Categorias e tipos", needs: "category.edit" },
  { href: "/config/importar-notion", label: "Importar do Notion", needs: "import.run" },
  { href: "/config/usuarios", label: "Usuários", needs: "user.manage" },
  { href: "/manual", label: "Manual" },
];
