import { getApiScope, unauthorized } from "@/server/auth";
import { getBootstrap } from "@/server/promoter";

export async function GET() {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  return Response.json(await getBootstrap(scope), { headers: { "Cache-Control": "no-store" } });
}
