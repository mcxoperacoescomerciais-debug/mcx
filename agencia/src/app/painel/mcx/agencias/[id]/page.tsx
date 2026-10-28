import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { agencyLogoUrl, requirePlatform } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { getClientAgency } from "@/server/platform";
import { ROLE_LABEL } from "@/lib/domain";
import { fmtAgo } from "@/lib/dates";
import { Badge, PageHeader, buttonClass, inputClass, selectClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../../_components/widgets";
import { ActionForm } from "../../../_components/action-form";
import { agencyLogoAction, agencyModulesAction, deleteAgencyAction, enterAgencyAction, updateAgencyAction } from "../../actions";
import { mergeSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Agência" };

export default async function AgencyPage({ params }: PageProps<"/painel/mcx/agencias/[id]">) {
  await requirePlatform();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const agency = await getClientAgency(id);
  if (!agency) notFound();
  const db = await getDb();
  const staff = await db
    .select({ id: s.users.id, name: s.users.name, username: s.users.username, role: s.users.role, status: s.users.status, lastLoginAt: s.users.lastLoginAt })
    .from(s.users)
    .where(and(eq(s.users.agencyId, id), ne(s.users.role, "promoter"), eq(s.users.platform, false)))
    .orderBy(asc(s.users.role), asc(s.users.name));
  const logo = agencyLogoUrl(agency);
  const settings = mergeSettings(agency.settings);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/painel/mcx/agencias" className="hover:underline">Agências</Link>}
        title={agency.name}
        subtitle={agency.status === "active" ? "Ativa" : "Suspensa — ninguém desta agência consegue entrar"}
        actions={
          <form action={enterAgencyAction}>
            <input type="hidden" name="agencyId" value={agency.id} />
            <button className={buttonClass("primary")}>
              Entrar no painel da {agency.name} <ArrowRight className="size-4" />
            </button>
          </form>
        }
      />
      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <SectionCard title="Dados" bodyClass="px-5 pb-5">
          <ActionForm action={updateAgencyAction} hidden={{ id: agency.id }} submitLabel="Salvar" resetOnSuccess={false}>
            <label className="block">
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Nome (aparece no painel, no app do promotor e nos relatórios)</span>
              <input name="name" required defaultValue={agency.name} className={inputClass} />
            </label>
            <label className="block">
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Acesso</span>
              <select name="status" defaultValue={agency.status} className={selectClass}>
                <option value="active">Ativa</option>
                <option value="suspended">Suspensa (bloqueia o acesso de todos; os dados ficam guardados)</option>
              </select>
            </label>
          </ActionForm>
        </SectionCard>

        <SectionCard title="Módulos e visão geral" subtitle="O que esta agência enxerga no painel. Desligado: o menu some e a página fica bloqueada." bodyClass="px-5 pb-5">
          <ActionForm action={agencyModulesAction} hidden={{ id: agency.id }} submitLabel="Salvar módulos" resetOnSuccess={false}>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" name="tastings" defaultChecked={settings.modules.tastings} /> Degustações
            </label>
            <label className="flex items-center gap-2 text-[13.5px]">
              <input type="checkbox" name="finance" defaultChecked={settings.modules.finance} /> Financeiro
            </label>
            <label className="block">
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Visão geral</span>
              <select name="overviewStyle" defaultValue={settings.overviewStyle} className={selectClass}>
                <option value="standard">Padrão (operação)</option>
                <option value="executive">Executiva (marca): ruptura, datas críticas, avarias e lojas não atendidas com gráficos</option>
              </select>
            </label>
          </ActionForm>
        </SectionCard>

        <SectionCard title="Logo" subtitle="PNG, JPG ou WebP até 400 KB, de preferência quadrado." bodyClass="px-5 pb-5">
          <div className="flex items-center gap-4 mb-4">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={`Logo ${agency.name}`} className="size-20 rounded-full object-cover bg-white ring-1 ring-line" />
            ) : (
              <span className="size-20 rounded-full bg-brand-800 text-white grid place-items-center font-bold text-2xl">{agency.name.slice(0, 1)}</span>
            )}
            <p className="text-[12.5px] text-muted">Aparece no topo do painel, no app do promotor e no cabeçalho dos PDFs. A MCX aparece apenas no rodapé.</p>
          </div>
          <ActionForm action={agencyLogoAction} hidden={{ id: agency.id }} submitLabel="Enviar logo">
            <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:font-semibold" />
          </ActionForm>
          {logo ? (
            <ActionForm action={agencyLogoAction} hidden={{ id: agency.id, remove: "1" }} submitLabel="Remover logo" variant="secondary" className="mt-3" />
          ) : null}
        </SectionCard>

        <SectionCard
          title="Administradores e gestores"
          subtitle="Para criar ou alterar usuários, entre no painel da agência → Usuários."
          className="lg:col-span-2"
          bodyClass="pb-1"
        >
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Usuário</Th>
                <Th>Perfil</Th>
                <Th>Último acesso</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id}>
                  <Td className="font-semibold">{u.name}</Td>
                  <Td className="text-muted">{u.username}</Td>
                  <Td>{ROLE_LABEL[u.role]}</Td>
                  <Td className="text-muted">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : "nunca"}</Td>
                  <Td>{u.status === "active" ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}</Td>
                </tr>
              ))}
              {!staff.length ? (
                <tr>
                  <Td className="text-muted">Nenhum administrador ou gestor. Entre no painel da agência para cadastrar.</Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
        </SectionCard>

        <SectionCard title="Excluir agência" subtitle="Apaga de vez a agência e tudo o que é dela: usuários, lojas, produtos, visitas, fotos, degustações e financeiro. Não dá para desfazer." bodyClass="px-5 pb-5" className="border-bad/30">
          <p className="text-[13px] text-ink-2 mb-3">
            Para só bloquear o acesso sem perder nada, use <strong>Suspensa</strong> acima. Para excluir, digite o nome da agência (<strong>{agency.name}</strong>):
          </p>
          <ActionForm action={deleteAgencyAction} hidden={{ id: agency.id }} submitLabel="Excluir agência definitivamente" variant="danger">
            <input name="confirm" required autoComplete="off" placeholder={agency.name} className={inputClass} aria-label="Nome da agência para confirmar" />
          </ActionForm>
        </SectionCard>
      </div>
    </>
  );
}
