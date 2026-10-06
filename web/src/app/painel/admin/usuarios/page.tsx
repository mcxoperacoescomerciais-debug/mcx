import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain";
import { FormNotice } from "../../_components/form";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsersPage({ searchParams }: PageProps<"/painel/admin/usuarios">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const sp = await searchParams;
  const db = await getDb();
  const users = await db
    .select({
      id: s.users.id,
      name: s.users.name,
      username: s.users.username,
      role: s.users.role,
      status: s.users.status,
      phone: s.users.phone,
      lastLoginAt: s.users.lastLoginAt,
      stores: sql<number>`(select count(*) from ${s.storeAssignments} where ${s.storeAssignments.userId} = ${s.users.id})`.mapWith(Number),
    })
    .from(s.users)
    .where(and(eq(s.users.tenantId, scope.tenantId)))
    .orderBy(s.users.role, s.users.name);

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle="Promotores, gestores e administradores. Desativar um usuário encerra as sessões abertas dele."
        actions={
          <LinkButton href="/painel/admin/usuarios/novo">
            <Plus className="size-4" /> Novo usuário
          </LinkButton>
        }
      />
      <div className="mb-4">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line bg-navy-50/50">
              <th className="font-semibold px-5 py-2.5">Nome</th>
              <th className="font-semibold px-3 py-2.5">Usuário</th>
              <th className="font-semibold px-3 py-2.5">Perfil</th>
              <th className="font-semibold px-3 py-2.5 text-right">Lojas</th>
              <th className="font-semibold px-3 py-2.5">Último acesso</th>
              <th className="font-semibold px-5 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
                <td className="px-5 py-2.5">
                  <Link href={`/painel/admin/usuarios/${u.id}`} className="font-semibold hover:underline">
                    {u.name}
                  </Link>
                  {u.phone ? <div className="text-[12px] text-muted">{u.phone}</div> : null}
                </td>
                <td className="px-3 font-mono text-[12.5px]">{u.username}</td>
                <td className="px-3">{ROLE_LABEL[u.role]}</td>
                <td className="px-3 text-right tnum">{u.role === "promoter" ? u.stores : "—"}</td>
                <td className="px-3 text-[12.5px]">{u.lastLoginAt ? u.lastLoginAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca"}</td>
                <td className="px-5">{u.status === "active" ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
