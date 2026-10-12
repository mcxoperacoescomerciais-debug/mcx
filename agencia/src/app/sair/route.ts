/**
 * Encerra a sessão e volta ao login. Usada quando o cookie existe mas não é
 * mais válido (usuário desativado, senha trocada em outro aparelho): o proxy
 * só confere a assinatura, então sem limpar o cookie haveria loop entre
 * /login e a área logada.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-token";

export function GET() {
  // Redirecionamento relativo: atrás do proxy do Render, request.url aponta para
  // o endereço interno (localhost:10000), não para o domínio público.
  const res = new NextResponse(null, { status: 307, headers: { Location: "/login" } });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
