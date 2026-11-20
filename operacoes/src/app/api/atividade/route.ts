/**
 * Sinal de "tempo no sistema". O navegador só envia com a aba visível e
 * interação nos últimos 5 minutos. Não recebe nem guarda conteúdo, tela ou URL.
 */
import { getSessionUser } from "@/server/auth";
import { heartbeat } from "@/server/time";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  await heartbeat(user.id);
  return new Response(null, { status: 204 });
}
