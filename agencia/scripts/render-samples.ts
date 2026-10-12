/**
 * Gera PDFs de amostra a partir do banco de demonstração em memória.
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/render-samples.ts
 * Saída em .data/samples/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
process.env.UPLOADS_DIR ??= ".data/samples-uploads";
const { memDb } = await import("./_memdb");
const s = await import("../src/server/db/schema");
const { scopeForUser } = await import("../src/server/auth");
const { loadAttendanceBlock, renderAttendancesPdf } = await import("../src/server/pdf/attendance-pdf");

const db = await memDb();
const [gestor] = await db.select().from(s.users).where(eq(s.users.username, "gestor"));
const scope = await scopeForUser(gestor);
const [att] = await db.select().from(s.attendances).where(eq(s.attendances.status, "completed")).limit(1);
mkdirSync(".data/samples", { recursive: true });
const block = await loadAttendanceBlock(scope, att.id);
writeFileSync(".data/samples/atendimento.pdf", await renderAttendancesPdf({ agency: scope.agencyName, title: "Relatório de atendimento", subtitle: "amostra", blocks: [block!], footer: "amostra" }));
const { dailyReport, brandReport } = await import("../src/server/reports");
const { renderDailyPdf, renderBrandPdf } = await import("../src/server/pdf/report-pdfs");
const { parseFilters } = await import("../src/lib/filters");
const f = parseFilters({}, 7);
writeFileSync(".data/samples/diario.pdf", await renderDailyPdf(scope.agencyName, await dailyReport(scope, f), ""));
const [bravo] = await db.select().from(s.brands).where(eq(s.brands.code, "BRAVO"));
writeFileSync(".data/samples/marca.pdf", await renderBrandPdf(scope.agencyName, await brandReport(scope, { ...f, brand: bravo.id }), f.from, f.to));
console.log("PDFs em .data/samples");
process.exit(0);
