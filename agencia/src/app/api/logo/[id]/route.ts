/**
 * Logo da agência: para quem é da própria agência (painel, app do promotor)
 * ou da equipe MCX. A URL leva ?v= da última alteração, então pode ficar em cache.
 */
import { getSessionUser, unauthorized } from "@/server/auth";
import { agencyLogo } from "@/server/platform";

export async function GET(_request: Request, ctx: RouteContext<"/api/logo/[id]">) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Inválido" }, { status: 400 });
  if (!user.platform && user.agencyId !== id) return Response.json({ error: "Não encontrado" }, { status: 404 });
  const logo = await agencyLogo(id);
  if (!logo) return Response.json({ error: "Não encontrado" }, { status: 404 });
  return new Response(new Uint8Array(logo.bytes), {
    headers: { "Content-Type": logo.type, "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
