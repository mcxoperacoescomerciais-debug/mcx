import type { Metadata } from "next";
import { getScope, requireRole, STAFF_ROLES } from "@/server/auth";
import { getClientSettings } from "@/server/settings";
import { Button, Card, PageHeader } from "@/components/ui";
import { SEVERITY_COLOR } from "@/lib/domain";
import { Field, FormNotice, Input } from "../_components/form";
import { saveSettingsAction } from "../admin/actions";

export const metadata: Metadata = { title: "Configurações" };

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="text-[12.5px] text-muted mt-0.5 mb-4">{subtitle}</p>
      {children}
    </Card>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/painel/configuracoes">) {
  await requireRole(STAFF_ROLES);
  const scope = await getScope();
  const st = await getClientSettings(scope.clientId);
  const sp = await searchParams;
  const extra = 2;

  return (
    <>
      <PageHeader title="Configurações" subtitle="Parâmetros da operação SUINCO. As mudanças valem para os próximos registros e cálculos; o histórico de cada visita guarda a classificação do dia." />
      <div className="mb-4">
        <FormNotice ok={sp.ok as string | undefined} error={sp.erro as string | undefined} />
      </div>
      <form action={saveSettingsAction} className="space-y-4 max-w-4xl">
        <Section title="Faixas de validade" subtitle="Limite superior de cada faixa, em dias para vencer. Acima de 'Monitoramento' é Normal; abaixo de zero é Vencido.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(
              [
                ["critical", "Crítico até", st.bands.critical],
                ["high", "Alto até", st.bands.high],
                ["attention", "Atenção até", st.bands.attention],
                ["monitor", "Monitoramento até", st.bands.monitor],
              ] as const
            ).map(([k, label, v]) => (
              <Field key={k} label={label} hint="dias">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full shrink-0" style={{ background: SEVERITY_COLOR[k === "monitor" ? "monitor" : k].solid }} />
                  <Input name={k} type="number" min={0} defaultValue={v} />
                </div>
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Índice de criticidade da loja" subtitle="Peso de cada tipo de ocorrência no índice. A loja vira 'Atenção' ou 'Crítica' ao atingir os limites.">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            {(
              [
                ["w_expired", "Vencido", st.weights.expired],
                ["w_critical", "Crítico", st.weights.critical],
                ["w_high", "Alto", st.weights.high],
                ["w_attention", "Atenção", st.weights.attention],
                ["w_rupture", "Ruptura", st.weights.rupture],
                ["w_damage", "Avaria", st.weights.damage],
              ] as const
            ).map(([k, label, v]) => (
              <Field key={k} label={`Peso ${label}`}>
                <Input name={k} type="number" min={0} defaultValue={v} />
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Field label="Loja em Atenção a partir de">
              <Input name="t_attention" type="number" min={0} defaultValue={st.storeThresholds.attention} />
            </Field>
            <Field label="Loja Crítica a partir de">
              <Input name="t_critical" type="number" min={0} defaultValue={st.storeThresholds.critical} />
            </Field>
          </div>
        </Section>

        <Section title="Regras de operação" subtitle="Alertas de cobertura e janela de correção do promotor.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Alerta de loja sem visita após" hint="dias">
              <Input name="staleVisitDays" type="number" min={1} defaultValue={st.staleVisitDays} />
            </Field>
            <Field label="Promotor pode corrigir a visita por" hint="horas após finalizar">
              <Input name="promoterEditHours" type="number" min={0} defaultValue={st.promoterEditHours} />
            </Field>
          </div>
        </Section>

        <Section title="Checklist da visita" subtitle="Itens que o promotor confirma ao finalizar. Deixe o texto vazio para remover um item.">
          <div className="space-y-2 max-w-xl">
            {st.checklist.map((c) => (
              <div key={c.key} className="flex items-center gap-2">
                <input type="hidden" name="checklist_key" value={c.key} />
                <Input name="checklist_label" defaultValue={c.label} />
              </div>
            ))}
            {Array.from({ length: extra }).map((_, i) => (
              <div key={`new-${i}`} className="flex items-center gap-2">
                <input type="hidden" name="checklist_key" value="" />
                <Input name="checklist_label" placeholder="Novo item (opcional)" />
              </div>
            ))}
          </div>
        </Section>

        <div className="flex justify-end">
          <Button type="submit" size="lg">
            Salvar configurações
          </Button>
        </div>
      </form>
    </>
  );
}
