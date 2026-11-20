import { PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { dailyGoal, listMessageTemplates, listStages } from "@/server/crm";
import { GoalForm, StageForm, TemplateForm } from "./forms";

export const metadata = { title: "Modelos e funil" };

export default async function CrmConfigPage() {
  const user = await requireCan("crm.view");
  const [templates, stages, goal] = await Promise.all([listMessageTemplates(user), listStages(), dailyGoal()]);
  const manage = can(user.role, "crm.manage");
  const stageOptions = stages.filter((st) => st.active && st.kind !== "won" && st.kind !== "lost").map((st) => ({ id: st.id, name: st.name }));
  const drafts = templates.filter(({ t }) => t.status !== "approved").length;
  return (
    <>
      <PageHeader title="Modelos e funil" subtitle="Textos prontos por etapa, etapas do funil e a meta de novos contatos." />

      <section className="mb-8" aria-labelledby="cfg-tpl">
        <h2 id="cfg-tpl" className="mb-2 text-sm font-bold text-ink-2">Modelos de mensagem</h2>
        {drafts > 0 && (
          <p className="mb-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
            {drafts} {drafts === 1 ? "modelo está" : "modelos estão"} em rascunho. Os textos iniciais são sugestões a validar: revise e {manage ? "aprove" : "peça ao dono para aprovar"}.
          </p>
        )}
        <div className="space-y-3">
          {templates.map(({ t, stageName }) => (
            <details key={t.id} className="card p-4">
              <summary className="cursor-pointer">
                <span className="font-semibold text-ink">{t.name}</span>
                <span className={t.status === "approved" ? "ml-2 rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok" : "ml-2 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn"}>
                  {t.status === "approved" ? "Aprovado" : t.toValidate ? "Rascunho — a validar" : "Rascunho"}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{stageName ?? "Qualquer etapa"}</span>
                <span className="mt-1 block text-sm text-ink-2">{t.body}</span>
              </summary>
              <div className="mt-4">
                <TemplateForm template={{ id: t.id, name: t.name, stageId: t.stageId, body: t.body, status: t.status }} stages={stageOptions} canApprove={manage} />
              </div>
            </details>
          ))}
          <section className="card p-4" aria-labelledby="cfg-tpl-new">
            <h3 id="cfg-tpl-new" className="mb-3 text-sm font-bold text-ink-2">Novo modelo</h3>
            <TemplateForm stages={stageOptions} canApprove={manage} />
          </section>
        </div>
      </section>

      <section className="mb-8" aria-labelledby="cfg-stages">
        <h2 id="cfg-stages" className="mb-2 text-sm font-bold text-ink-2">Etapas do funil</h2>
        {manage ? (
          <div className="card space-y-4 p-4">
            {stages.map((st) => (
              <StageForm key={st.id} stage={{ id: st.id, name: st.name, probability: st.probability, kind: st.kind, fixed: !!st.key, active: st.active }} />
            ))}
            <div className="border-t border-line pt-4">
              <StageForm />
            </div>
            <p className="text-xs text-muted">A chance de fechar pondera o pipeline no painel. As etapas iniciais podem ser renomeadas, mas não desativadas, porque têm regra própria (proposta, perdido, nutrição, ganho).</p>
          </div>
        ) : (
          <ul className="card divide-y divide-line px-4 text-sm">
            {stages.filter((st) => st.active).map((st) => (
              <li key={st.id} className="flex justify-between py-2">
                <span className="text-ink">{st.name}</span>
                <span className="text-muted">{st.probability}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cfg-goal">
        <h2 id="cfg-goal" className="mb-2 text-sm font-bold text-ink-2">Meta de novos contatos</h2>
        <div className="card p-4">{manage ? <GoalForm goal={goal} /> : <p className="text-sm text-ink-2">{goal} novos contatos por dia (definida pelo dono).</p>}</div>
      </section>
    </>
  );
}
