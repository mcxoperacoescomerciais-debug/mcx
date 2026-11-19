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
import { RolePicker } from "./role-picker";
import { PromoterCostForm } from "./promoter-cost-form";

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
  const [brands, managers, ub, us] = await Promise.all([
    db.select({ id: s.brands.id, name: s.brands.name, status: s.brands.status }).from(s.brands).where(eq(s.brands.agencyId, scope.agencyId)).orderBy(asc(s.brands.name)),
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
          <RolePicker initialRole={user?.role ?? "promoter"} initialPermissions={user?.permissions ?? null} isNew={!user} />
          <div className="grid md:grid-cols-3 gap-3">
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
            <Labeled label="Envio no WhatsApp (promotor)">
              <select name="photosOnlyShare" defaultValue={user?.photosOnlyShare ? "1" : ""} className={selectClass}>
                <option value="">Fotos e relatório juntos (padrão)</option>
                <option value="1">Só as fotos; o relatório vai copiado para colar na legenda</option>
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
              {/* Visível enquanto digita: evita salvar uma senha com erro de digitação. */}
              <input name="password" type="text" required={!user} autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputClass} />
            </Labeled>
          </div>
          <label className="inline-flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" name="teamOnly" defaultChecked={user?.teamOnly ?? false} /> Gestor vê só os promotores sob sua responsabilidade
          </label>
          {user?.role !== "promoter" ? <CheckList name="brandIds" label="Marcas visíveis (gestor restrito a marcas, ex.: cliente)" items={brands} selected={brandIds} /> : null}
          <p className="text-[12px] text-muted">Na troca de senha ou desativação, todas as sessões abertas do usuário são encerradas. O usuário troca a senha inicial no primeiro acesso.</p>
        </ActionForm>
      </SectionCard>
      {user?.role === "promoter" ? (
        <SectionCard className="mt-6" title="Rota do promotor" subtitle="Lojas, marcas, dias e vezes (rota fixa) e visitas de um dia só (rota avulsa) ficam em Cadastros e configurações › Rota Promotor." bodyClass="px-5 pb-5">
          <Link href={`/painel/cadastros/rota/${user.id}`} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-800 text-white text-[13.5px] font-semibold hover:bg-brand-900">
            Abrir a Rota Promotor de {user.name} →
          </Link>
        </SectionCard>
      ) : null}
      {user?.role === "promoter" && scope.role === "admin" && scope.brandIds === null ? (
        <SectionCard className="mt-6" title="Custos do promotor (mensal)" subtitle="Salário, alimentação, combustível e encargos que a agência paga. Já vêm com o padrão de Configurações; o total entra na folha de pagamento do Financeiro." bodyClass="px-5 pb-5">
          <div id="custos" />
          <PromoterCostForm
            userId={user.id}
            fixed={user.employment !== "freelancer"}
            own={{ salary: user.costSalary, meal: user.costMeal, fuel: user.costFuel, charges: user.costCharges, other: user.costOther }}
            defaults={scope.settings.promoterCost}
          />
        </SectionCard>
      ) : null}
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
