/** Trilha de auditoria: quem, quando, o quê, antes → depois. Só inserção. */
import "server-only";
import type { DB } from "./db";
import { getDb, schema as s } from "./db";

type Tx = Pick<DB, "insert">;

export async function audit(
  userId: string | null,
  entity: string,
  entityId: string,
  action: string,
  data: { before?: unknown; after?: unknown; reason?: string | null; source?: string } = {},
  tx?: Tx,
): Promise<void> {
  const db = tx ?? (await getDb());
  await db.insert(s.auditLogs).values({
    userId,
    entity,
    entityId,
    action,
    source: data.source ?? "tela",
    reason: data.reason ?? null,
    before: (data.before ?? null) as never,
    after: (data.after ?? null) as never,
  });
}
