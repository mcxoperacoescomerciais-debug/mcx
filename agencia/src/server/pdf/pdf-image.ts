/** Foto do armazenamento já reduzida para o PDF, três downloads por vez. */
import "server-only";
import { storage } from "../storage";
import { limiter } from "./queue";
import { shrinkForPdf, type PdfImg } from "./shrink";

const run = limiter(3);

/** side: maior lado da foto no PDF (padrão 1100 px; galeria em miniatura usa menos). */
export function loadPdfImage(storageKey: string | null, contentType: string | null, side?: number): Promise<PdfImg | null> {
  if (!storageKey) return Promise.resolve(null);
  return run(async () => {
    const bytes = await storage().get(storageKey);
    return bytes ? shrinkForPdf(bytes, contentType, side) : null;
  });
}
