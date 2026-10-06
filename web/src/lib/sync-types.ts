/**
 * Contrato da sincronização celular → servidor. A validação (zod) roda no
 * servidor; o celular usa só os tipos.
 *
 * A sincronização é por ESTADO, não por eventos: o celular manda a versão
 * atual da visita e dos itens alterados, e o servidor faz upsert pelo UUID.
 * Reenviar o mesmo pacote quantas vezes for preciso nunca duplica nada.
 */
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const occurrenceInput = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  type: z.enum(["validity", "rupture", "damage"]),
  location: z.enum(["sales_floor", "stock", "cold_room", "other"]).default("sales_floor"),
  quantity: z.number().int().min(0).max(100000).nullable().optional(),
  unit: z.enum(["un", "cx", "kg", "pct"]).default("un"),
  expiryDate: isoDate.nullable().optional(),
  lot: z.string().max(60).nullable().optional(),
  price: z.number().min(0).max(100000).nullable().optional(),
  ruptureKind: z.enum(["total", "partial", "not_found", "empty_space", "no_stock"]).nullable().optional(),
  damageKind: z.enum(["damaged_package", "violated", "no_vacuum", "strange_color", "liquid", "unfit", "other", "crushed", "leak"]).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type OccurrenceInput = z.infer<typeof occurrenceInput>;

export const visitInput = z.object({
  id: z.uuid(),
  storeId: z.uuid(),
  visitDate: isoDate,
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  status: z.enum(["in_progress", "finished"]),
  checklist: z.record(z.string(), z.boolean()).default({}),
  notes: z.string().max(4000).nullable().optional(),
  occurrences: z.array(occurrenceInput).max(500),
  deletedOccurrenceIds: z.array(z.uuid()).max(500).default([]),
});
export type VisitInput = z.infer<typeof visitInput>;

export const syncRequest = z.object({ visits: z.array(visitInput).max(20) });
export type SyncRequest = z.infer<typeof syncRequest>;

export interface SyncResult {
  visitId: string;
  ok: boolean;
  error?: string;
}

/** O que o celular baixa e guarda para trabalhar sem internet. */
export interface BootstrapPayload {
  serverToday: string;
  user: { id: string; name: string; username: string };
  client: { id: string; name: string };
  bands: { critical: number; high: number; attention: number; monitor: number };
  checklist: { key: string; label: string }[];
  editWindowHours: number;
  stores: BootstrapStore[];
  products: BootstrapProduct[];
}

export interface BootstrapStore {
  id: string;
  name: string;
  code: string | null;
  city: string;
  state: string;
  network: string;
  /** Formato da loja na rede (varejo, plus, cash). */
  format: string;
  lastVisitDate: string | null;
  /** Mix oficial da loja (rede + formato) na ordem da planilha, seguido de produtos já vistos nela. */
  mix: string[];
  /** Código do produto na rede (etiqueta da gôndola), por productId — também é pesquisável. */
  chainCodes: Record<string, string>;
  /** Itens da última visita: base do "repetir produtos da última visita". */
  lastItems: { productId: string; type: "validity" | "rupture" | "damage"; location: string; unit: string }[];
}

export interface BootstrapProduct {
  id: string;
  name: string;
  code: string | null;
  category: string;
  presentation: string | null;
  defaultUnit: string;
  aliases: string[];
  /** Preço da tabela vigente SUINCO (referência). */
  referencePrice: number | null;
}

export interface PromoterVisitSummary {
  id: string;
  storeId: string;
  storeName: string;
  storeCode: string | null;
  city: string;
  visitDate: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  validity: number;
  stock: number;
  rupture: number;
  damage: number;
  expired: number;
  critical: number;
}
