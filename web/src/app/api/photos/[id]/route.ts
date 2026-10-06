/** Entrega uma foto só para quem pode ver a visita dela (bucket é privado). */
import { eq } from "drizzle-orm";
import { getApiScope, unauthorized } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { storage } from "@/server/storage";
import { canAccessVisit } from "@/server/visits";

export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const scope = await getApiScope();
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  const db = await getDb();
  const [photo] = await db.select().from(s.occurrencePhotos).where(eq(s.occurrencePhotos.id, id));
  if (!photo || !(await canAccessVisit(scope, photo.visitId))) return new Response("Não encontrado", { status: 404 });
  const bytes = await storage().get(photo.storageKey);
  if (!bytes) return new Response("Não encontrado", { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=86400" },
  });
}
