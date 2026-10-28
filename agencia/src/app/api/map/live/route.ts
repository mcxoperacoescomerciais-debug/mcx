/** Acompanhamento ao vivo do mapa: onde cada promotor está agora e o que aconteceu hoje. */
import { getApiScope, unauthorized } from "@/server/auth";
import { liveOperations } from "@/server/map";
import { parseFilters } from "@/lib/filters";

export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  const scope = await getApiScope(["admin", "manager"]);
  if (!scope) return unauthorized();
  const p = new URL(request.url).searchParams;
  const { brand, chain, store, promoter, city } = parseFilters(Object.fromEntries(p));
  const f = { brand, chain, store, promoter, city };
  return Response.json(await liveOperations(scope, f), { headers: { "Cache-Control": "no-store" } });
}
