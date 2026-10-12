import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatform } from "@/server/auth";
import { listAgencies } from "@/server/platform";
import { fmtDate } from "@/lib/dates";
import { Badge, PageHeader, inputClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";
import { ActionForm } from "../../_components/action-form";
import { createAgencyAction } from "../actions";

export const metadata: Metadata = { title: "Agências" };

export default async function AgenciesPage() {
  await requirePlatform();
  const agencies = await listAgencies();
  return (
    <>
      <PageHeader eyebrow="MCX" title="Agências" subtitle="Cada agência tem seus próprios cadastros, usuários e dados. Nenhuma vê a outra." />
      <div className="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
        <SectionCard title={`${agencies.length} agência(s)`} bodyClass="pb-1">
          <Table>
            <thead>
              <tr>
                <Th>Agência</Th>
                <Th align="right">Admins</Th>
                <Th align="right">Gestores</Th>
                <Th align="right">Promotores</Th>
                <Th align="right">Marcas</Th>
                <Th align="right">Lojas</Th>
                <Th>Desde</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <Link href={`/painel/mcx/agencias/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>
                  </Td>
                  <Td align="right">{a.users.admin}</Td>
                  <Td align="right">{a.users.manager}</Td>
                  <Td align="right">{a.users.promoter}</Td>
                  <Td align="right">{a.brands}</Td>
                  <Td align="right">{a.stores}</Td>
                  <Td className="text-muted">{fmtDate(a.createdAt.toISOString().slice(0, 10))}</Td>
                  <Td>{a.status === "active" ? <Badge tone="success">Ativa</Badge> : <Badge tone="danger">Suspensa</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>

        <SectionCard title="Nova agência" subtitle="Cria a agência e o primeiro administrador dela. Ele cadastra gestores, promotores, marcas e lojas da própria agência." bodyClass="px-5 pb-5">
          <ActionForm action={createAgencyAction} hidden={{}} submitLabel="Criar agência" resetOnSuccess={false}>
            <Labeled label="Nome da agência">
              <input name="name" required minLength={2} placeholder="Ex.: ETROS" className={inputClass} />
            </Labeled>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted pt-2">Primeiro administrador</p>
            <Labeled label="Nome completo">
              <input name="adminName" required minLength={2} className={inputClass} />
            </Labeled>
            <Labeled label="Usuário (login)" hint="Único no sistema todo. Sugestão: prefixo da agência, ex.: etros.maria">
              <input name="adminUsername" required minLength={3} autoCapitalize="none" className={inputClass} />
            </Labeled>
            <Labeled label="Senha inicial" hint="Mínimo 8 caracteres. Ele troca no primeiro acesso.">
              <input name="adminPassword" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
            </Labeled>
          </ActionForm>
        </SectionCard>
      </div>
    </>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[11.5px] text-muted mt-1">{hint}</span> : null}
    </label>
  );
}
