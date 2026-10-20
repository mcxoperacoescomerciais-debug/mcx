/**
 * Anexo de degustação (cronograma, comprovante, foto…) só para quem usa o painel
 * da agência. Não existe URL pública de arquivo.
 */
import { getApiScope, unauthorized } from "@/server/auth";
import { readTastingFile } from "@/server/tastings";
import { audit } from "@/server/audit";

export async function GET(request: Request, ctx: RouteContext<"/api/degustacoes/arquivos/[id]">) {
  const scope = await getApiScope(["admin", "manager"]);
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Inválido" }, { status: 400 });
  const r = await readTastingFile(scope, id);
  if (!r) return Response.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const inline = new URL(request.url).searchParams.get("inline") === "1" && /^(image\/|application\/pdf)/.test(r.file.contentType);
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "tasting_file", id, "downloaded");
  return new Response(Buffer.from(r.bytes), {
    headers: {
      "Content-Type": r.file.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(r.file.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
