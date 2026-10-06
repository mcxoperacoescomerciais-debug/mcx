/**
 * Leitura de visitas com checagem de acesso — usada pela página de detalhe,
 * pelo PDF e pela rota de fotos. Promotor só vê as próprias visitas; gestores
 * veem todas as visitas do cliente ativo.
 */
import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema as s } from "./db";
import type { Scope } from "./auth";
import type { DamageKind, Location, OccurrenceStatus, OccurrenceType, RuptureKind, Severity } from "@/lib/domain";

export interface VisitDetail {
  id: string;
  visitDate: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
  checklist: Record<string, boolean>;
  notes: string | null;
  store: { id: string; name: string; code: string | null; city: string; state: string; network: string };
  promoter: { id: string; name: string };
  client: { name: string };
  occurrences: VisitOccurrence[];
}

export interface VisitOccurrence {
  id: string;
  type: OccurrenceType;
  location: Location;
  productId: string;
  productName: string;
  productCode: string | null;
  quantity: number | null;
  unit: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  severity: Severity | null;
  lot: string | null;
  price: string | null;
  ruptureKind: RuptureKind | null;
  damageKind: DamageKind | null;
  notes: string | null;
  status: OccurrenceStatus;
  photos: { id: string; storageKey: string }[];
}

export async function canAccessVisit(scope: Scope, visitId: string): Promise<boolean> {
  const db = await getDb();
  const [v] = await db
    .select({ clientId: s.visits.clientId, promoterId: s.visits.promoterId })
    .from(s.visits)
    .where(eq(s.visits.id, visitId));
  if (!v || v.clientId !== scope.clientId) return false;
  return scope.promoterId === null || v.promoterId === scope.promoterId;
}

export async function getVisitDetail(scope: Scope, visitId: string): Promise<VisitDetail | null> {
  if (!(await canAccessVisit(scope, visitId))) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      visit: s.visits,
      store: { id: s.stores.id, name: s.stores.name, code: s.stores.code, city: s.stores.city, state: s.stores.state },
      network: s.networks.name,
      promoter: { id: s.users.id, name: s.users.name },
      clientName: s.clients.name,
    })
    .from(s.visits)
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .innerJoin(s.clients, eq(s.clients.id, s.visits.clientId))
    .where(eq(s.visits.id, visitId));
  if (!row) return null;

  const occs = await db
    .select({ occ: s.occurrences, productName: s.products.name, productCode: s.products.code })
    .from(s.occurrences)
    .innerJoin(s.products, eq(s.products.id, s.occurrences.productId))
    .where(and(eq(s.occurrences.visitId, visitId), isNull(s.occurrences.deletedAt)))
    .orderBy(asc(s.occurrences.daysToExpiry), asc(s.products.name));

  const photos = await db
    .select({ id: s.occurrencePhotos.id, occurrenceId: s.occurrencePhotos.occurrenceId, storageKey: s.occurrencePhotos.storageKey })
    .from(s.occurrencePhotos)
    .where(eq(s.occurrencePhotos.visitId, visitId))
    .orderBy(asc(s.occurrencePhotos.createdAt));

  const v = row.visit;
  return {
    id: v.id,
    visitDate: v.visitDate,
    startedAt: v.startedAt,
    finishedAt: v.finishedAt,
    status: v.status,
    checklist: v.checklist ?? {},
    notes: v.notes,
    store: { ...row.store, network: row.network },
    promoter: row.promoter,
    client: { name: row.clientName },
    occurrences: occs.map(({ occ, productName, productCode }) => ({
      id: occ.id,
      type: occ.type,
      location: occ.location,
      productId: occ.productId,
      productName,
      productCode,
      quantity: occ.quantity,
      unit: occ.unit,
      expiryDate: occ.expiryDate,
      daysToExpiry: occ.daysToExpiry,
      severity: occ.severity,
      lot: occ.lot,
      price: occ.price,
      ruptureKind: occ.ruptureKind,
      damageKind: occ.damageKind,
      notes: occ.notes,
      status: occ.status,
      photos: photos.filter((p) => p.occurrenceId === occ.id).map(({ id, storageKey }) => ({ id, storageKey })),
    })),
  };
}

/** Nome de arquivo do PDF: Suinco_Visita_ABC-Formiga-L63_2026-09-29.pdf */
export function visitPdfFilename(v: Pick<VisitDetail, "store" | "visitDate">): string {
  const slug = `${v.store.name}${v.store.code ? `-L${v.store.code}` : ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `Suinco_Visita_${slug}_${v.visitDate}.pdf`;
}

/** Separa as ocorrências da visita nas seções do relatório, as mais urgentes primeiro. */
export function groupOccurrences(occ: VisitOccurrence[]) {
  const byDays = (a: VisitOccurrence, b: VisitOccurrence) => (a.daysToExpiry ?? 9999) - (b.daysToExpiry ?? 9999);
  return {
    salesFloor: occ.filter((o) => o.type === "validity" && o.location !== "stock").sort(byDays),
    stock: occ.filter((o) => o.type === "validity" && o.location === "stock").sort(byDays),
    ruptures: occ.filter((o) => o.type === "rupture"),
    damages: occ.filter((o) => o.type === "damage"),
  };
}
