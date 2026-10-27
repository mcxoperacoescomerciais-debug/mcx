/**
 * Sinal do app do promotor (a cada atualização com o app aberto): marca online,
 * informa se a localização está liberada e, se estiver, a posição atual.
 */
import { getApiScope, unauthorized } from "@/server/auth";
import { promoterHeartbeat } from "@/server/map";

export async function POST(request: Request) {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  const b = (await request.json().catch(() => null)) as { permission?: unknown; lat?: unknown; lng?: unknown; accuracy?: unknown } | null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  await promoterHeartbeat(scope.userId, { permission: typeof b?.permission === "string" ? b.permission : "", lat: num(b?.lat), lng: num(b?.lng), accuracy: num(b?.accuracy) });
  return Response.json({ ok: true });
}
