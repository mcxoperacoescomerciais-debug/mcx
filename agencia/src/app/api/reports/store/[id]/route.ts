import { and, eq } from "drizzle-orm";
import { isUuid } from "@/lib/filters";
import { getApiScope, STAFF, unauthorized } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { listVisits } from "@/server/history";
import { loadAttendanceBlock, renderAttendancesPdf } from "@/server/pdf/attendance-pdf";
import { pdfResponse, slug } from "@/server/pdf/kit";
import { audit } from "@/server/audit";
import { parseFilters } from "@/lib/filters";
import { fmtDate } from "@/lib/dates";

const MAX_ATTENDANCES = 40;

/** Relatório da loja: todas as marcas atendidas no período, cada uma com seus registros. */
export async function GET(request: Request, ctx: RouteContext<"/api/reports/store/[id]">) {
  const scope = await getApiScope(STAFF);
  if (!scope) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Não encontrado", { status: 404 });
  const db = await getDb();
  const [store] = await db.select().from(s.stores).where(and(eq(s.stores.id, id), eq(s.stores.agencyId, scope.agencyId)));
  if (!store) return new Response("Loja não encontrada", { status: 404 });
  const url = new URL(request.url);
  const f = { ...parseFilters(Object.fromEntries(url.searchParams), 7), store: id };
  const visits = await listVisits(scope, f);
  const attIds = visits.flatMap((v) => v.attendances.map((a) => a.id));
  const blocks = (await Promise.all(attIds.slice(0, MAX_ATTENDANCES).map((a) => loadAttendanceBlock(scope, a, 4)))).filter((b) => b !== null);
  const brands = new Set(visits.flatMap((v) => v.attendances.map((a) => a.brandName)));
  const pdf = await renderAttendancesPdf({
    agency: scope.agencyName,
    title: `Relatório da loja · ${store.name}`,
    subtitle: `${store.city}/${store.state} · ${fmtDate(f.from)} a ${fmtDate(f.to)}`,
    summary: [
      { label: "Visitas", value: visits.length },
      { label: "Marcas atendidas", value: brands.size },
      { label: "Atendimentos", value: attIds.length },
      { label: "Rupturas", value: visits.reduce((n, v) => n + v.attendances.reduce((m, a) => m + a.ruptures, 0), 0), tone: "danger" },
    ],
    intro: attIds.length > MAX_ATTENDANCES ? `Mostrando os ${MAX_ATTENDANCES} atendimentos mais recentes de ${attIds.length}. Reduza o período para ver todos.` : `Marcas no período: ${[...brands].join(", ") || "—"}.`,
    blocks,
    footer: `${scope.agencyName} · ${store.name}`,
  });
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "report", id, "store_pdf", { after: { from: f.from, to: f.to } });
  return pdfResponse(pdf, `Loja_${slug(store.name)}_${f.from}_a_${f.to}.pdf`);
}
