import { NextResponse, type NextRequest } from "next/server";
import { logout } from "@/server/auth";

export async function GET(request: NextRequest) {
  await logout();
  return NextResponse.redirect(new URL("/entrar", request.url));
}
