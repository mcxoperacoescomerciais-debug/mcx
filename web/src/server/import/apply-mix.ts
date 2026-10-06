/**
 * Aplica uma planilha de MIX ao banco:
 * - produtos são identificados pelo código SUINCO (cria os novos, atualiza o
 *   preço de tabela dos existentes; o nome e a categoria editados à mão no
 *   cadastro NÃO são sobrescritos);
 * - o mix de cada formato presente na planilha é SUBSTITUÍDO pelo da planilha
 *   (formatos ausentes na planilha ficam como estão).
 *
 * Recebe uma estrutura simples (serializável), então serve tanto para o
 * upload no painel quanto para o seed de desenvolvimento.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../db";
import * as s from "../db/schema";
import { guessCategory, prettyProductName, type MixItem, type StoreFormat } from "./mix-workbook";

export interface MixPayload {
  mixes: { format: StoreFormat; items: MixItem[] }[];
  prices: Record<string, number>;
}

export interface ApplyMixResult {
  productsCreated: number;
  productsUpdated: number;
  mixRows: number;
  formats: StoreFormat[];
}

export async function applyMix(
  db: DB,
  ctx: { tenantId: string; clientId: string; networkId: string; userId?: string | null },
  payload: MixPayload,
): Promise<ApplyMixResult> {
  const byCode = new Map<string, MixItem>();
  for (const m of payload.mixes) for (const it of m.items) if (!byCode.has(it.suincoCode)) byCode.set(it.suincoCode, it);
  const codes = [...byCode.keys()];
  const existing = codes.length
    ? await db
        .select({ id: s.products.id, code: s.products.code })
        .from(s.products)
        .where(and(eq(s.products.clientId, ctx.clientId), inArray(s.products.code, codes)))
    : [];
  const idByCode = new Map(existing.map((p) => [p.code!, p.id]));
  let created = 0;
  let updated = 0;

  for (const [code, it] of byCode) {
    const price = payload.prices[code];
    const id = idByCode.get(code);
    if (id) {
      if (price !== undefined) {
        await db.update(s.products).set({ referencePrice: price.toFixed(2), updatedAt: new Date(), updatedBy: ctx.userId ?? null }).where(eq(s.products.id, id));
      }
      updated++;
    } else {
      const [row] = await db
        .insert(s.products)
        .values({
          tenantId: ctx.tenantId,
          clientId: ctx.clientId,
          code,
          name: prettyProductName(it.description),
          category: guessCategory(it.description),
          referencePrice: price !== undefined ? price.toFixed(2) : null,
          aliases: [it.description.toLowerCase()],
          createdBy: ctx.userId ?? null,
        })
        .returning({ id: s.products.id });
      idByCode.set(code, row.id);
      created++;
    }
  }

  let mixRows = 0;
  for (const m of payload.mixes) {
    await db.delete(s.productMixes).where(and(eq(s.productMixes.networkId, ctx.networkId), eq(s.productMixes.format, m.format)));
    if (!m.items.length) continue;
    await db.insert(s.productMixes).values(
      m.items.map((it) => ({
        tenantId: ctx.tenantId,
        clientId: ctx.clientId,
        networkId: ctx.networkId,
        format: m.format,
        productId: idByCode.get(it.suincoCode)!,
        chainCode: it.chainCode,
        seq: it.seq,
        note: it.note,
      })),
    );
    mixRows += m.items.length;
  }
  return { productsCreated: created, productsUpdated: updated, mixRows, formats: payload.mixes.map((m) => m.format) };
}
