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
  "time.viewAll", // vê e corrige horas de qualquer pessoa
  "team.view", // painel da equipe
  "report.view", // relatórios de horas e capacidade
  "cost.view", // custo/hora e valor de contrato
  "routine.manage",
  "template.manage",
  "crm.view", // Comercial: leads, funil e follow-up (dono e gestor)
  "stock.view", // estoque dos clientes: saldos e extratos
  "stock.move", // registrar entrada, saída, devolução e contagem
  "stock.manage", // itens, mínimos, ajustes, perdas e equipamentos
  "contract.view", // contratos e valores (gestor e dono)
  "contract.manage",
  "document.view", // documentos não restritos
  "document.upload",
  "document.restricted", // lê e envia documentos restritos (contrato, documento de promotor)
  "document.manage", // edita dados e exclui documentos
  "import.run", // importação do Notion (gestor e dono)
  "assistant.use", // Assistente MCX (o dono ainda libera pessoa por pessoa)
  "assistant.manage", // liga/desliga, modelo, limites e painel de uso do Assistente (dono)
  "crm.manage", // etapas do funil, meta diária e aprovação de modelos de mensagem (dono)
] as const;
export type Action = (typeof ACTIONS)[number];

const GESTOR: Action[] = ["demand.create", "demand.viewAll", "demand.assign", "demand.reopen", "demand.delete", "client.view", "client.edit", "category.edit", "time.viewAll", "team.view", "report.view", "cost.view", "routine.manage", "template.manage", "crm.view", "stock.view", "stock.move", "stock.manage", "contract.view", "contract.manage", "document.view", "document.upload", "document.restricted", "document.manage", "import.run", "assistant.use"];

export const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  owner: ACTIONS,
  gestor: GESTOR,
  operacional: ["demand.create", "client.view", "stock.view", "stock.move", "document.view", "document.upload", "assistant.use"],
};

export function can(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role]?.includes(action) ?? false;
}
