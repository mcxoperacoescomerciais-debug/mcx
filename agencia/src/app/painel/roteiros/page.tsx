import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { ChevronRight, UserRound } from "lucide-react";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { promoterFilter } from "@/server/scope";
import { filterIn } from "@/server/filter-sql";
import { filterOptions } from "@/server/operations";
import { listAssignments } from "@/server/portfolio";
import { matchText, parseFilters } from "@/lib/filters";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { RouteBoard } from "./route-board";

export const metadata: Metadata = { title: "Roteiros" };

/**
 * Consulta rápida do roteiro de cada promotor: a lista de promotores; a seta
 * abre o quadro da semana dele (lojas por dia, marcas ao passar o mouse ou
 * tocar na loja). Ajustes só no cadastro do promotor.
 */
export default async function RoutesPage({ searchParams }: PageProps<"/painel/roteiros">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const db = await getDb();
  const [promoters, options] = await Promise.all([
    db
      .select({ id: s.users.id, name: s.users.name, region: s.users.region })
      .from(s.users)
      .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active"), promoterFilter(scope, s.users.id), filterIn(s.users.id, f.promoter)))
      .orderBy(asc(s.users.name)),
    filterOptions(scope),
  ]);
  const boards = await Promise.all(
    promoters.map(async (p) => {
      const stores = (await listAssignments(scope, p.id))
        .map((a) => ({ ...a, brands: scope.brandIds === null ? a.brands : a.brands.filter((b) => scope.brandIds!.includes(b.brandId)) }))
        .filter((a) => a.brands.length);
      return { p, stores };
    }),
  );
  const shown = f.q ? boards.filter(({ p, stores }) => matchText(f.q, p.name, p.region) || stores.some((a) => matchText(f.q, a.storeName, a.city, ...a.brands.map((b) => b.brandName)))) : boards;

  return (
    <>
      <PageHeader title="Roteiros" subtitle="Consulta do roteiro de cada promotor: clique na seta para ver o quadro da semana. Para incluir ou mudar loja, marca e dia, use o cadastro do promotor." />
      <FilterBar fields={["promoter", "q"]} options={options} qPlaceholder="Promotor, loja, cidade ou marca" />

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map(({ p, stores }) => {
            const days = new Set(stores.flatMap((a) => a.brands.flatMap((b) => b.weekdays)));
            const visits = stores.reduce((n, a) => n + a.brands.filter((b) => b.period === "week").reduce((m, b) => m + b.perWeek, 0), 0);
            return (
              <li key={p.id} className="bg-surface border border-line rounded-[var(--radius-card)] shadow-[var(--shadow-card)] overflow-hidden">
                <details className="group">
                  <summary className="flex items-center gap-3 px-5 py-3.5 cursor-pointer list-none hover:bg-subtle [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-5 text-muted shrink-0 transition-transform group-open:rotate-90" />
                    <span className="size-9 rounded-full bg-brand-50 text-brand-800 grid place-items-center shrink-0">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[15px]">{p.name}</span>
                      <span className="block text-[12.5px] text-muted">
                        {stores.length ? `${stores.length} loja(s) · ${days.size} dia(s) na semana${visits ? ` · ${visits} visita(s) por semana` : ""}` : "Sem lojas no roteiro"}
                        {p.region ? ` · ${p.region}` : ""}
                      </span>
                    </span>
                    {scope.role === "admin" ? (
                      <Link href={`/painel/cadastros/usuarios/${p.id}`} className="hidden sm:inline text-[12.5px] font-semibold text-brand-700 hover:underline shrink-0">
                        Ajustar no cadastro →
                      </Link>
                    ) : null}
                  </summary>
                  <div className="border-t border-line p-3">
                    {stores.length ? <RouteBoard stores={stores} /> : <p className="text-[13px] text-muted px-2 py-3">Nenhuma loja atribuída a este promotor. As lojas entram pelo quadro da semana no cadastro dele.</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="bg-surface border border-line rounded-[var(--radius-card)]">
          <EmptyState title="Nenhum promotor neste filtro" />
        </div>
      )}
    </>
  );
}
