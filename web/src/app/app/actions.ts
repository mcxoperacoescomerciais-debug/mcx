"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getSessionUser, hashPassword, logout, verifyPassword } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { audit } from "@/server/audit";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/lib/session-token";

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

/**
 * Troca a própria senha. Incrementa session_version (derruba sessões em
 * outros aparelhos) e reemite o cookie deste aparelho para não deslogar.
 */
export async function changePasswordAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sessão expirada." };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 6) return { ok: false, error: "A nova senha precisa ter pelo menos 6 caracteres." };
  const db = await getDb();
  const [row] = await db.select().from(s.users).where(eq(s.users.id, user.id));
  if (!(await verifyPassword(current, row.passwordHash))) return { ok: false, error: "Senha atual incorreta." };
  const sessionVersion = row.sessionVersion + 1;
  await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(next), sessionVersion, updatedAt: new Date(), updatedBy: user.id })
    .where(eq(s.users.id, user.id));
  const token = await signSession({ uid: user.id, tid: user.tenantId, role: user.role, sv: sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  await audit({ tenantId: user.tenantId, userId: user.id }, "user", user.id, "password_change");
  return { ok: true };
}
