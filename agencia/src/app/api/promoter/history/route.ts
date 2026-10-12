import { getApiScope, unauthorized } from "@/server/auth";
import { promoterHistory } from "@/server/promoter";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  return Response.json(await promoterHistory(scope), { headers: { "Cache-Control": "no-store" } });
}
