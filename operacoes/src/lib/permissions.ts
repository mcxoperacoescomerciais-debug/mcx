/**
 * Permissões internas: um mapa papel → ações. Papel novo = uma linha nova aqui;
 * nenhuma tela ou função confere o nome do papel diretamente.
 */
import type { Role } from "./domain";

export const ACTIONS = [
  "demand.create",
  "demand.viewAll", // vê e edita demandas de qualquer pessoa
  "demand.assign", // troca o responsável de uma demanda existente
  "demand.reopen",
  "demand.delete",
  "client.view",
  "client.edit",
  "category.edit",
  "user.manage",
] as const;
export type Action = (typeof ACTIONS)[number];

const GESTOR: Action[] = ["demand.create", "demand.viewAll", "demand.assign", "demand.reopen", "demand.delete", "client.view", "client.edit", "category.edit"];

export const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  owner: ACTIONS,
  gestor: GESTOR,
  operacional: ["demand.create", "client.view"],
};

export function can(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role]?.includes(action) ?? false;
}
