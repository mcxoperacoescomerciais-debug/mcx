/** Gera PDFs de amostra em .data/samples para revisar o layout: npx tsx --tsconfig tsconfig.scripts.json scripts/render-sample-pdf.ts */
import { mkdirSync, writeFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { memDb } from "./_memdb";
import * as s from "../src/server/db/schema";

async function main() {
  const db = await memDb();
  const { getVisitDetail } = await import("../src/server/visits");
  const { renderVisitPdf } = await import("../src/server/pdf/visit-pdf");
  const [client] = await db.select().from(s.clients);
  const [admin] = await db.select().from(s.users).where(eq(s.users.role, "admin"));
  const scope = { tenantId: client.tenantId, clientId: client.id, userId: admin.id, role: "admin" as const, promoterId: null };
  const [visit] = await db.select().from(s.visits).orderBy(desc(s.visits.visitDate)).limit(1);
  mkdirSync(".data/samples", { recursive: true });
  // Anexa uma foto de exemplo ao primeiro item, pelo mesmo armazenamento usado pelo app.
  const { storage, photoKey } = await import("../src/server/storage");
  const { randomUUID } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  const [occ] = await db.select().from(s.occurrences).where(eq(s.occurrences.visitId, visit.id)).limit(1);
  const photoId = randomUUID();
  const key = photoKey(client.tenantId, client.id, visit.visitDate, visit.id, photoId);
  const bytes = readFileSync("public/icon-512.png");
  await storage().put(key, bytes, "image/png");
  await db.insert(s.occurrencePhotos).values({ id: photoId, tenantId: client.tenantId, clientId: client.id, visitId: visit.id, occurrenceId: occ.id, storageKey: key, contentType: "image/png", bytes: bytes.length });
  const detail = await getVisitDetail(scope, visit.id);
  writeFileSync(".data/samples/visita.pdf", await renderVisitPdf(detail!));
  console.log("ok .data/samples/visita.pdf");
  const { buildWeeklyReport, previousWeek } = await import("../src/server/weekly-report");
  const { renderWeeklyPdf } = await import("../src/server/pdf/weekly-pdf");
  const wk = previousWeek();
  const data = await buildWeeklyReport(scope, wk.start, wk.end);
  writeFileSync(".data/samples/semanal.pdf", await renderWeeklyPdf(data));
  console.log("ok .data/samples/semanal.pdf", data.insights.length, "insights");
}
main();
