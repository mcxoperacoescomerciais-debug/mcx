import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requirePlatform } from "@/server/auth";
import { getScopeForm } from "@/server/scope-forms";
import { fmtDateTime } from "@/lib/dates";
import { LinkButton, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { ScopeSummary } from "@/components/scope-view";
import { SectionCard } from "../../../_components/widgets";
import { ActionForm } from "../../../_components/action-form";
import { archiveScopeAction, reopenScopeAction } from "../actions";
import { CopyLink } from "../copy-link";
import { scopeUrl } from "../link";
import { ScopeEditor } from "./editor";

export const metadata: Metadata = { title: "Escopo do cliente" };

export default async function ScopeDetailPage({ params }: PageProps<"/painel/mcx/escopos/[id]">) {
  const user = await requirePlatform();
  const data = await getScopeForm(user, (await params).id);
  if (!data) notFound();
  const { form, current, previous } = data;
  const url = await scopeUrl(form.token);

  return (
    <>
      <PageHeader
        eyebrow="MCX · Escopos de clientes"
        title={form.clientName}
        subtitle={form.title}
        actions={<LinkButton href="/painel/mcx/escopos" variant="secondary">Voltar</LinkButton>}
      />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {current ? (
            <SectionCard
              title="Resposta do cliente"
              subtitle={`Enviada em ${fmtDateTime(current.submittedAt)}. Os itens aparecem como estavam quando o cliente respondeu. Para imprimir ou salvar em PDF, use “Ver como o cliente”.`}
              bodyClass="px-5 pb-5"
            >
              <div className="rounded-2xl bg-[#f5f4f1] p-3 sm:p-5">
                <ScopeSummary response={current} showPrint={false} />
              </div>
            </SectionCard>
          ) : null}
          <SectionCard
            title="Conteúdo do escopo"
            subtitle={current ? "Já respondido: mudanças aqui só valem para uma nova resposta (reabra o escopo ao lado)." : "O cliente vê exatamente este conteúdo ao abrir o link."}
            bodyClass="px-5 pb-5"
          >
            <ScopeEditor initial={form} />
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Link do cliente" bodyClass="px-5 pb-5 space-y-3">
            {form.archivedAt ? (
              <StatusBadge tone="muted">Link desativado: o cliente vê “página não encontrada”.</StatusBadge>
            ) : (
              <>
                <p className="break-all rounded-lg bg-subtle px-3 py-2 font-mono text-[12.5px] text-ink-2">{url}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyLink url={url} size="md" />
                  <a href={url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>
                    <ExternalLink className="size-4" /> Ver como o cliente
                  </a>
                </div>
                <p className="text-[12.5px] text-muted">Envie pelo WhatsApp ou e-mail. Quem tiver o link consegue responder; não há login.</p>
              </>
            )}
            <ActionForm
              action={archiveScopeAction}
              hidden={{ id: form.id, archived: form.archivedAt ? "0" : "1" }}
              submitLabel={form.archivedAt ? "Reativar link" : "Desativar link"}
              variant="secondary"
            />
          </SectionCard>

          <SectionCard title="Situação" bodyClass="px-5 pb-5 space-y-3">
            {current ? (
              <>
                <StatusBadge tone="success">
                  Respondido por {current.signerName} ({current.signerRole})
                </StatusBadge>
                <p className="text-[12.5px] text-muted">Para o cliente responder de novo (por exemplo, depois de ajustar as ressalvas), reabra o escopo. A resposta atual fica no histórico.</p>
                <ActionForm action={reopenScopeAction} hidden={{ id: form.id }} submitLabel="Reabrir para nova resposta" variant="secondary" />
              </>
            ) : (
              <StatusBadge tone="info">Aguardando resposta</StatusBadge>
            )}
            {previous.length ? (
              <div className="border-t border-line pt-3">
                <p className="text-[13px] font-semibold text-ink-2">Respostas anteriores</p>
                <ul className="mt-1.5 space-y-1 text-[12.5px] text-muted">
                  {previous.map((p) => (
                    <li key={p.id}>
                      {fmtDateTime(p.submittedAt)} · {p.signerName} · {p.answers.filter((a) => a.choice === "reservation").length} ressalva(s)
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
