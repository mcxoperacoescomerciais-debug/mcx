import "server-only";
import { headers } from "next/headers";

/** Endereço público do escopo, a partir do domínio em que o painel está aberto. */
export async function scopeUrl(token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/escopo/${token}`;
}
