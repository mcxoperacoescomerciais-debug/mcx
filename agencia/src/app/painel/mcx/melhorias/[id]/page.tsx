import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePlatform } from "@/server/auth";
import { getImprovement } from "@/server/improvements";
import { fmtDateTime } from "@/lib/dates";
import { ESFORCO_LABEL, FAZ_SENTIDO_LABEL, IMPACTO_LABEL, IMPROVEMENT_LIMITS, IMPROVEMENT_STATUS_LABEL, type ImprovementStatus } from "@/lib/improvements";
import { LinkButton, PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { SectionCard } from "../../../_components/widgets";
import { ActionForm } from "../../../_components/action-form";
import { reanalyzeImprovementAction, updateImprovementAction } from "@/app/_actions/improvements";

export const metadata: Metadata = { title: "Melhoria sugerida" };

export default async function McxImprovementPage({ params }: PageProps<"/painel/mcx/melhorias/[id]">) {
  const user = await requirePlatform();
  const row = await getImprovement(user, (await params).id);
  if (!row) notFound();
  const { request: r, agencyName } = row;
  const a = r.analysis;

  return (
    <>
      <PageHeader
        eyebrow="MCX · Melhorias sugeridas"
        title={r.title}
        subtitle={`${r.userName} (${r.userRole}) · ${agencyName} · ${fmtDateTime(r.createdAt)}${r.origin ? ` · enviada pelo ${r.origin}` : ""}`}
        actions={<LinkButton href="/painel/mcx/melhorias" variant="secondary">Voltar</LinkButton>}
      />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <SectionCard title="O que foi pedido" bodyClass="px-5 pb-5">
            <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{r.description}</p>
          </SectionCard>

          <SectionCard
            title="Análise do Claude"
            subtitle={r.analyzedAt ? `Feita em ${fmtDateTime(r.analyzedAt)}. É uma opinião para apoiar a decisão, não a decisão.` : undefined}
            bodyClass="px-5 pb-5 space-y-4"
          >
            {a ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={a.fazSentido === "sim" ? "success" : a.fazSentido === "parcial" ? "warning" : "muted"}>{FAZ_SENTIDO_LABEL[a.fazSentido]}</StatusBadge>
                  <StatusBadge tone={a.impacto === "alto" ? "success" : "neutral"} icon={false}>{IMPACTO_LABEL[a.impacto]}</StatusBadge>
                  <StatusBadge tone={a.esforco === "grande" ? "warning" : "neutral"} icon={false}>{ESFORCO_LABEL[a.esforco]}</StatusBadge>
                </div>
                <Block title="Resumo">{a.resumo}</Block>
                <Block title="Por quê">{a.justificativa}</Block>
                <Block title="Quem se beneficia">{a.quemSeBeneficia}</Block>
                {a.jaExiste ? <Block title="O sistema já tem algo parecido">{a.jaExiste}</Block> : null}
                <List title="Riscos e cuidados" items={a.riscos} />
                <List title="Perguntas para quem pediu" items={a.perguntas} />
                <Block title="Recomendação">{a.recomendacao}</Block>
              </>
            ) : (
              <p className="text-[14px] text-muted">
                {r.analysisStatus === "pending"
                  ? "Análise em andamento. Recarregue a página em alguns segundos."
                  : r.analysisStatus === "skipped"
                    ? "Análise automática desligada: falta configurar a chave da Anthropic (ANTHROPIC_API_KEY) no servidor."
                    : `A análise falhou: ${r.analysisError ?? "motivo desconhecido"}.`}
              </p>
            )}
            <ActionForm action={reanalyzeImprovementAction} hidden={{ id: r.id }} submitLabel={a ? "Analisar de novo" : "Analisar agora"} variant="secondary" />
          </SectionCard>
        </div>

        <SectionCard title="Decisão da MCX" subtitle="Quem pediu vê a situação e a resposta em “Suas sugestões”." bodyClass="px-5 pb-5">
          <ActionForm action={updateImprovementAction} hidden={{ id: r.id }} submitLabel="Salvar" resetOnSuccess={false}>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Situação</span>
              <select name="status" defaultValue={r.status} className={selectClass + " mt-1"}>
                {(Object.keys(IMPROVEMENT_STATUS_LABEL) as ImprovementStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {IMPROVEMENT_STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-semibold text-ink-2">Resposta para quem pediu (opcional)</span>
              <textarea name="reply" rows={4} maxLength={IMPROVEMENT_LIMITS.reply} defaultValue={r.reply ?? ""} className={inputClass + " !h-auto py-2 mt-1"} />
            </label>
          </ActionForm>
        </SectionCard>
      </div>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink-2">{title}</h3>
      <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink-2">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-relaxed text-ink">
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
