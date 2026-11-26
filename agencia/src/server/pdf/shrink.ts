/**
 * Foto reduzida para entrar em PDF. A foto do aparelho tem até 1600 px; no PDF (A4) 1100 px
 * bastam, e o arquivo cai para perto de um terço. Com dezenas de fotos por relatório, é o que
 * mantém a memória do servidor dentro do limite. Se a redução falhar, vai a foto original.
 */
export const PDF_PHOTO_SIDE = 1100;
const PDF_PHOTO_QUALITY = 72;

export type PdfImg = { data: Buffer; format: "png" | "jpg" };

type Sharp = typeof import("sharp").default;
let sharpLoad: Promise<Sharp | null> | null = null;

function loadSharp(): Promise<Sharp | null> {
  sharpLoad ??= import("sharp")
    .then((m) => {
      const sharp = ((m as unknown as { default?: Sharp }).default ?? m) as Sharp;
      // Sem cache e uma tarefa por vez: o servidor tem pouca memória.
      sharp.cache(false);
      sharp.concurrency(1);
      return sharp;
    })
    .catch((e: Error) => {
      console.error("[pdf] sharp indisponível, fotos vão no tamanho original:", e.message);
      return null;
    });
  return sharpLoad;
}

export async function shrinkForPdf(bytes: Uint8Array, contentType: string | null, side = PDF_PHOTO_SIDE): Promise<PdfImg> {
  const original: PdfImg = { data: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), format: contentType === "image/png" ? "png" : "jpg" };
  const sharp = await loadSharp();
  if (!sharp) return original;
  try {
    const data = await sharp(original.data, { failOn: "none" })
      .rotate()
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: PDF_PHOTO_QUALITY })
      .toBuffer();
    // Foto já pequena: a recompressão não ajuda.
    return data.length < original.data.length || original.format === "png" ? { data, format: "jpg" } : original;
  } catch {
    return original;
  }
}
