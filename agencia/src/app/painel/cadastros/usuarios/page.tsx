import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { UserPlus } from "lucide-react";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { parseFilters } from "@/lib/filters";
import { EMPLOYMENT_LABEL, ROLE_LABEL, type Role } from "@/lib/domain";
import { fmtAgo } from "@/lib/dates";
import { matchesQuery } from "@/lib/rules";
import { LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "../../_components/filter-bar";
import { Table, Td, Th } from "../../_components/widgets";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: PageProps<"/painel/cadastros/usuarios">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const db = await getDb();
  const users = await db
    .select({
      u: s.users,
      brands: sql<number>`(select count(*)::int from ${s.userBrands} ub where ub.user_id = ${s.users.id})`,
      stores: sql<number>`(select count(*)::int from ${s.userStores} us where us.user_id = ${s.users.id})`,
    })
    .from(s.users)
    .where(and(eq(s.users.agencyId, scope.agencyId), f.kind ? eq(s.users.role, f.kind as Role) : undefined, f.status ? eq(s.users.status, f.status as "active" | "inactive") : undefined))
    .orderBy(asc(s.users.role), asc(s.users.name));
  const list = users.filter(({ u }) => matchesQuery(`${u.name} ${u.username} ${u.region ?? ""} ${u.internalCode ?? ""}`, f.q));

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={`${list.length} usuário(s) · desativar mantém todos os registros históricos`}
        actions={
          <LinkButton href="/painel/cadastros/usuarios/novo">
            <UserPlus className="size-4" /> Novo usuário
          </LinkButton>
        }
      />
      <FilterBar
        fields={["kind", "status", "q"]}
        options={{ kinds: (["admin", "manager", "promoter"] as Role[]).map((r) => ({ id: r, name: ROLE_LABEL[r] })), statuses: [{ id: "active", name: "Ativos" }, { id: "inactive", name: "Inativos" }] }}
        kindLabel="Todos os perfis"
        qPlaceholder="Nome, usuário ou região"
      />
      <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Usuário</Th>
              <Th>Perfil</Th>
              <Th>Vínculo / região</Th>
              <Th>Acesso</Th>
              <Th>Último acesso</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ u, brands, stores }) => (
              <tr key={u.id} className="hover:bg-subtle">
                <Td>
                  <Link href={`/painel/cadastros/usuarios/${u.id}`} className="font-semibold hover:underline">
                    {u.name}
                  </Link>
                </Td>
                <Td className="text-ink-2">{u.username}</Td>
                <Td>{ROLE_LABEL[u.role]}</Td>
                <Td className="text-ink-2">{[u.employment ? EMPLOYMENT_LABEL[u.employment] : null, u.region].filter(Boolean).join(" · ") || "—"}</Td>
                <Td className="text-[12.5px] text-ink-2">
                  {u.role === "promoter" ? `${brands} marca(s) · ${stores} loja(s)` : u.role === "manager" ? `${u.allBrands ? "Todas as marcas" : `${brands} marca(s)`}${u.teamOnly ? " · só equipe" : ""}` : "Total"}
                </Td>
                <Td className="text-muted">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : "Nunca"}</Td>
                <Td>
                  <StatusBadge tone={u.status === "active" ? "success" : "muted"} size="sm">
                    {u.status === "active" ? "Ativo" : "Inativo"}
                  </StatusBadge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </>
  );
}
