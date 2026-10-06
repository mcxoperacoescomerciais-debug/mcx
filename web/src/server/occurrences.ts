/**
 * Tratamento de ocorrências pelo gestor (Aberto → Em análise → Resolvido /
 * Ignorado). Cada mudança vira uma linha em occurrence_actions — o histórico
 * completo de quem fez o quê e quando.
 */
import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import { audit } from "./audit";
import type { OccurrenceStatus } from "@/lib/domain";

export interface OccurrenceDetail {
  id: string;
  type: string;
  status: OccurrenceStatus;
  location: string;
  quantity: number | null;
  unit: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  severity: string | null;
  price: string | null;
  lot: string | null;
  ruptureKind: string | null;
  damageKind: string | null;
  notes: string | null;
  visitId: string;
  visitDate: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  city: string;
  promoterName: string;
  productId: string;
  productName: string;
  productCode: string | null;
  photos: string[];
  actions: { id: string; fromStatus: string; toStatus: string; actionText: string | null; actionDate: string | null; createdAt: Date; responsible: string | null }[];
}

export async function getOccurrenceDetail(scope: Scope, id: string): Promise<OccurrenceDetail | null> {
  const db = await getDb();
  const [row] = await db
    .select({
      o: s.occurrences,
      visitDate: s.visits.visitDate,
      promoterId: s.visits.promoterId,
      storeName: s.stores.name,
      storeCode: s.stores.code,
      city: s.stores.city,
      promoterName: s.users.name,
      productName: s.products.name,
      productCode: s.products.code,
    })
    .from(s.occurrences)
    .innerJoin(s.visits, eq(s.visits.id, s.occurrences.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.occurrences.storeId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .innerJoin(s.products, eq(s.products.id, s.occurrences.productId))
    .where(and(eq(s.occurrences.id, id), eq(s.occurrences.clientId, scope.clientId)));
  if (!row || (scope.promoterId && row.promoterId !== scope.promoterId)) return null;

  const photos = await db
    .select({ id: s.occurrencePhotos.id })
    .from(s.occurrencePhotos)
    .where(eq(s.occurrencePhotos.occurrenceId, id))
    .orderBy(asc(s.occurrencePhotos.createdAt));
  const actions = await db
    .select({
      id: s.occurrenceActions.id,
      fromStatus: s.occurrenceActions.fromStatus,
      toStatus: s.occurrenceActions.toStatus,
      actionText: s.occurrenceActions.actionText,
      actionDate: s.occurrenceActions.actionDate,
      createdAt: s.occurrenceActions.createdAt,
      responsible: s.users.name,
    })
    .from(s.occurrenceActions)
    .leftJoin(s.users, eq(s.users.id, s.occurrenceActions.responsibleId))
    .where(eq(s.occurrenceActions.occurrenceId, id))
    .orderBy(asc(s.occurrenceActions.createdAt));

  const o = row.o;
  return {
    id: o.id,
    type: o.type,
    status: o.status,
    location: o.location,
    quantity: o.quantity,
    unit: o.unit,
    expiryDate: o.expiryDate,
    daysToExpiry: o.daysToExpiry,
    severity: o.severity,
    price: o.price,
    lot: o.lot,
    ruptureKind: o.ruptureKind,
    damageKind: o.damageKind,
    notes: o.notes,
    visitId: o.visitId,
    visitDate: row.visitDate,
    storeId: o.storeId,
    storeName: row.storeName,
    storeCode: row.storeCode,
    city: row.city,
    promoterName: row.promoterName,
    productId: o.productId,
    productName: row.productName,
    productCode: row.productCode,
    photos: photos.map((p) => p.id),
    actions,
  };
}

export async function changeOccurrenceStatus(
  scope: Scope,
  id: string,
  toStatus: OccurrenceStatus,
  actionText: string | null,
  actionDate: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if ((toStatus === "resolved" || toStatus === "ignored") && !actionText?.trim()) {
    return { ok: false, error: "Descreva a ação tomada para resolver ou ignorar." };
  }
  const db = await getDb();
  const [occ] = await db
    .select({ status: s.occurrences.status })
    .from(s.occurrences)
    .where(and(eq(s.occurrences.id, id), eq(s.occurrences.clientId, scope.clientId)));
  if (!occ) return { ok: false, error: "Ocorrência não encontrada." };
  if (occ.status === toStatus && !actionText) return { ok: true };
  await db.transaction(async (tx) => {
    await tx.update(s.occurrences).set({ status: toStatus, updatedAt: new Date(), updatedBy: scope.userId }).where(eq(s.occurrences.id, id));
    await tx.insert(s.occurrenceActions).values({
      tenantId: scope.tenantId,
      occurrenceId: id,
      fromStatus: occ.status,
      toStatus,
      actionText: actionText?.trim() || null,
      actionDate,
      responsibleId: scope.userId,
      createdBy: scope.userId,
    });
  });
  await audit({ tenantId: scope.tenantId, userId: scope.userId }, "occurrence", id, "status", { status: occ.status }, { status: toStatus, action: actionText });
  return { ok: true };
}
