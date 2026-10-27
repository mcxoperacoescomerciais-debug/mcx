import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { listMyImprovements } from "@/server/improvements";
import { fmtDateTime } from "@/lib/dates";
import { IMPROVEMENT_STATUS_LABEL, IMPROVEMENT_STATUS_TONE } from "@/lib/improvements";
import { PageHeader, StatusBadge } from "@/components/ui";
import { ImprovementForm } from "@/components/improvement-form";
import { SectionCard } from "../_components/widgets";

export const metadata: Metadata = { title: "Sugerir melhoria" };

/** Qualquer usuário do painel sugere melhorias e acompanha as respostas da MCX. */
export default async function ImprovementsPage() {
  const user = await requireUser();
  const mine = await listMyImprovements(user);
  return (
    <>
      <PageHeader
        title="Sugerir melhoria"
        subtitle="Viu algo que poderia funcionar melhor no sistema? Conte para a equipe MCX. Cada sugestão é analisada e você acompanha a resposta aqui."
      />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <SectionCard title="Nova sugestão" bodyClass="px-5 pb-5">
          <ImprovementForm origin="Painel" />
        </SectionCard>
        <SectionCard title="Suas sugestões" subtitle={mine.length ? `${mine.length} enviada(s)` : "Nenhuma ainda."} bodyClass="px-5 pb-5">
          <ul className="divide-y divide-line">
            {mine.map((m) => (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{m.title}</p>
                  <StatusBadge tone={IMPROVEMENT_STATUS_TONE[m.status]} size="sm">
                    {IMPROVEMENT_STATUS_LABEL[m.status]}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-[12.5px] text-muted">Enviada em {fmtDateTime(m.createdAt)}</p>
                {m.reply ? <p className="mt-2 whitespace-pre-line rounded-lg bg-subtle px-3 py-2 text-[13.5px] text-ink-2">MCX: {m.reply}</p> : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </>
  );
}
