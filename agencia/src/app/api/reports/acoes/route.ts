/**
 * Relatório de ações para a marca (PDF), com os blocos escolhidos na tela
 * Painel › Relatório para a marca. Só para agências com o modo ações.
 */
import { and, eq } from "drizzle-orm";
import { getApiScope, STAFF, unauthorized } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { canSeeBrand } from "@/server/scope";
import { loadActions, summarize } from "@/server/actions-data";
import { REPORT_BLOCKS, renderBrandReport, type ReportBlock } from "@/server/pdf/brand-report-pdf";
import { pdfAgency, pdfResponse, slug } from "@/server/pdf/kit";
import { pdfSlot } from "@/server/pdf/queue";
import { audit } from "@/server/audit";
import { isUuid } from "@/lib/filters";
import { addDays, todayIso } from "@/lib/dates";

const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function GET(request: Request) {
  const scope = await getApiScope(STAFF);
  if (!scope) return unauthorized();
  if (!scope.settings.modules.actions) return new Response("Relatório não liberado para esta agência.", { status: 403 });
  const p = new URL(request.url).searchParams;
  const brand = p.get("brand") ?? "";
  if (!isUuid(brand) || !canSeeBrand(scope, brand)) return new Response("Escolha a marca do relatório.", { status: 400 });
  const to = isDate(p.get("to")) ?? todayIso();
  const from = isDate(p.get("from")) ?? addDays(to, -30);
  if (from > to) return new Response("Período inválido.", { status: 400 });
  const campaign = (p.get("campaign") ?? "").trim().slice(0, 80) || null;
  const chosen = p.getAll("bloco").filter((b): b is ReportBlock => REPORT_BLOCKS.some((x) => x.key === b));
  const blocks = new Set<ReportBlock>(chosen.length ? chosen : REPORT_BLOCKS.map((b) => b.key));
  const intro = (p.get("intro") ?? "").trim().slice(0, 800) || null;

  const db = await getDb();
  const [b] = await db.select({ name: s.brands.name }).from(s.brands).where(and(eq(s.brands.id, brand), eq(s.brands.agencyId, scope.agencyId)));
  if (!b) return new Response("Marca não encontrada.", { status: 404 });

  return pdfSlot(async () => {
    const actions = await loadActions(scope, { from, to, brand, campaign, city: p.get("city"), chain: p.get("chain") }, { withPhotos: blocks.has("fotos") });
    const pdf = await renderBrandReport({
      agency: await pdfAgency(scope),
      brandName: b.name,
      from,
      to,
      campaign,
      intro,
      blocks,
      actions,
      summary: summarize(actions),
      demo: scope.settings.demo,
    });
    await audit({ agencyId: scope.agencyId, userId: scope.userId }, "report", brand, "brand_actions_pdf", { after: { from, to, campaign, blocks: [...blocks] } });
    return pdfResponse(pdf, `Relatorio_acoes_${slug(b.name)}_${from}_a_${to}.pdf`, true);
  });
}
