/**
 * Trilha de auditoria: quem, quando, o quê, antes → depois, e o motivo quando
 * a regra exige justificativa. Grava só os campos que mudaram.
 */
import "server-only";
import type { DB } from "./db";
import { getDb, schema as s } from "./db";

export interface Actor {
  agencyId: string;
  userId: string | null;
}

type Tx = Pick<DB, "insert">;

export async function audit(
  actor: Actor,
  entity: string,
  entityId: string,
  action: string,
  data: { before?: unknown; after?: unknown; reason?: string | null } = {},
  tx?: Tx,
): Promise<void> {
  const db = tx ?? (await getDb());
  await db.insert(s.auditLogs).values({
    agencyId: actor.agencyId,
    userId: actor.userId,
    entity,
    entityId,
    action,
    reason: data.reason ?? null,
    before: (data.before ?? null) as never,
    after: (data.after ?? null) as never,
  });
}

/** Só os campos alterados entre dois objetos (null se nada mudou). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
  for (const key of Object.keys(after)) {
    if (JSON.stringify(norm(before[key])) !== JSON.stringify(norm(after[key]))) {
      b[key] = norm(before[key]);
      a[key] = norm(after[key]);
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}
