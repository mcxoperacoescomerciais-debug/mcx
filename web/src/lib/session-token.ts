/**
 * Token de sessão (JWT HS256 em cookie httpOnly). Este módulo não acessa o
 * banco, então pode ser usado no proxy.ts para a checagem otimista de rota.
 * A validação completa (usuário ativo, sessão não revogada) fica em
 * src/server/auth.ts.
 */
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "./domain";

export const SESSION_COOKIE = "mcx_session";
export const SESSION_DAYS = 30;

export interface SessionPayload {
  uid: string;
  tid: string;
  role: Role;
  /** session_version do usuário no momento do login. */
  sv: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET não configurado.");
    return new TextEncoder().encode("dev-only-secret-change-me-in-production-0123456789");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function homeForRole(role: Role): string {
  return role === "promoter" ? "/app" : "/painel";
}
