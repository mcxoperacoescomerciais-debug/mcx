/**
 * Fotos do depois para enviar no grupo junto com o PDF: cópia da foto com um
 * rodapé de identificação (loja, cidade, data e hora, promotor), como as fotos
 * "carimbadas" que as agências já usam. A foto original não é alterada.
 */
import { fmtDateTime } from "@/lib/dates";
import { getPhotoBlob, type LocalPhoto } from "./local-store";

export interface StampInfo {
  store: string;
  city: string;
  promoter: string;
}

async function photoBlob(p: LocalPhoto): Promise<Blob | null> {
  const original = await getPhotoBlob(p.id);
  if (original) return original;
  if (p.uploaded) {
    const server = await fetch(`/api/photos/${p.id}`)
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null);
    if (server) return server;
  }
  return (await getPhotoBlob(p.id, true)) ?? null;
}

async function stamp(blob: Blob, lines: string[]): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const g = canvas.getContext("2d")!;
  g.drawImage(bmp, 0, 0);
  const size = Math.max(14, Math.round(bmp.width / 38));
  const pad = Math.round(size * 0.6);
  const band = lines.length * size * 1.3 + pad * 2;
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(0, bmp.height - band, bmp.width, band);
  g.fillStyle = "#ffffff";
  g.textBaseline = "top";
  lines.forEach((t, i) => {
    g.font = `${i === 0 ? "bold " : ""}${size}px sans-serif`;
    g.fillText(t, pad, bmp.height - band + pad + i * size * 1.3, bmp.width - pad * 2);
  });
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? blob), "image/jpeg", 0.85));
}

export async function afterPhotoFiles(photos: LocalPhoto[], info: StampInfo): Promise<File[]> {
  const after = photos.filter((p) => p.kind === "after");
  const safe = (v: string) => v.normalize("NFD").replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  const files: File[] = [];
  for (const [i, p] of after.entries()) {
    const blob = await photoBlob(p);
    if (!blob) continue;
    const stamped = await stamp(blob, [info.store.toUpperCase(), info.city, fmtDateTime(p.takenAt), info.promoter ? `Promotor: ${info.promoter}` : ""].filter(Boolean)).catch(() => blob);
    files.push(new File([stamped], `Depois_${i + 1}_${safe(info.store)}.jpg`, { type: "image/jpeg" }));
  }
  return files;
}
