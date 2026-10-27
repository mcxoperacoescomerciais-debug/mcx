/** Acompanhamento ao vivo do mapa: onde cada promotor está agora e o que aconteceu hoje. */
import { getApiScope, unauthorized } from "@/server/auth";
import { liveOperations } from "@/server/map";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: Request) {
  const scope = await getApiScope(["admin", "manager"]);
  if (!scope) return unauthorized();
  const p = new URL(request.url).searchParams;
  const id = (k: string) => (UUID.test(p.get(k) ?? "") ? p.get(k) : null);
  const f = { brand: id("brand"), chain: id("chain"), store: id("store"), promoter: id("promoter"), city: p.get("city")?.slice(0, 80) || null };
  return Response.json(await liveOperations(scope, f), { headers: { "Cache-Control": "no-store" } });
}
