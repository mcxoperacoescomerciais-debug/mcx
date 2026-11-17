/**
 * Compressão no próprio celular antes de guardar/enviar: lado maior até
 * 1600px (JPEG 82%) + miniatura de 360px para galerias. Uma foto de 4 MB vira
 * ~250 KB — menos dados móveis e envio rápido no sinal fraco do supermercado.
 */
const MAX_SIDE = 1600;
const THUMB_SIDE = 360;

async function draw(bitmap: ImageBitmap, maxSide: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function preparePhoto(file: Blob): Promise<{ full: Blob; thumb: Blob | null }> {
  // 1ª tentativa: decodifica inteira. Câmeras de 50 MP passam de 200 MB de memória e o
  // Android recusa — aí decodifica já reduzida (bem mais leve). Só em último caso fica o original.
  const attempts: ImageBitmapOptions[] = [{ imageOrientation: "from-image" }, { imageOrientation: "from-image", resizeWidth: MAX_SIDE, resizeQuality: "high" }];
  for (const opts of attempts) {
    try {
      const bitmap = await createImageBitmap(file, opts);
      const [full, thumb] = await Promise.all([draw(bitmap, MAX_SIDE, 0.82), draw(bitmap, THUMB_SIDE, 0.72)]);
      bitmap.close();
      if (full) return { full, thumb };
    } catch {
      /* tenta a próxima forma */
    }
  }
  return { full: file, thumb: null };
}

/** Foto que ficou grande demais (não foi reduzida ao tirar) — reduz antes de enviar. */
export const UPLOAD_MAX_BYTES = 6 * 1024 * 1024;
