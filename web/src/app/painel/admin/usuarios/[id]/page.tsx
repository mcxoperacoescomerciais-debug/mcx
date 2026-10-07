import type { Metadata } from "next";
import { ListSearch } from "@/app/painel/_components/list-search";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { Button, Card, PageHeader } from "@/components/ui";
import { ROLE_LABEL, STORE_FORMAT_LABEL, type StoreFormat } from "@/lib/domain";
import { Field, FormNotice, Input, Select } from "../../../_components/form";
import { saveUserAction } from "../../actions";

export const metadata: Metadata = { title: "Usuário" };

/** Mesmo formulário para criar (/novo) e editar (/[id]). */
export default async function UserFormPage({ params, searchParams }: PageProps<"/painel/admin/usuarios/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const sp = await searchParams;
  const scope = await getScope();
  const db = await getDb();
  const isNew = id === "novo";
  const [user] = isNew ? [null] : await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.tenantId, scope.tenantId)));
  if (!isNew && !user) notFound();

  const stores = await db
    .select({ id: s.stores.id, name: s.stores.name, code: s.stores.code, city: s.stores.city, format: s.stores.format, network: s.networks.name })
    .from(s.stores)
    .innerJoin(s.networks, eq(s.networks.id, s.stores.networkId))
    .where(and(eq(s.stores.clientId, scope.clientId), eq(s.stores.status, "active")))
    .orderBy(s.networks.name, s.stores.city, s.stores.name);
  const assigned = user ? new Set((await db.select({ storeId: s.storeAssignments.storeId }).from(s.storeAssignments).where(eq(s.storeAssignments.userId, user.id))).map((a) => a.storeId)) : new Set<string>();

  return (
    <>
      <PageHeader title={isNew ? "Novo usuário" : user!.name} subtitle={<Link href="/painel/admin/usuarios" className="hover:underline">← Usuários</Link>} />
      <div className="mb-4 max-w-4xl">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <form action={saveUserAction} className="space-y-4 max-w-4xl">
        {user ? <input type="hidden" name="id" value={user.id} /> : null}
        <Card className="p-5 grid md:grid-cols-2 gap-4">
          <Field label="Nome completo">
            <Input name="name" required defaultValue={user?.name ?? ""} />
          </Field>
          <Field label="Usuário (login)" hint="Sem espaços. Ex.: joao.pereira">
            <Input name="username" required defaultValue={user?.username ?? ""} autoComplete="off" />
          </Field>
          <Field label="Perfil">
            <Select name="role" defaultValue={user?.role ?? "promoter"}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={user?.status ?? "active"}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </Select>
          </Field>
          <Field label="Telefone">
            <Input name="phone" defaultValue={user?.phone ?? ""} inputMode="tel" />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" defaultValue={user?.email ?? ""} />
          </Field>
          <Field label="CPF ou identificador">
            <Input name="document" defaultValue={user?.document ?? ""} />
          </Field>
          <Field label={isNew ? "Senha inicial" : "Nova senha"} hint={isNew ? "Mínimo 6 caracteres. O usuário pode trocar depois no perfil." : "Deixe em branco para manter a atual."}>
            <Input name="password" type="password" autoComplete="new-password" required={isNew} minLength={6} />
          </Field>
        </Card>

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Lojas atendidas</h2>
          <p className="text-[12.5px] text-muted mt-0.5 mb-3">Vale para promotores: são as lojas que aparecem no app e as únicas em que ele pode registrar visitas.</p>
          <input type="hidden" name="stores_present" value="1" />
          <ListSearch placeholder="Pesquisar loja, número ou cidade..." className="mb-3" />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {stores.map((st) => (
              <label key={st.id} data-search-item className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-navy-50/50 cursor-pointer">
                <input type="checkbox" name="stores" value={st.id} defaultChecked={assigned.has(st.id)} className="mt-0.5 size-4 accent-[#0b1236]" />
                <span>
                  <b>{st.name}</b>
                  {st.code ? ` · ${st.code}` : ""}
                  <span className="block text-[11.5px] text-muted">
                    {st.city} · {st.network} {STORE_FORMAT_LABEL[st.format as StoreFormat]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Salvar usuário
          </Button>
        </div>
      </form>
    </>
  );
}
