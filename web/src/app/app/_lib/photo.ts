/**
 * Compressão da foto no próprio celular antes de guardar/enviar: lado maior
 * até 1600px, JPEG 80%. Uma foto de câmera de 4 MB vira ~250 KB — 10× menos
 * dados móveis e upload 10× mais rápido no sinal fraco do supermercado.
 */
const MAX_SIDE = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob ?? file;
  } catch {
    return file;
  }
}
