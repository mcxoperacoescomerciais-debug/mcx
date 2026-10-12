/**
 * Entrega uma foto (ou a miniatura com ?size=thumb) somente para quem pode vê-la:
 * o próprio promotor, ou gestor/admin com a marca e o promotor no escopo.
 * Não existe URL pública de arquivo.
 */
import { and, eq } from "drizzle-orm";
import { getApiScope, unauthorized, forbidden } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { canSeeBrand, canSeePromoter } from "@/server/scope";
import { storage } from "@/server/storage";
import { audit } from "@/server/audit";

export async function GET(request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const scope = await getApiScope();
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Inválido" }, { status: 400 });
  const url = new URL(request.url);
  const wantThumb = url.searchParams.get("size") === "thumb";
  const download = url.searchParams.get("download") === "1";

  const db = await getDb();
  const [row] = await db
    .select({ photo: s.photos, brandId: s.attendances.brandId, promoterId: s.visits.promoterId })
    .from(s.photos)
    .innerJoin(s.attendances, eq(s.attendances.id, s.photos.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(eq(s.photos.id, id), eq(s.photos.agencyId, scope.agencyId)));
  if (!row) return Response.json({ error: "Não encontrada" }, { status: 404 });
  const allowed = scope.role === "promoter" ? row.promoterId === scope.userId : canSeeBrand(scope, row.brandId) && canSeePromoter(scope, row.promoterId);
  if (!allowed) return forbidden();
  if (!row.photo.storageKey) return Response.json({ error: "Foto aguardando sincronização." }, { status: 404 });

  const key = wantThumb && row.photo.thumbKey ? row.photo.thumbKey : row.photo.storageKey;
  const bytes = await storage().get(key);
  if (!bytes) return Response.json({ error: "Arquivo indisponível" }, { status: 404 });
  if (download) await audit({ agencyId: scope.agencyId, userId: scope.userId }, "photo", id, "downloaded");
  // Miniatura e original têm o mesmo formato (o aparelho gera as duas em JPEG).
  const type = row.photo.contentType ?? "image/jpeg";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "private, max-age=86400, immutable",
      ...(download ? { "Content-Disposition": `attachment; filename="evidencia-${id.slice(0, 8)}.${type === "image/png" ? "png" : "jpg"}"` } : {}),
    },
  });
}
