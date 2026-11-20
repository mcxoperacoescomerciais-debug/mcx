/**
 * Cron das rotinas (GitHub Actions). Exige o segredo CRON_SECRET no cabeçalho
 * Authorization: Bearer … — sem segredo configurado, a rota fica fechada.
 * A geração é idempotente: chamar duas vezes não duplica demandas.
 */
import { timingSafeEqual } from "node:crypto";
import { generateRoutines } from "@/server/routines";
import { generateStockAlerts } from "@/server/stock";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ ok: false }, { status: 401 });
  const result = await generateRoutines();
  const stock = await generateStockAlerts();
  return Response.json({ ok: true, ...result, stockAlerts: stock.created });
}
