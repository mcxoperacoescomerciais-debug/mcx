/**
 * Checagem otimista de rota (só lê o cookie, sem banco): quem não está logado
 * vai para o login e cada perfil vai para a sua área. A autorização de verdade
 * acontece em cada página/rota (requireRole / getApiScope + escopo).
 */
import { NextResponse, type NextRequest } from "next/server";
import { homeForRole, SESSION_COOKIE, verifySession } from "@/lib/session-token";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/" || pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(homeForRole(session.role), request.url));
    if (pathname === "/") return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (pathname.startsWith("/painel") && session.role === "promoter") return NextResponse.redirect(new URL("/app", request.url));
  if (pathname.startsWith("/app") && session.role !== "promoter") return NextResponse.redirect(new URL("/painel", request.url));
  // O layout do painel confere o acesso por página (perfis) a partir da rota.
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/", "/login", "/app/:path*", "/painel/:path*"],
};
