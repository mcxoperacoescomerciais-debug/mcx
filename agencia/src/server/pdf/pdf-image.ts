/** Foto do armazenamento já reduzida para o PDF, três downloads por vez. */
import "server-only";
import { storage } from "../storage";
import { limiter } from "./queue";
import { shrinkForPdf, type PdfImg } from "./shrink";

const run = limiter(3);

export function loadPdfImage(storageKey: string | null, contentType: string | null): Promise<PdfImg | null> {
  if (!storageKey) return Promise.resolve(null);
  return run(async () => {
    const bytes = await storage().get(storageKey);
    return bytes ? shrinkForPdf(bytes, contentType) : null;
  });
}
