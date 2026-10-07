/**
 * Verificação de saúde (sem login). Chamada a cada 10 min pelo GitHub Actions
 * (.github/workflows/manter-ativo.yml): mantém o servidor gratuito do Render
 * acordado e o banco do Supabase com atividade.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, dbMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
