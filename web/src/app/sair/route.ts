/**
 * Encerra a sessão e volta ao login. Usada quando o cookie existe mas não é
 * mais válido (usuário desativado, senha trocada em outro aparelho): o
 * proxy só confere a assinatura, então sem limpar o cookie haveria loop
 * entre /login e a área logada.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-token";

export function GET(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
