import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePlatform } from "@/server/auth";
import { listPlatformTeam } from "@/server/platform-team";
import { fmtAgo } from "@/lib/dates";
import { PLATFORM_ROLE_LABEL } from "@/lib/permissions";
import { PageHeader, StatusBadge, inputClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";
import { ActionForm } from "../../_components/action-form";
import { createMasterAction, setMasterStatusAction } from "../actions";

export const metadata: Metadata = { title: "Equipe MCX" };

/** Só o Dono: cadastra os membros Master da equipe MCX (acesso a todas as agências). */
export default async function TeamPage() {
  const user = await requirePlatform();
  if (user.platformRole !== "owner") redirect("/painel/mcx");
  const team = await listPlatformTeam(user);
  return (
    <>
      <PageHeader
        eyebrow="MCX · plataforma"
        title="Equipe MCX"
        subtitle="Dono: você — vê as agências e cadastra a equipe. Master: membros da MCX com acesso a todas as agências, sem cadastrar a equipe."
      />
      <div className="grid xl:grid-cols-3 gap-6">
        <SectionCard className="xl:col-span-2" title={`${team.length} membro(s)`} bodyClass="pb-1">
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Usuário</Th>
                <Th>Perfil</Th>
                <Th>Último acesso</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {team.map((m) => (
                <tr key={m.id}>
                  <Td className="font-semibold">{m.name}</Td>
                  <Td>{m.username}</Td>
                  <Td>{PLATFORM_ROLE_LABEL[m.platformRole ?? "master"]}</Td>
                  <Td className="text-muted text-[12.5px]">{m.lastLoginAt ? fmtAgo(m.lastLoginAt) : "nunca"}</Td>
                  <Td>
                    <StatusBadge tone={m.status === "active" ? "success" : "muted"} size="sm">
                      {m.status === "active" ? "Ativo" : "Inativo"}
                    </StatusBadge>
                  </Td>
                  <Td align="right">
                    {m.platformRole !== "owner" ? (
                      <ActionForm action={setMasterStatusAction} hidden={{ id: m.id, status: m.status === "active" ? "inactive" : "active" }} submitLabel={m.status === "active" ? "Desativar" : "Reativar"} variant="secondary" />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
        <SectionCard title="Novo membro Master" subtitle="Acesso a todas as agências (entra pelo seletor, como você). Troca a senha no primeiro acesso." bodyClass="px-5 pb-5">
          <ActionForm action={createMasterAction} hidden={{}} submitLabel="Cadastrar Master">
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Nome completo</span>
              <input name="name" required className={inputClass + " mt-1"} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Usuário (login)</span>
              <input name="username" required autoCapitalize="none" className={inputClass + " mt-1"} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Senha inicial</span>
              <input name="password" type="text" required autoComplete="off" className={inputClass + " mt-1"} />
            </label>
          </ActionForm>
        </SectionCard>
      </div>
    </>
  );
}
