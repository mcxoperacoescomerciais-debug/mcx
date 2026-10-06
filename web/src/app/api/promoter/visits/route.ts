import { getApiScope, unauthorized } from "@/server/auth";
import { listPromoterVisits } from "@/server/promoter";

export async function GET() {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  return Response.json(await listPromoterVisits(scope), { headers: { "Cache-Control": "no-store" } });
}
