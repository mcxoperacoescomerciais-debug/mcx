"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { audit } from "@/server/audit";
import { parseMixWorkbook } from "@/server/import/mix-workbook";
import { applyMix } from "@/server/import/apply-mix";
import { importPromoters, importStores, readTable } from "@/server/import/tabular";
import { STORE_FORMAT_LABEL } from "@/lib/domain";

export interface ImportState {
  ok?: boolean;
  message?: string;
  details?: string[];
}

const MAX_BYTES = 8 * 1024 * 1024;

export async function importMixAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const file = fd.get("file");
  const networkId = String(fd.get("networkId") ?? "");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Escolha a planilha de mix (.xlsx)." };
  if (file.size > MAX_BYTES) return { ok: false, message: "Arquivo muito grande (máx. 8 MB)." };
  const db = await getDb();
  const [net] = await db.select().from(s.networks).where(and(eq(s.networks.id, networkId), eq(s.networks.clientId, scope.clientId)));
  if (!net) return { ok: false, message: "Escolha a rede da planilha." };
  try {
    const parsed = await parseMixWorkbook(Buffer.from(await file.arrayBuffer()));
    if (!parsed.mixes.length) return { ok: false, message: "Nenhuma aba de mix reconhecida.", details: parsed.warnings };
    const res = await applyMix(db, { tenantId: scope.tenantId, clientId: scope.clientId, networkId, userId: scope.userId }, {
      mixes: parsed.mixes.map((m) => ({ format: m.format, items: m.items })),
      prices: Object.fromEntries(parsed.prices),
    });
    await audit({ tenantId: scope.tenantId, userId: scope.userId }, "mix", networkId, "import", null, { file: file.name, ...res });
    revalidatePath("/painel", "layout");
    return {
      ok: true,
      message: `${net.name}: ${parsed.mixes.map((m) => `${STORE_FORMAT_LABEL[m.format]} (${m.items.length} itens)`).join(", ")}. ${res.productsCreated} produtos novos, ${res.productsUpdated} atualizados.`,
      details: parsed.warnings,
    };
  } catch (err) {
    console.error("[import mix]", err);
    return { ok: false, message: "Não foi possível ler a planilha. Confira se é o arquivo .xlsx de mix da SUINCO." };
  }
}

export async function importTableAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const kind = String(fd.get("kind"));
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) return { ok: false, message: "Escolha o arquivo (.xlsx ou .csv)." };
  if (file.size > MAX_BYTES) return { ok: false, message: "Arquivo muito grande (máx. 8 MB)." };
  if (kind === "promotores" && scope.role !== "admin") return { ok: false, message: "Apenas administradores importam usuários." };
  try {
    const rows = await readTable(file);
    if (!rows.length) return { ok: false, message: "A planilha está vazia." };
    const report = kind === "lojas" ? await importStores(scope, rows) : await importPromoters(scope, rows);
    revalidatePath("/painel", "layout");
    return {
      ok: report.errors.length === 0,
      message: `${report.created} criados, ${report.updated} atualizados${report.errors.length ? `, ${report.errors.length} com problema` : ""}.`,
      details: report.errors.slice(0, 50),
    };
  } catch (err) {
    console.error("[import tabela]", err);
    return { ok: false, message: "Não foi possível ler o arquivo." };
  }
}
