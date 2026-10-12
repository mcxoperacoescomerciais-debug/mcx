import "server-only";
import { getApiScope, STAFF, type Scope } from "./auth";
import { audit } from "./audit";
import { parseFilters, type PanelFilters } from "@/lib/filters";

/** Escopo + filtros da URL para rotas de relatório/exportação (só gestor/admin). */
export async function reportContext(request: Request, defaultDays = 7): Promise<{ scope: Scope; f: PanelFilters; format: string } | null> {
  const scope = await getApiScope(STAFF);
  if (!scope) return null;
  const url = new URL(request.url);
  return { scope, f: parseFilters(Object.fromEntries(url.searchParams), defaultDays), format: url.searchParams.get("format") ?? "xlsx" };
}

/** Toda exportação fica registrada (quem, quando, quais filtros). */
export async function logExport(scope: Scope, kind: string, f: PanelFilters, format: string) {
  await audit({ agencyId: scope.agencyId, userId: scope.userId }, "export", kind, format, {
    after: { from: f.from, to: f.to, date: f.date, brand: f.brand, store: f.store, promoter: f.promoter, chain: f.chain, city: f.city, status: f.status },
  });
}
