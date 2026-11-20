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
  { href: "/demandas", label: "Lista da equipe" },
  { href: "/kanban", label: "Kanban" },
  { href: "/contratantes", label: "Contratantes", needs: "client.view" },
  { href: "/config/categorias", label: "Categorias", needs: "category.edit" },
  { href: "/config/usuarios", label: "Usuários", needs: "user.manage" },
  { href: "/manual", label: "Manual" },
];
