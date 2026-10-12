/** Troca da própria senha. Derruba as outras sessões (session_version + 1). */
import { eq, sql } from "drizzle-orm";
import { getApiScope, hashPassword, unauthorized, verifyPassword } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { audit } from "@/server/audit";

export async function POST(request: Request) {
  const scope = await getApiScope();
  if (!scope) return unauthorized();
  // Promotor não troca a própria senha: o acesso é definido pela agência.
  if (scope.role === "promoter") return Response.json({ error: "A senha do promotor é definida pela agência." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { current?: string; next?: string };
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");
  if (!next || next.length > 100) return Response.json({ error: "Informe a nova senha (até 100 caracteres)." }, { status: 400 });
  const db = await getDb();
  const [user] = await db.select().from(s.users).where(eq(s.users.id, scope.userId));
  if (!user || !(await verifyPassword(current, user.passwordHash))) return Response.json({ error: "Senha atual incorreta." }, { status: 400 });
  await db
    .update(s.users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, sessionVersion: sql`${s.users.sessionVersion} + 1`, updatedAt: new Date() })
    .where(eq(s.users.id, user.id));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "user", user.id, "password_changed");
  return Response.json({ ok: true });
}
