import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getScope, requireRole } from "@/server/auth";
import { ISSUE_KIND_LABEL, ISSUE_KINDS, WORK_MODE_LABEL } from "@/lib/domain";
import { Badge, PageHeader, inputClass } from "@/components/ui";
import { SectionCard } from "../_components/widgets";
import { ActionForm } from "../_components/action-form";
import { resendAlertAction, saveSettingsAction, testWhatsAppAction } from "../cadastros/actions";
import { SEVERITY_COLOR } from "@/lib/validity";
import { alertLog } from "@/server/whatsapp-alert";
import { fmtDate } from "@/lib/dates";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema as s } from "@/server/db";
import { GALLERY_POLICY_LABEL, type GalleryPolicy } from "@/lib/settings";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requireRole(["admin"]);
  const scope = await getScope();
  const st = scope.settings;
  const db = await getDb();
  const [log, promoters] = await Promise.all([
    alertLog(scope, 30),
    db
      .select({ id: s.users.id, name: s.users.name, username: s.users.username, galleryAllowed: s.users.galleryAllowed })
      .from(s.users)
      .where(and(eq(s.users.agencyId, scope.agencyId), eq(s.users.role, "promoter"), eq(s.users.status, "active")))
      .orderBy(asc(s.users.name)),
  ]);
  const near = Math.max(st.validityBands.critical, st.alerts.nearDays);
  return (
    <>
      <PageHeader title="Configurações" subtitle="Parâmetros da operação. Os valores iniciais são os mais seguros; toda alteração fica na auditoria." />
      <ActionForm action={saveSettingsAction} hidden={{}} submitLabel="Salvar configurações" resetOnSuccess={false}>
        <div className="grid xl:grid-cols-2 gap-6">
          <SectionCard title="Agência" bodyClass="px-5 pb-5 space-y-3">
            <Row label="Nome exibido nos relatórios">
              <input name="agencyName" defaultValue={scope.agencyName} className={inputClass} />
            </Row>
          </SectionCard>
          <SectionCard title="Forma de trabalho dos promotores" subtitle="Roteiro: o promotor recebe as lojas de cada dia. Carteira: recebe a meta de visitas por semana em cada marca de cada loja e escolhe o dia." bodyClass="px-5 pb-5">
            <Row label="Padrão da agência (cada promotor pode ter outra forma no cadastro)">
              <select name="defaultWorkMode" defaultValue={st.defaultWorkMode} className={inputClass}>
                <option value="route">{WORK_MODE_LABEL.route}</option>
                <option value="portfolio">{WORK_MODE_LABEL.portfolio}</option>
              </select>
            </Row>
          </SectionCard>
          <SectionCard title="Custos padrão do promotor (mensal)" subtitle="Preenchem automaticamente o cadastro de cada promotor (dá para ajustar um a um) e somam na folha de pagamento do Financeiro." bodyClass="px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              <Row label="Salário (R$)">
                <input name="cost_salary" inputMode="decimal" defaultValue={brlInput(st.promoterCost.salary)} placeholder="0,00" className={inputClass} />
              </Row>
              <Row label="Alimentação (R$)">
                <input name="cost_meal" inputMode="decimal" defaultValue={brlInput(st.promoterCost.meal)} placeholder="0,00" className={inputClass} />
              </Row>
              <Row label="Combustível (R$)">
                <input name="cost_fuel" inputMode="decimal" defaultValue={brlInput(st.promoterCost.fuel)} placeholder="0,00" className={inputClass} />
              </Row>
              <Row label="Outros (R$)">
                <input name="cost_other" inputMode="decimal" defaultValue={brlInput(st.promoterCost.other)} placeholder="0,00" className={inputClass} />
              </Row>
              <Row label="Encargos sobre o salário (%) — só vínculo fixo">
                <input name="cost_chargesPct" inputMode="decimal" defaultValue={String(st.promoterCost.chargesPct).replace(".", ",")} className={inputClass} />
              </Row>
            </div>
            <p className="text-[12px] text-muted mt-2">Padrão 27,44% = FGTS 8% + 13º 8,33% + férias com 1/3 11,11% (empresa do Simples Nacional). Freelancer não tem encargos.</p>
          </SectionCard>
          <SectionCard
            title="Fotos da galeria"
            subtitle="Quem pode escolher uma foto já salva no celular em vez de tirar na hora. A marca também precisa permitir (Cadastros › Marcas). Cada foto mostra no painel se veio da câmera ou da galeria."
            bodyClass="px-5 pb-5 space-y-3"
          >
            <Row label="Fotos da galeria">
              <select name="galleryPolicy" defaultValue={st.galleryPolicy} className={inputClass}>
                {(Object.keys(GALLERY_POLICY_LABEL) as GalleryPolicy[]).map((k) => (
                  <option key={k} value={k}>
                    {GALLERY_POLICY_LABEL[k]}
                  </option>
                ))}
              </select>
            </Row>
            <input type="hidden" name="gallery_list" value="1" />
            {promoters.length ? (
              <fieldset>
                <legend className="text-[12.5px] font-semibold text-ink-2 mb-1.5">Promotores autorizados (vale quando a opção acima é “Só os promotores autorizados”)</legend>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {promoters.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" name="gallery_user" value={p.id} defaultChecked={p.galleryAllowed} />
                      <span className="truncate">
                        {p.name} <span className="text-muted">· {p.username}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <p className="text-[12.5px] text-muted">Nenhum promotor ativo cadastrado.</p>
            )}
            <p className="text-[12px] text-muted">A mudança chega no celular do promotor na próxima atualização do app (em até 2 minutos com o app aberto, ou no botão Atualizar).</p>
          </SectionCard>
          <SectionCard title="Regras de campo" bodyClass="px-5 pb-5 space-y-3">
            <Check name="allowExceptions" checked={st.allowExceptions} label="Permitir exceção justificada para foto/estoque obrigatórios" help="A exceção exige motivo + justificativa e aparece para o gestor." />
            <Check name="allowIncompleteVisit" checked={st.allowIncompleteVisit} label="Permitir encerrar visita com marca pendente (com justificativa)" />
            <Check name="allowExtraVisits" checked={st.allowExtraVisits} label="Permitir visita fora da programação em loja autorizada (com justificativa)" />
            <Check name="captureLocation" checked={st.captureLocation} label="Registrar localização no início da visita (se o promotor permitir)" />
            <Row label="Distância máxima do check-in até a loja (metros)">
              <input type="number" name="checkinRadiusM" min={50} max={5000} step={10} defaultValue={st.checkinRadiusM} className={inputClass} />
            </Row>
            <p className="text-[12px] text-muted -mt-1">Check-in mais longe que isso do endereço da loja vira a pendência “Check-in fora da loja”. A imprecisão do GPS (até 200 m) conta a favor do promotor.</p>
            <Check name="requireApproval" checked={st.requireApproval} label="Gestor aprova ou reprova atendimentos concluídos" />
          </SectionCard>
          <SectionCard title="Acompanhamento" bodyClass="px-5 pb-5 space-y-3">
            <Row label="Tolerância de atraso (minutos após o horário previsto)">
              <input type="number" name="lateToleranceMin" min={0} max={600} defaultValue={st.lateToleranceMin} className={inputClass} />
            </Row>
            <Row label="Fim do dia operacional (o que não começou vira “Não realizada”)">
              <input type="time" name="dayEndsAt" defaultValue={st.dayEndsAt} className={inputClass} />
            </Row>
            <Row label="Divergência relevante entre levantamentos de estoque (%)">
              <input type="number" name="stockDivergencePct" min={5} max={1000} defaultValue={st.stockDivergencePct} className={inputClass} />
            </Row>
          </SectionCard>
          <SectionCard title="Faixas de validade" subtitle="Dias para vencer (limite de cada faixa). Acima de 'Monitoramento' é Normal; já vencido é Vencido." bodyClass="px-5 pb-5">
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["critical", "Crítico até", st.validityBands.critical],
                  ["high", "Alto até", st.validityBands.high],
                  ["attention", "Atenção até", st.validityBands.attention],
                  ["monitor", "Monitoramento até", st.validityBands.monitor],
                ] as const
              ).map(([k, label, v]) => (
                <label key={k} className="block">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2 mb-1">
                    <span className="size-2.5 rounded-full" style={{ background: SEVERITY_COLOR[k].solid }} /> {label} (dias)
                  </span>
                  <input type="number" name={`band_${k}`} min={0} max={730} defaultValue={v} className={inputClass} />
                </label>
              ))}
            </div>
          </SectionCard>
          <SectionCard
            title="Alerta de validade no WhatsApp"
            subtitle={`Quando o promotor finaliza um atendimento com validade próxima, chega no WhatsApp: ${scope.agencyName}, marca, promotor, loja, cidade, os itens e o link do PDF.`}
            bodyClass="px-5 pb-5 space-y-3"
          >
            <Row label="Validade próxima: avisar tudo que vence em até (dias), qualquer quantidade">
              <input type="number" name="alert_nearDays" min={0} max={365} defaultValue={st.alerts.nearDays} className={inputClass} />
            </Row>
            <p className="text-[12.5px] text-ink-2">
              Hoje avisa: <b>vencido ou vencendo em até {near} dias</b> <b>ou</b> grande quantidade:
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Row label="Grande quantidade: vence em até (dias)">
                <input type="number" name="alert_bulkDays" min={0} max={365} defaultValue={st.alerts.bulkDays} className={inputClass} />
              </Row>
              <Row label="e quantidade acima de">
                <input type="number" name="alert_bulkMinQty" min={0} defaultValue={st.alerts.bulkMinQty} className={inputClass} />
              </Row>
            </div>
            <Row label="Número do WhatsApp (com DDD; vários: separe por vírgula)">
              <input name="alert_phone" defaultValue={st.alerts.whatsappPhone} placeholder="31 99999-8888" className={inputClass} />
            </Row>
            <Row label={st.alerts.whatsappApiKey ? "Chave do CallMeBot — salva ✓ (vazio mantém; digite apagar para remover)" : "Chave (apikey) do CallMeBot"}>
              <input name="alert_apikey" type="password" autoComplete="off" placeholder={st.alerts.whatsappApiKey ? "••••••• (salva)" : "ex.: 1234567"} className={inputClass} />
            </Row>
            <p className="text-[12px] text-muted">Sem número e chave, nenhum alerta é enviado. Depois de salvar, use “Enviar mensagem de teste” abaixo.</p>
          </SectionCard>
          <SectionCard title="Prioridade das pendências" subtitle="1 = mais urgente. Define a ordem da Central de pendências." bodyClass="px-5 pb-5">
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              {ISSUE_KINDS.map((k) => (
                <label key={k} className="flex items-center justify-between gap-3 text-[13px]">
                  {ISSUE_KIND_LABEL[k]}
                  <input type="number" name={`p_${k}`} min={1} max={9} defaultValue={st.issuePriority[k]} className={inputClass + " w-20"} />
                </label>
              ))}
            </div>
          </SectionCard>
        </div>
      </ActionForm>
      <div className="mt-6 max-w-xl">
        <ActionForm action={testWhatsAppAction} hidden={{}} submitLabel="Enviar mensagem de teste no WhatsApp" resetOnSuccess={false}>
          <p className="text-[13px] text-ink-2">Envia uma mensagem de teste para o(s) número(s) salvo(s) no alerta de validade desta agência.</p>
        </ActionForm>
      </div>
      <SectionCard
        className="mt-6"
        title="Alertas de validade dos últimos 30 dias"
        subtitle={`Todo atendimento com produto que entra na regra acima (vence em até ${near} dias ou grande quantidade) e o que aconteceu com o WhatsApp dele.`}
        bodyClass="pb-2"
      >
        {log.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted text-left">
                  <th className="font-semibold px-5 py-2">Visita</th>
                  <th className="font-semibold px-2 py-2">Loja e marca</th>
                  <th className="font-semibold px-2 py-2">Promotor</th>
                  <th className="font-semibold px-2 py-2 text-right">Itens</th>
                  <th className="font-semibold px-2 py-2">WhatsApp</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {log.map((r) => (
                  <tr key={r.attendanceId} className="align-top">
                    <td className="px-5 py-2.5 tnum whitespace-nowrap">{fmtDate(r.visitDate)}</td>
                    <td className="px-2 py-2.5">
                      <span className="font-semibold">{r.store}</span> <span className="text-muted">· {r.city}</span>
                      <span className="block text-muted">{r.brand}</span>
                    </td>
                    <td className="px-2 py-2.5">{r.promoter}</td>
                    <td className="px-2 py-2.5 text-right tnum">{r.items}</td>
                    <td className="px-2 py-2.5">
                      {!r.finished ? (
                        <Badge tone="neutral">Atendimento não finalizado</Badge>
                      ) : r.status === "sent" ? (
                        <Badge tone="success">Enviado {r.sentAt ? fmtDate(r.sentAt.toISOString().slice(0, 10)).slice(0, 5) : ""}</Badge>
                      ) : r.status === "error" ? (
                        <>
                          <Badge tone="danger">Falhou</Badge>
                          <span className="block text-[11.5px] text-bad mt-1 max-w-64 break-words">{r.error}</span>
                        </>
                      ) : (
                        <Badge tone="warning">Não enviado</Badge>
                      )}
                    </td>
                    <td className="px-5 py-2">
                      {r.finished ? (
                        <ActionForm action={resendAlertAction} hidden={{ attendanceId: r.attendanceId }} submitLabel={r.status === "sent" ? "Reenviar" : "Enviar agora"} variant="secondary" resetOnSuccess={false} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-3 text-[13px] text-muted">Nenhum produto com validade próxima registrado nos últimos 30 dias.</p>
        )}
      </SectionCard>
    </>
  );
}

const brlInput = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Check({ name, checked, label, help }: { name: string; checked: boolean; label: string; help?: string }) {
  return (
    <label className="flex items-start gap-2 text-[13.5px]">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-1" />
      <span>
        {label}
        {help ? <span className="block text-[12px] text-muted">{help}</span> : null}
      </span>
    </label>
  );
}
