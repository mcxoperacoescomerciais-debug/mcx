/** Acompanhamento ao vivo do mapa: onde cada promotor está agora e o que aconteceu hoje. */
import { getApiScope, unauthorized } from "@/server/auth";
import { liveOperations } from "@/server/map";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getApiScope(["admin", "manager"]);
  if (!scope) return unauthorized();
  return Response.json(await liveOperations(scope), { headers: { "Cache-Control": "no-store" } });
}
