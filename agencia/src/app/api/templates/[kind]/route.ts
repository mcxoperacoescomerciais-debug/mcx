import { getApiScope, unauthorized } from "@/server/auth";
import { templateWorkbook, TEMPLATES, type ImportKind } from "@/server/import";
import { xlsxResponse } from "@/server/xlsx";

export async function GET(_request: Request, ctx: RouteContext<"/api/templates/[kind]">) {
  const scope = await getApiScope(["admin"]);
  if (!scope) return unauthorized();
  const { kind } = await ctx.params;
  if (!(kind in TEMPLATES)) return new Response("Modelo inexistente", { status: 404 });
  return xlsxResponse(await templateWorkbook(kind as ImportKind), `modelo_${kind}.xlsx`);
}
