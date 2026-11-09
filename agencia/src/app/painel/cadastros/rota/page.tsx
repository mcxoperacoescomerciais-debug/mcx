import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { parseFilters } from "@/lib/filters";
import { matchesQuery } from "@/lib/rules";
import { todayIso } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "../../_components/filter-bar";
import { Table, Td, Th } from "../../_components/widgets";

export const metadata: Metadata = { title: "Rota Promotor" };

/** Rota Promotor: escolha o promotor para ajustar a rota fixa e ver a rota avulsa. */
export default async function PromoterRoutesPage({ searchParams }: PageProps<"/painel/cadastros/rota">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const db = await getDb();
  const promoters = await db
    .select({ id: s.users.id, name: s.users.name, region: s.users.region, username: s.users.username })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active")))
    .orderBy(asc(s.users.name));
  const ids = promoters.map((p) => p.id);
  const [targets, once] = ids.length
    ? await Promise.all([
        db.select({ promoterId: s.visitTargets.promoterId, storeId: s.visitTargets.storeId, perWeek: s.visitTargets.perWeek, period: s.visitTargets.period }).from(s.visitTargets).where(inArray(s.visitTargets.promoterId, ids)),
        db
          .select({ promoterId: s.schedules.promoterId })
          .from(s.schedules)
          .where(and(inArray(s.schedules.promoterId, ids), eq(s.schedules.status, "active"), eq(s.schedules.origin, "manual"), gte(s.schedules.date, todayIso()))),
      ])
    : [[], []];
  const list = promoters.filter((p) => matchesQuery(`${p.name} ${p.username} ${p.region ?? ""}`, f.q));

  return (
    <>
      <PageHeader title="Rota Promotor" subtitle="Rota fixa (lojas, marcas, dias e vezes) e rota avulsa de cada promotor. Dados pessoais, acesso e custos ficam em Usuários." />
      <FilterBar fields={["q"]} options={{}} qPlaceholder="Nome, usuário ou região" />
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        {list.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Promotor</Th>
                <Th align="right">Lojas na rota fixa</Th>
                <Th align="right">Atendimentos de marca por semana</Th>
                <Th align="right">Visitas avulsas a fazer</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const mine = targets.filter((t) => t.promoterId === p.id);
                return (
                  <tr key={p.id}>
                    <Td>
                      <Link href={`/painel/cadastros/rota/${p.id}`} className="font-semibold hover:underline">
                        {p.name}
                      </Link>
                      {p.region ? <span className="block text-[12px] text-muted">{p.region}</span> : null}
                    </Td>
                    <Td align="right">{new Set(mine.map((t) => t.storeId)).size}</Td>
                    <Td align="right">{mine.filter((t) => t.period === "week").reduce((n, t) => n + t.perWeek, 0)}</Td>
                    <Td align="right">{once.filter((o) => o.promoterId === p.id).length || "—"}</Td>
                    <Td align="right">
                      <Link href={`/painel/cadastros/rota/${p.id}`} className="text-[12.5px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
                        Abrir rota →
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhum promotor ativo encontrado">Cadastre o promotor em Usuários; a rota dele fica aqui.</EmptyState>
        )}
      </div>
    </>
  );
}
