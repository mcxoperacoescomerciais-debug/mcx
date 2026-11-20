/** Anti-duplicata: títulos "muito parecidos" (sem acento, sem pontuação, por palavras). */

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "para", "pra", "no", "na", "em", "com"]);

function words(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter((w) => w && !STOP.has(w)));
}

/** 0 a 1: palavras em comum ÷ palavras do título menor. */
export function titleSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.min(wa.size, wb.size);
}

export function looksDuplicate(a: string, b: string): boolean {
  if (normalizeText(a) === normalizeText(b)) return true;
  const small = Math.min(words(a).size, words(b).size);
  return small >= 2 && titleSimilarity(a, b) >= 0.8;
}
