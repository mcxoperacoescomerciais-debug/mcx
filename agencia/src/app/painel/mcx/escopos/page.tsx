import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requirePlatform } from "@/server/auth";
import { listScopeForms } from "@/server/scope-forms";
import { countAnswers } from "@/lib/scope-forms";
import { fmtAgo, fmtDateTime } from "@/lib/dates";
import { EmptyState, PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";
import { ActionForm } from "../../_components/action-form";
import { createScopeAction } from "./actions";
import { CopyLink } from "./copy-link";
import { scopeUrl } from "./link";

export const metadata: Metadata = { title: "Escopos de clientes" };

/** Checklists de escopo enviados a potenciais clientes da MCX. */
export default async function ScopesPage() {
  const user = await requirePlatform();
  const forms = await listScopeForms(user);
  const urls = await Promise.all(forms.map((f) => scopeUrl(f.token)));

  return (
    <>
      <PageHeader
        eyebrow="MCX · clientes"
        title="Escopos de clientes"
        subtitle="Monte o checklist de cada cliente e envie o link. O cliente marca De acordo ou Ressalva em cada item e confirma, sem precisar de login."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard className="xl:col-span-2" title={`${forms.length} escopo(s)`} bodyClass="pb-1">
          {!forms.length ? (
            <EmptyState icon={<ClipboardCheck className="size-8" />} title="Nenhum escopo criado">
              Crie o primeiro ao lado, a partir do modelo ou em branco.
            </EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Situação</Th>
                  <Th>Atualizado</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {forms.map((f, i) => {
                  const c = f.response ? countAnswers(f.response.answers) : null;
                  return (
                    <tr key={f.id} className={f.archivedAt ? "opacity-60" : ""}>
                      <Td>
                        <Link href={`/painel/mcx/escopos/${f.id}`} className="font-semibold text-ink hover:underline">
                          {f.clientName}
                        </Link>
                        <span className="block max-w-[22ch] truncate text-[12.5px] text-muted" title={f.title}>{f.title}</span>
                      </Td>
                      <Td>
                        {f.archivedAt ? (
                          <StatusBadge tone="muted" size="sm">Link desativado</StatusBadge>
                        ) : f.response ? (
                          <>
                            <StatusBadge tone={c?.reservations ? "warning" : "success"} size="sm">
                              {c?.reservations ? `Respondido · ${c.reservations} ressalva(s)` : "Respondido · tudo de acordo"}
                            </StatusBadge>
                            <span className="mt-0.5 block text-[12px] text-muted">
                              {f.response.signerName} · {fmtDateTime(f.response.submittedAt)}
                            </span>
                          </>
                        ) : (
                          <StatusBadge tone="info" size="sm">Aguardando resposta</StatusBadge>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap text-[12.5px] text-muted">{fmtAgo(f.updatedAt)}</Td>
                      <Td align="right">{f.archivedAt ? null : <CopyLink url={urls[i]} />}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </SectionCard>

        <SectionCard title="Novo escopo" subtitle="Depois de criar, você edita as seções e os itens antes de enviar." bodyClass="px-5 pb-5">
          <ActionForm action={createScopeAction} hidden={{}} submitLabel="Criar escopo">
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Cliente</span>
              <input name="clientName" required maxLength={120} placeholder="Nome da empresa" className={inputClass + " mt-1"} />
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Começar a partir de</span>
              <select name="base" defaultValue="modelo-admin" className={selectClass + " mt-1"}>
                <option value="modelo-admin">Modelo: administrativo, financeiro e operacional</option>
                <option value="">Em branco (escrever as perguntas)</option>
                {forms.length ? (
                  <optgroup label="Cópia de um escopo já criado">
                    {forms.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.clientName} — {f.title}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          </ActionForm>
        </SectionCard>
      </div>
    </>
  );
}
