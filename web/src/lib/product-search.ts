/**
 * Busca de produto tolerante ao jeito que os promotores escrevem:
 * sem acento, abreviado, por pedaços ("ling emb mis" → "Linguiça Embutido
 * Misto 2,5kg"), pelo código SUINCO ou pelo código da rede (o que está na
 * etiqueta da gôndola). Usa também os apelidos cadastrados no produto.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,.]+/g, " ")
    .trim();
}

interface Searchable {
  id: string;
  name: string;
  code: string | null;
  aliases: string[];
}

/**
 * Cada palavra digitada precisa ser prefixo de alguma palavra do nome/apelido
 * (ou o texto ser o começo de um dos códigos). Pontuação favorece: código
 * exato, começo do nome, produtos do mix da loja.
 */
export function searchProducts<T extends Searchable>(
  products: T[],
  query: string,
  boostIds: Set<string> = new Set(),
  chainCodes: Record<string, string> = {},
): T[] {
  const q = normalize(query);
  if (!q) return [];
  const terms = q.split(" ").filter(Boolean);
  const scored: { p: T; score: number }[] = [];
  for (const p of products) {
    const codes = [p.code, chainCodes[p.id]].filter(Boolean) as string[];
    let score = 0;
    if (codes.some((c) => c === q)) score += 100;
    else if (/^\d{2,}$/.test(q) && codes.some((c) => c.startsWith(q))) score += 60;
    if (score === 0) {
      const haystacks = [p.name, ...p.aliases].map(normalize);
      const words = haystacks.join(" ").split(" ");
      if (!terms.every((t) => words.some((w) => w.startsWith(t)))) continue;
      if (haystacks.some((h) => h.startsWith(q))) score += 20;
      score += 5 - Math.min(5, normalize(p.name).length / 10);
    }
    if (boostIds.has(p.id)) score += 10;
    scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.p);
}
