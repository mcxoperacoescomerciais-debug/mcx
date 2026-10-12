/**
 * Upload do arquivo de uma foto JÁ declarada no sync (o registro existe com
 * uploaded_at nulo). Idempotente pelo id gerado no celular. Recebe a foto
 * comprimida (≤1600px) e a miniatura (≤360px), ambas geradas no aparelho.
 */
import { and, eq } from "drizzle-orm";
import { getApiScope, unauthorized } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { photoKeys, storage } from "@/server/storage";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const thumb = form?.get("thumb");
  const id = String(form?.get("id") ?? "");
  if (!(file instanceof File) || !UUID.test(id)) return Response.json({ error: "Dados inválidos." }, { status: 400 });
  if (file.size > MAX_BYTES || !ALLOWED.has(file.type)) return Response.json({ error: "Arquivo inválido ou muito grande." }, { status: 400 });

  const db = await getDb();
  const [row] = await db
    .select({ photo: s.photos, visitId: s.visits.id, visitDate: s.visits.visitDate, promoterId: s.visits.promoterId })
    .from(s.photos)
    .innerJoin(s.attendances, eq(s.attendances.id, s.photos.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(eq(s.photos.id, id), eq(s.photos.agencyId, scope.agencyId)));
  // 409: a foto ainda não foi declarada (o sync do atendimento não chegou) — o app tenta de novo.
  if (!row) return Response.json({ error: "Foto ainda não registrada no servidor." }, { status: 409 });
  if (row.promoterId !== scope.userId) return Response.json({ error: "Sem permissão." }, { status: 403 });
  if (row.photo.uploadedAt) return Response.json({ ok: true });

  const keys = photoKeys(scope.agencyId, row.visitDate, row.visitId, row.photo.attendanceId, id);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage().put(keys.full, bytes, file.type);
  let thumbKey: string | null = null;
  if (thumb instanceof File && thumb.size > 0 && thumb.size < 1024 * 1024 && ALLOWED.has(thumb.type)) {
    await storage().put(keys.thumb, new Uint8Array(await thumb.arrayBuffer()), thumb.type);
    thumbKey = keys.thumb;
  }
  await db
    .update(s.photos)
    .set({
      uploadedAt: new Date(),
      storageKey: keys.full,
      thumbKey,
      contentType: file.type,
      bytes: bytes.byteLength,
      width: Number(form?.get("width")) || null,
      height: Number(form?.get("height")) || null,
      updatedAt: new Date(),
    })
    .where(eq(s.photos.id, id));
  return Response.json({ ok: true });
}
