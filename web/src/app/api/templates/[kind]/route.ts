/** Modelo de planilha (CSV) para importação de lojas ou promotores. */
import { getApiScope, MANAGER_ROLES, unauthorized } from "@/server/auth";
import { TEMPLATES, type ImportKind } from "@/server/import/tabular";

const EXAMPLES: Record<ImportKind, string[]> = {
  lojas: ["Super ABC", "varejo", "ABC Formiga", "63", "Formiga", "MG", "Rua Exemplo, 100", "joao", "-20.4644", "-45.4266"],
  promotores: ["Maria Souza", "maria.souza", "trocar123", "(37) 99999-0000", "maria@exemplo.com", "000.000.000-00"],
};

export async function GET(_req: Request, ctx: RouteContext<"/api/templates/[kind]">) {
  if (!(await getApiScope(MANAGER_ROLES))) return unauthorized();
  const { kind } = await ctx.params;
  if (!(kind in TEMPLATES)) return new Response("Modelo inexistente", { status: 404 });
  const k = kind as ImportKind;
  const csv = [TEMPLATES[k].join(";"), EXAMPLES[k].join(";")].join("\r\n");
  return new Response(`﻿${csv}`, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="modelo_${k}.csv"` },
  });
}
