/**
 * Recebe as visitas do aparelho. Idempotente: o mesmo envio repetido (sinal
 * caiu antes da resposta) não duplica nada, porque tudo usa o UUID gerado no
 * celular. Cada visita/atendimento tem resultado próprio.
 */
import { getApiScope, unauthorized } from "@/server/auth";
import { applySync } from "@/server/promoter";
import { syncRequest } from "@/lib/sync-types";

export async function POST(request: Request) {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  const body = await request.json().catch(() => null);
  const parsed = syncRequest.safeParse(body);
  if (!parsed.success) {
    console.warn("[sync] payload inválido", parsed.error.issues.slice(0, 3));
    return Response.json({ error: "Dados inválidos.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const results = await applySync(scope, parsed.data.visits);
  return Response.json({ results, serverTime: new Date().toISOString() });
}
