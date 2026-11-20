/**
 * Checagem otimista (só lê o cookie do Operações, sem banco). A autorização de
 * verdade acontece em cada página (requireUser) e em cada action (actionUser).
 * OPS_ENABLED=false desliga o sistema inteiro sem afetar mais nada.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

const PUBLIC = ["/entrar", "/sair", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (process.env.OPS_ENABLED === "false" && pathname !== "/api/health") {
    return new NextResponse("MCX Operações está desligado no momento.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL("/entrar", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
