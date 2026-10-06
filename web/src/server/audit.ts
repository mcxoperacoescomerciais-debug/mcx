/**
 * Trilha de auditoria. Grava antes/depois apenas dos campos que mudaram,
 * para a tela de auditoria mostrar "quantidade: 20 → 15" sem ruído.
 */
import "server-only";
import { getDb, schema as s } from "./db";

interface Actor {
  tenantId: string;
  userId: string | null;
}

export async function audit(
  actor: Actor,
  entity: string,
  entityId: string,
  action: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): Promise<void> {
  const db = await getDb();
  await db.insert(s.auditLogs).values({
    tenantId: actor.tenantId,
    userId: actor.userId,
    entity,
    entityId,
    action,
    before: before ?? null,
    after: after ?? null,
  });
}

/** Devolve só os campos alterados entre dois objetos (null se nada mudou). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const next = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (JSON.stringify(prev ?? null) !== JSON.stringify(next ?? null)) {
      b[key] = prev ?? null;
      a[key] = next ?? null;
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}
