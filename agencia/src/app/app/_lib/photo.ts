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

export async function preparePhoto(file: File): Promise<{ full: Blob; thumb: Blob | null }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const [full, thumb] = await Promise.all([draw(bitmap, MAX_SIDE, 0.82), draw(bitmap, THUMB_SIDE, 0.72)]);
    bitmap.close();
    return { full: full ?? file, thumb };
  } catch {
    return { full: file, thumb: null };
  }
}
