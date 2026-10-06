import { getApiScope, unauthorized } from "@/server/auth";
import { syncVisit } from "@/server/promoter";
import { syncRequest } from "@/lib/sync-types";

export async function POST(request: Request) {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  const parsed = syncRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Dados inválidos.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const results = [];
  for (const visit of parsed.data.visits) results.push(await syncVisit(scope, visit));
  return Response.json({ results });
}
