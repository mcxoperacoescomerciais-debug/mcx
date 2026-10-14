import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { EMPLOYMENT_LABEL, ROLE_LABEL, WORK_MODE_LABEL } from "@/lib/domain";
import { PageHeader, inputClass, selectClass } from "@/components/ui";
import { SectionCard } from "../../../_components/widgets";
import { ActionForm } from "../../../_components/action-form";
import { CheckList } from "../../../_components/check-list";
import { saveUserAction } from "../../actions";

export const metadata: Metadata = { title: "Usuário" };

export default async function UserPage({ params }: PageProps<"/painel/cadastros/usuarios/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  const scope = await getScope();
  const db = await getDb();
  const isNew = id === "novo";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [user] = isNew ? [null] : await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.agencyId, scope.agencyId)));
  if (!isNew && !user) notFound();
  const [brands, stores, managers, ub, us] = await Promise.all([
    db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(eq(s.brands.agencyId, scope.agencyId)).orderBy(asc(s.brands.name)),
    db
      .select({ id: s.stores.id, name: s.stores.name, city: s.stores.city, chain: s.chains.name })
      .from(s.stores)
      .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
      .where(and(eq(s.stores.agencyId, scope.agencyId), eq(s.stores.status, "active")))
      .orderBy(asc(s.stores.name)),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "manager"), eq(s.users.status, "active"))).orderBy(asc(s.users.name)),
    user ? db.select().from(s.userBrands).where(eq(s.userBrands.userId, user.id)) : Promise.resolve([]),
    user ? db.select().from(s.userStores).where(eq(s.userStores.userId, user.id)) : Promise.resolve([]),
  ]);
  const brandIds = ub.map((x) => x.brandId);

  return (
    <>
      <PageHeader eyebrow={<Link href="/painel/cadastros/usuarios" className="hover:underline">Usuários</Link>} title={user?.name ?? "Novo usuário"} subtitle={user ? `${ROLE_LABEL[user.role]} · ${user.username}` : "Promotor, gestor ou administrador"} />
      <SectionCard title="Dados e permissões" subtitle="Dados pessoais limitados ao necessário para a operação (LGPD). O app do promotor não exibe dados pessoais de outras pessoas." bodyClass="px-5 pb-5">
        <ActionForm action={saveUserAction} hidden={{ id: user?.id ?? "" }} submitLabel={user ? "Salvar usuário" : "Criar usuário"} resetOnSuccess={false}>
          <div className="grid md:grid-cols-3 gap-3">
            <Labeled label="Perfil">
              <select name="role" defaultValue={user?.role ?? "promoter"} className={selectClass}>
                <option value="promoter">Promotor</option>
                <option value="manager">Gestor da operação</option>
                <option value="admin">Administrador</option>
              </select>
            </Labeled>
            <Labeled label="Nome completo">
              <input name="name" required defaultValue={user?.name} className={inputClass} />
            </Labeled>
            <Labeled label="Usuário (login)">
              <input name="username" required defaultValue={user?.username} autoCapitalize="none" className={inputClass} />
            </Labeled>
            <Labeled label="E-mail (opcional)">
              <input name="email" type="email" defaultValue={user?.email ?? ""} className={inputClass} />
            </Labeled>
            <Labeled label="Telefone (opcional)">
              <input name="phone" defaultValue={user?.phone ?? ""} className={inputClass} />
            </Labeled>
            <Labeled label="Identificador interno">
              <input name="internalCode" defaultValue={user?.internalCode ?? ""} className={inputClass} />
            </Labeled>
            <Labeled label="Vínculo (promotor)">
              <select name="employment" defaultValue={user?.employment ?? "freelancer"} className={selectClass}>
                <option value="fixed">{EMPLOYMENT_LABEL.fixed}</option>
                <option value="freelancer">{EMPLOYMENT_LABEL.freelancer}</option>
              </select>
            </Labeled>
            <Labeled label="Forma de trabalho (promotor)">
              <select name="workMode" defaultValue={user?.workMode ?? ""} className={selectClass}>
                <option value="">Padrão da agência ({WORK_MODE_LABEL[scope.settings.defaultWorkMode]})</option>
                <option value="route">{WORK_MODE_LABEL.route}</option>
                <option value="portfolio">{WORK_MODE_LABEL.portfolio}</option>
              </select>
            </Labeled>
            <Labeled label="Região / roteiro">
              <input name="region" defaultValue={user?.region ?? ""} className={inputClass} />
            </Labeled>
            <Labeled label="Gestor responsável (promotor)">
              <select name="managerId" defaultValue={user?.managerId ?? ""} className={selectClass}>
                <option value="">—</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Acesso a marcas (gestor)">
              <select name="allBrands" defaultValue={user && !user.allBrands ? "restricted" : "all"} className={selectClass}>
                <option value="all">Todas as marcas</option>
                <option value="restricted">Somente as marcadas abaixo (ex.: cliente)</option>
              </select>
            </Labeled>
            <Labeled label="Status">
              <select name="status" defaultValue={user?.status ?? "active"} className={selectClass}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo (bloqueia acesso, mantém histórico)</option>
              </select>
            </Labeled>
            <Labeled label={user ? "Nova senha (deixe vazio para manter)" : "Senha inicial"}>
              <input name="password" type="password" required={!user} autoComplete="new-password" className={inputClass} />
            </Labeled>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" name="teamOnly" defaultChecked={user?.teamOnly ?? false} /> Gestor vê só os promotores sob sua responsabilidade
          </label>
          <CheckList name="brandIds" label="Marcas autorizadas (promotor) / visíveis (gestor restrito)" items={brands} selected={brandIds} />
          <CheckList name="storeIds" label="Lojas autorizadas (promotor)" items={stores.map((st) => ({ id: st.id, name: st.name, hint: [st.chain, st.city].filter(Boolean).join(" · ") }))} selected={us.map((x) => x.storeId)} />
          <p className="text-[12px] text-muted">Na troca de senha ou desativação, todas as sessões abertas do usuário são encerradas. O usuário troca a senha inicial no primeiro acesso.</p>
        </ActionForm>
      </SectionCard>
    </>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}
