/**
 * Upload de foto de ocorrência. Idempotente pelo `id` gerado no celular: se a
 * conexão cair depois do upload e o app reenviar, nada é duplicado.
 */
import { and, eq } from "drizzle-orm";
import { getApiScope, unauthorized } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { photoKey, storage } from "@/server/storage";

const MAX_BYTES = 6 * 1024 * 1024;
// O celular já converte tudo para JPEG; PNG é aceito para imagens que não puderam ser convertidas.
const ALLOWED = new Set(["image/jpeg", "image/png"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const scope = await getApiScope(["promoter"]);
  if (!scope) return unauthorized();

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const id = String(form?.get("id") ?? "");
  const visitId = String(form?.get("visitId") ?? "");
  const occurrenceId = String(form?.get("occurrenceId") ?? "") || null;
  if (!(file instanceof File) || !UUID.test(id) || !UUID.test(visitId) || (occurrenceId && !UUID.test(occurrenceId))) {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (file.size > MAX_BYTES || !ALLOWED.has(file.type)) {
    return Response.json({ error: "Arquivo inválido ou muito grande." }, { status: 400 });
  }

  const db = await getDb();
  const [already] = await db.select({ id: s.occurrencePhotos.id }).from(s.occurrencePhotos).where(eq(s.occurrencePhotos.id, id));
  if (already) return Response.json({ ok: true });

  const [visit] = await db
    .select()
    .from(s.visits)
    .where(and(eq(s.visits.id, visitId), eq(s.visits.promoterId, scope.userId), eq(s.visits.clientId, scope.clientId)));
  // 409: a visita ainda não chegou ao servidor — o app tenta de novo depois do sync.
  if (!visit) return Response.json({ error: "Visita ainda não sincronizada." }, { status: 409 });
  if (occurrenceId) {
    const [occ] = await db
      .select({ id: s.occurrences.id })
      .from(s.occurrences)
      .where(and(eq(s.occurrences.id, occurrenceId), eq(s.occurrences.visitId, visitId)));
    if (!occ) return Response.json({ error: "Item ainda não sincronizado." }, { status: 409 });
  }

  const key = photoKey(scope.tenantId, scope.clientId, visit.visitDate, visitId, id);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage().put(key, bytes, file.type);
  await db
    .insert(s.occurrencePhotos)
    .values({
      id,
      tenantId: scope.tenantId,
      clientId: scope.clientId,
      visitId,
      occurrenceId,
      storageKey: key,
      contentType: file.type,
      bytes: bytes.byteLength,
      width: Number(form?.get("width")) || null,
      height: Number(form?.get("height")) || null,
      createdBy: scope.userId,
    })
    .onConflictDoNothing();
  return Response.json({ ok: true });
}
