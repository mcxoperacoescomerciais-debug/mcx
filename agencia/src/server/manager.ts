/**
 * Ações do gestor sobre registros de campo. Toda ação confere o escopo,
 * valida a transição, grava responsável e horário e preserva o histórico.
 */
import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import { canSeeBrand, canSeePromoter, isStaff } from "./scope";
import type { IssueReviewStatus } from "@/lib/domain";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });

async function loadAttendance(scope: Scope, attendanceId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ a: s.attendances, promoterId: s.visits.promoterId })
    .from(s.attendances)
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(eq(s.attendances.id, attendanceId), eq(s.attendances.agencyId, scope.agencyId)));
  if (!row || !canSeeBrand(scope, row.a.brandId) || !canSeePromoter(scope, row.promoterId)) return null;
  return row;
}

/** Retrato completo do atendimento, guardado no pedido de correção (o original nunca se perde). */
async function snapshot(attendanceId: string) {
  const db = await getDb();
  const [a] = await db.select().from(s.attendances).where(eq(s.attendances.id, attendanceId));
  const [stock, ruptures, photos, occurrences] = await Promise.all([
    db.select().from(s.stockEntries).where(eq(s.stockEntries.attendanceId, attendanceId)),
    db.select().from(s.ruptures).where(and(eq(s.ruptures.attendanceId, attendanceId), isNull(s.ruptures.deletedAt))),
    db.select({ id: s.photos.id, kind: s.photos.kind, uploadedAt: s.photos.uploadedAt }).from(s.photos).where(and(eq(s.photos.attendanceId, attendanceId), isNull(s.photos.deletedAt))),
    db.select().from(s.occurrences).where(and(eq(s.occurrences.attendanceId, attendanceId), isNull(s.occurrences.deletedAt))),
  ]);
  return JSON.parse(JSON.stringify({ attendance: a, stock, ruptures, photos, occurrences }));
}

export async function requestCorrection(scope: Scope, attendanceId: string, reason: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const text = reason.trim();
  if (text.length < 10) return fail("Descreva o que precisa ser corrigido (mínimo 10 caracteres).");
  const row = await loadAttendance(scope, attendanceId);
  if (!row) return fail("Atendimento não encontrado.");
  // Reenvio (duplo clique, rede lenta): o pedido já foi gravado — não é erro.
  if (row.a.status === "correction_requested") return { ok: true, message: "Correção solicitada. O promotor verá o pedido no app." };
  if (row.a.status !== "completed") return fail("Só é possível pedir correção de atendimento concluído.");
  const db = await getDb();
  const snap = await snapshot(attendanceId);
  await db.transaction(async (tx) => {
    await tx.insert(s.correctionRequests).values({ agencyId: scope.agencyId, attendanceId, reason: text, requestedBy: scope.userId, snapshot: snap });
    await tx.update(s.attendances).set({ status: "correction_requested", updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.attendances.id, attendanceId));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "attendance", attendanceId, "correction_requested", { before: { status: "completed" }, after: { status: "correction_requested" }, reason: text }, tx);
  });
  return { ok: true, message: "Correção solicitada. O promotor verá o pedido no app." };
}

export async function cancelCorrection(scope: Scope, attendanceId: string, reason: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const row = await loadAttendance(scope, attendanceId);
  if (!row || row.a.status !== "correction_requested") return fail("Não há correção aberta.");
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(s.correctionRequests).set({ status: "cancelled", answeredAt: new Date(), answeredBy: scope.userId }).where(and(eq(s.correctionRequests.attendanceId, attendanceId), eq(s.correctionRequests.status, "open")));
    await tx.update(s.attendances).set({ status: "completed", updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.attendances.id, attendanceId));
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "attendance", attendanceId, "correction_cancelled", { reason: reason.trim() || null }, tx);
  });
  return { ok: true, message: "Pedido de correção cancelado." };
}

export async function reviewAttendance(scope: Scope, attendanceId: string, decision: "approved" | "rejected", note: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const row = await loadAttendance(scope, attendanceId);
  if (!row) return fail("Atendimento não encontrado.");
  if (row.a.status !== "completed") return fail("Só atendimentos concluídos podem ser avaliados.");
  if (decision === "rejected" && note.trim().length < 5) return fail("Explique o motivo da reprovação.");
  const db = await getDb();
  await db
    .update(s.attendances)
    .set({ reviewStatus: decision, reviewNote: note.trim() || null, reviewedBy: scope.userId, reviewedAt: new Date() })
    .where(eq(s.attendances.id, attendanceId));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "attendance", attendanceId, decision === "approved" ? "approved" : "rejected", { before: { reviewStatus: row.a.reviewStatus }, after: { reviewStatus: decision }, reason: note.trim() || null });
  return { ok: true, message: decision === "approved" ? "Atendimento aprovado." : "Atendimento reprovado." };
}

export async function reviewIssue(scope: Scope, key: string, status: IssueReviewStatus, action: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  if (!/^[a-z_]+:[a-z:0-9-]+$/i.test(key)) return fail("Pendência inválida.");
  const text = action.trim();
  if (text.length < 5) return fail("Registre a ação tomada (mínimo 5 caracteres).");
  const db = await getDb();
  await db
    .insert(s.issueReviews)
    .values({ agencyId: scope.agencyId, issueKey: key, status, action: text, userId: scope.userId })
    .onConflictDoUpdate({ target: [s.issueReviews.agencyId, s.issueReviews.issueKey], set: { status, action: text, userId: scope.userId, updatedAt: new Date() } });
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "issue", key, status, { reason: text });
  return { ok: true, message: status === "concluded" ? "Acompanhamento concluído." : "Pendência marcada como analisada." };
}

export async function handleOccurrence(scope: Scope, occurrenceId: string, status: "analyzed" | "resolved", action: string): Promise<ActionResult> {
  if (!isStaff(scope)) return fail("Sem permissão.");
  const text = action.trim();
  if (text.length < 5) return fail("Registre a ação (mínimo 5 caracteres).");
  const db = await getDb();
  const [row] = await db
    .select({ o: s.occurrences, brandId: s.attendances.brandId, promoterId: s.visits.promoterId })
    .from(s.occurrences)
    .innerJoin(s.attendances, eq(s.attendances.id, s.occurrences.attendanceId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .where(and(eq(s.occurrences.id, occurrenceId), eq(s.occurrences.agencyId, scope.agencyId)));
  if (!row || !canSeeBrand(scope, row.brandId) || !canSeePromoter(scope, row.promoterId)) return fail("Ocorrência não encontrada.");
  await db.update(s.occurrences).set({ status, action: text, handledBy: scope.userId, handledAt: new Date(), updatedAt: new Date() }).where(eq(s.occurrences.id, occurrenceId));
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "occurrence", occurrenceId, status, { before: { status: row.o.status }, after: { status }, reason: text });
  return { ok: true, message: "Ocorrência atualizada." };
}
