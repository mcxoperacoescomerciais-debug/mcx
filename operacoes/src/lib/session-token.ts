/**
 * Token de sessão do MCX Operações (JWT HS256 em cookie httpOnly próprio).
 * Cookie, segredo e emissor são diferentes dos do MCX Campo: um cookie do
 * Campo nunca abre o Operações. Sem acesso ao banco — pode ser usado no proxy.
 */
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "./domain";

export const SESSION_COOKIE = "ops_session";
export const SESSION_DAYS = 30;
const ISSUER = "mcx-operacoes";

export interface SessionPayload {
  uid: string;
  role: Role;
  /** session_version do usuário no momento do login. */
  sv: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET não configurado.");
    return new TextEncoder().encode("ops-dev-only-secret-change-me-0123456789abcdef");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], issuer: ISSUER });
    if (typeof payload.uid !== "string" || typeof payload.sv !== "number") return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
