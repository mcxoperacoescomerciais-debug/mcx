import { and, eq } from "drizzle-orm";
import { addDays, todayIso } from "@/lib/dates";
import { getDb, schema as s } from "@/server/db";
import { ASSIGNMENT_HORIZON_DAYS, syncAssignmentSchedules } from "@/server/portfolio";

export const dynamic = "force-dynamic";

/**
 * Chamado 1x por dia pelo GitHub Actions (.github/workflows/aviso-armazenamento.yml):
 * mantém a programação das atribuições com dias fixos sempre preenchida até o
 * horizonte. Sem segredo: chamar de novo não duplica nada e a resposta só traz contagens.
 */
export async function GET() {
  try {
    const db = await getDb();
    const agencies = await db.select({ id: s.agencies.id }).from(s.agencies).where(and(eq(s.agencies.kind, "client"), eq(s.agencies.status, "active")));
    const today = todayIso();
    let created = 0;
    for (const a of agencies) {
      const r = await syncAssignmentSchedules({ agencyId: a.id, actorId: null, from: today, to: addDays(today, ASSIGNMENT_HORIZON_DAYS) });
      created += r.created;
    }
    return Response.json({ ok: true, created });
  } catch (err) {
    console.error("[programação diária] falhou", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
