import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, MessageCircle, Pencil } from "lucide-react";
import { getScope } from "@/server/auth";
import { canManageTastings, getTasting, tasterOptions } from "@/server/tastings";
import { isUuid } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import {
  brl,
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_TONE,
  CONTACT_STATUSES,
  DOC_STATUS_LABEL,
  FILE_KIND_LABEL,
  FILE_KINDS,
  inviteMessage,
  TASTING_STATUS_LABEL,
  TASTING_STATUS_TONE,
  whatsappLink,
  type TastingResult,
  pct,
} from "@/lib/tasting";
import { Badge, LinkButton, PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";
import { ActionForm, Disclosure } from "../../_components/action-form";
import { DegTabs } from "../_components/deg-tabs";
import { MaterialsChecklist } from "../_components/materials-checklist";
import { contactAction, fileAction, financeAction, selectTasterAction, statusAction } from "../actions";

export const metadata: Metadata = { title: "Degustação" };

const HISTORY_LABEL: Record<string, string> = {
  created: "Degustação cadastrada",
  updated: "Dados alterados",
  taster_selected: "Degustadora selecionada",
  contact: "Contato atualizado",
  status: "Situação alterada",
  material_checked: "Material conferido",
  material_unchecked: "Material desmarcado",
  finance: "Financeiro atualizado",
  file_added: "Arquivo anexado",
};

const moneyText = (v: number | null | undefined) => (v === null || v === undefined ? "" : v.toFixed(2).replace(".", ","));

export default async function TastingDetail({ params }: PageProps<"/painel/degustacoes/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const d = await getTasting(scope, id);
  if (!d) notFound();
  const t = d.tasting;
  const canEdit = canManageTastings(scope);
  const open = t.status !== "completed" && t.status !== "cancelled";
  const options = canEdit && open ? await tasterOptions(scope, t.city, t.date) : [];
  const time = [t.startTime, t.endTime].filter(Boolean).join(" às ") || "a confirmar";
  const materials = d.materials.map((m) => m.item).join(", ");
  const wa = d.taster
    ? whatsappLink(
        d.taster.phone,
        inviteMessage({ tasterName: d.taster.name, brandName: d.brand.name, date: fmtDate(t.date), time, storeName: t.storeName, city: t.city, product: t.product ?? "", materials: [materials, t.materialsNote].filter(Boolean).join(". "), fee: t.tasterFee }),
      )
    : null;

  return (
    <>
      <DegTabs />
      <PageHeader
        eyebrow={
          <Link href={`/painel/degustacoes/agenda?mes=${t.date.slice(0, 7)}&dia=${t.date}&ev=${t.id}`} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="size-3.5" /> Agenda
          </Link>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {d.brand.name} · {t.storeName}
            {t.sample ? <Badge>Exemplo</Badge> : null}
          </span>
        }
        subtitle={`${fmtDate(t.date)} · ${time} · ${t.city}/${t.state}`}
        actions={
          <>
            <StatusBadge tone={TASTING_STATUS_TONE[t.status]}>{TASTING_STATUS_LABEL[t.status]}</StatusBadge>
            {canEdit ? (
              <LinkButton variant="secondary" href={`/painel/degustacoes/${t.id}/editar`}>
                <Pencil className="size-4" /> Editar
              </LinkButton>
            ) : null}
          </>
        }
      />

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Resumo" bodyClass="px-5 pb-5">
            <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3 text-[13.5px]">
              <Item label="Marca" value={d.brand.name} />
              <Item label="Rede" value={t.chainName} />
              <Item label="Loja" value={t.storeName} />
              <Item label="Cidade" value={`${t.city}/${t.state}`} />
              <Item label="Data e horário" value={`${fmtDate(t.date)} · ${time}`} />
              <Item label="Produto" value={t.product} pending />
              <Item label="Degustadora" value={d.taster?.name ?? "Sem degustadora"} />
              <Item label="Confirmação" value={d.taster ? CONTACT_STATUS_LABEL[t.contactStatus] : "—"} />
              <Item label="Responsável interno" value={d.responsibleName} />
              <Item label="Pedido / campanha" value={t.orderRef} />
              <Item label="Código da ação" value={t.actionCode} />
              <Item label="Comprovação" value={`${t.photoProof ? "Exige fotos · " : ""}${DOC_STATUS_LABEL[t.docStatus]}`} />
              <Item label="Prazo de pagamento da marca" value={t.brandPaymentDue ? fmtDate(t.brandPaymentDue) : null} />
              <Item label="Prazo de pagamento da degustadora" value={t.tasterPaymentDue ? fmtDate(t.tasterPaymentDue) : null} />
              <Item label="Condições de faturamento" value={t.billingTerms} />
            </dl>
            {t.description ? <p className="text-[13.5px] text-ink-2 mt-4"><strong>Ação:</strong> {t.description}</p> : null}
            {t.materialsNote ? <p className="text-[13.5px] text-ink-2 mt-1"><strong>Materiais e orientações:</strong> {t.materialsNote}</p> : null}
            {t.requiredEvidence ? <p className="text-[13.5px] text-ink-2 mt-1"><strong>Evidências exigidas:</strong> {t.requiredEvidence}</p> : null}
            {t.notes ? <p className="text-[13.5px] text-ink-2 mt-1"><strong>Observações:</strong> {t.notes}</p> : null}
            {t.cancelReason ? <p className="text-[13.5px] text-bad mt-2"><strong>Cancelada:</strong> {t.cancelReason}{t.cancellationFee ? ` · multa/cobrança ${brl(t.cancellationFee)}` : ""}</p> : null}
          </SectionCard>

          <SectionCard title="Resultado financeiro" subtitle="Resultado de contribuição = receita − custos diretos (não é o lucro líquido da agência)" bodyClass="px-5 pb-5">
            <MoneyTable planned={d.planned} actual={d.actual} done={t.status === "completed"} />
            <div className="grid sm:grid-cols-3 gap-3 mt-4 text-[13px]">
              <Box label="Faturamento" value={t.billingStatus === "billed" ? `Faturada · ${brl(t.billedAmount)}` : "Não faturada"} sub={d.invoice ? `Fatura ${d.invoice.number ?? ""} de ${fmtDate(d.invoice.issueDate)}` : undefined} />
              <Box label="Recebimento" value={t.receiptStatus === "received" ? `Recebido · ${brl(t.receivedAmount)}` : "Pendente"} sub={t.receivedAt ? `em ${fmtDate(t.receivedAt)}` : undefined} />
              <Box label="Pagamento da degustadora" value={t.tasterPaymentStatus === "paid" ? `Pago · ${brl(t.paidAmount)}` : "Pendente"} sub={t.paidAt ? `em ${fmtDate(t.paidAt)}` : undefined} />
            </div>
            {canEdit ? (
              <div className="mt-4">
                <Disclosure label="Registrar valores efetivos, faturamento, recebimento e pagamento">
                  <ActionForm action={financeAction} hidden={{ id: t.id }} submitLabel="Salvar financeiro" resetOnSuccess={false}>
                    <p className="text-[12.5px] text-muted">Valores efetivos: deixe em branco o que foi igual ao previsto.</p>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <Money name="revenueActual" label="Receita efetiva" v={t.revenueActual} />
                      <Money name="taxesActual" label="Impostos efetivos" v={t.taxesActual} />
                      <Money name="tasterFeeActual" label="Degustadora (efetivo)" v={t.tasterFeeActual} />
                      <Money name="transportActual" label="Transporte (efetivo)" v={t.transportActual} />
                      <Money name="foodActual" label="Alimentação (efetivo)" v={t.foodActual} />
                      <Money name="materialsCostActual" label="Materiais (efetivo)" v={t.materialsCostActual} />
                      <Money name="otherCostActual" label="Outros (efetivo)" v={t.otherCostActual} />
                      <label className="block">
                        <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Documentação</span>
                        <select name="docStatus" defaultValue={t.docStatus} className={selectClass}>
                          {(["na", "pending", "ok"] as const).map((k) => (
                            <option key={k} value={k}>
                              {DOC_STATUS_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <fieldset className="rounded-xl border border-line p-3 space-y-2">
                        <legend className="px-1 text-[12px] font-bold text-ink-2">Faturamento</legend>
                        <select name="billingStatus" defaultValue={t.billingStatus} disabled={Boolean(t.invoiceId)} className={selectClass}>
                          <option value="not_billed">Não faturada</option>
                          <option value="billed">Faturada</option>
                        </select>
                        {t.invoiceId ? <input type="hidden" name="billingStatus" value="billed" /> : null}
                        <Money name="billedAmount" label="Valor faturado" v={t.billedAmount ?? d.actual.revenue} />
                      </fieldset>
                      <fieldset className="rounded-xl border border-line p-3 space-y-2">
                        <legend className="px-1 text-[12px] font-bold text-ink-2">Recebimento</legend>
                        <select name="receiptStatus" defaultValue={t.receiptStatus} className={selectClass}>
                          <option value="pending">Pendente</option>
                          <option value="received">Recebido</option>
                        </select>
                        <Money name="receivedAmount" label="Valor recebido" v={t.receivedAmount} />
                        <input type="date" name="receivedAt" defaultValue={t.receivedAt ?? ""} className={inputClass} aria-label="Data do recebimento" />
                      </fieldset>
                      <fieldset className="rounded-xl border border-line p-3 space-y-2">
                        <legend className="px-1 text-[12px] font-bold text-ink-2">Pagamento da degustadora</legend>
                        <select name="tasterPaymentStatus" defaultValue={t.tasterPaymentStatus} className={selectClass}>
                          <option value="pending">Pendente</option>
                          <option value="paid">Pago</option>
                        </select>
                        <Money name="paidAmount" label="Valor pago" v={t.paidAmount ?? d.actual.tasterCost} />
                        <input type="date" name="paidAt" defaultValue={t.paidAt ?? ""} className={inputClass} aria-label="Data do pagamento" />
                      </fieldset>
                    </div>
                  </ActionForm>
                </Disclosure>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Histórico" subtitle="Do cadastro à conclusão: quem fez e quando" bodyClass="pb-2">
            <ul className="divide-y divide-line border-t border-line">
              {d.history.map(({ a, by }) => {
                const after = (a.after ?? {}) as Record<string, unknown>;
                const detail =
                  a.action === "contact"
                    ? CONTACT_STATUS_LABEL[after.contactStatus as keyof typeof CONTACT_STATUS_LABEL]
                    : a.action === "status"
                      ? TASTING_STATUS_LABEL[after.status as keyof typeof TASTING_STATUS_LABEL]
                      : a.action === "taster_selected"
                        ? String(after.name ?? "")
                        : a.action.startsWith("material") || a.action === "file_added"
                          ? String(after.item ?? after.name ?? "")
                          : "";
                return (
                  <li key={a.id} className="px-5 py-2.5 text-[13px] flex flex-wrap gap-x-2">
                    <span className="tnum text-muted">{fmtDateTime(a.createdAt)}</span>
                    <span className="font-semibold">{HISTORY_LABEL[a.action] ?? a.action}</span>
                    {detail ? <span className="text-ink-2">· {detail}</span> : null}
                    {a.reason ? <span className="text-ink-2">· “{a.reason}”</span> : null}
                    <span className="text-muted">· {by ?? "sistema"}</span>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Degustadora" bodyClass="px-5 pb-5">
            {d.taster ? (
              <div className="rounded-xl bg-canvas p-3.5">
                <Link href={`/painel/degustacoes/degustadoras/${d.taster.id}`} className="font-semibold text-[15px] hover:underline">
                  {d.taster.name}
                </Link>
                <p className="text-[12.5px] text-muted">
                  {d.taster.city} · {d.taster.phone ? `+${d.taster.phone}` : "sem WhatsApp cadastrado"}
                </p>
                <div className="mt-2">
                  <StatusBadge tone={CONTACT_STATUS_TONE[t.contactStatus]} size="sm">
                    {CONTACT_STATUS_LABEL[t.contactStatus]}
                  </StatusBadge>
                </div>
                {wa && open ? (
                  <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-3 w-full h-11 rounded-xl bg-[#1FA855] text-white font-semibold text-[14px] inline-flex items-center justify-center gap-2 hover:brightness-95">
                    <MessageCircle className="size-5" /> Abrir conversa no WhatsApp
                  </a>
                ) : null}
                {wa && open ? <p className="text-[11.5px] text-muted mt-1.5">Abre o WhatsApp com a mensagem pronta. O envio é feito por você; depois registre abaixo a resposta.</p> : null}
              </div>
            ) : (
              <p className="text-[13.5px] text-bad font-medium">Nenhuma degustadora definida.</p>
            )}

            {canEdit && open && d.taster ? (
              <div className="mt-4">
                <ActionForm action={contactAction} hidden={{ id: t.id }} submitLabel="Atualizar contato">
                  <select name="status" defaultValue="" required className={selectClass} aria-label="Situação do contato">
                    <option value="" disabled>
                      Situação do contato…
                    </option>
                    {CONTACT_STATUSES.map((c) => (
                      <option key={c} value={c}>
                        {CONTACT_STATUS_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <input name="note" placeholder="Observação (opcional)" className={inputClass} />
                </ActionForm>
              </div>
            ) : null}

            {canEdit && open ? (
              <div className="mt-5">
                <p className="text-[12.5px] font-semibold text-ink-2 mb-1.5">{d.taster ? "Trocar degustadora" : "Selecionar degustadora"}</p>
                {options.length ? (
                  <ActionForm action={selectTasterAction} hidden={{ id: t.id }} submitLabel={d.taster ? "Trocar" : "Selecionar"} variant="secondary">
                    <select name="tasterId" required defaultValue="" className={selectClass} aria-label="Degustadora">
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {options
                        .filter((o) => o.id !== t.tasterId)
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.sameCity ? "★ " : ""}
                            {o.name} · {o.city}
                            {o.busy ? ` · já tem ${o.busy} ação(ões) no dia` : ""}
                            {o.usualFee !== null ? ` · ${brl(o.usualFee)}` : ""}
                          </option>
                        ))}
                    </select>
                    <p className="text-[11.5px] text-muted">★ = da cidade do evento. Cadastro não garante disponibilidade: confirme pelo WhatsApp.</p>
                  </ActionForm>
                ) : (
                  <p className="text-[13px] text-muted">
                    Nenhuma degustadora ativa.{" "}
                    <Link href="/painel/degustacoes/degustadoras/nova" className="font-semibold text-brand-700 hover:underline">
                      Cadastrar
                    </Link>
                  </p>
                )}
              </div>
            ) : null}

            {d.contacts.length ? (
              <div className="mt-5">
                <p className="text-[12.5px] font-semibold text-ink-2 mb-1.5">Histórico de contatos</p>
                <ul className="space-y-1.5 text-[12.5px]">
                  {d.contacts.map(({ c, name, by }) => (
                    <li key={c.id}>
                      <strong>{name}</strong> · {CONTACT_STATUS_LABEL[c.status]}
                      <span className="block text-muted">
                        {fmtDateTime(c.createdAt)} · {by ?? "—"}
                        {c.note ? ` · “${c.note}”` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="Materiais" subtitle={`Checklist de ${d.brand.name}`} bodyClass="px-5 pb-5">
            <MaterialsChecklist tastingId={t.id} items={d.materials.map((m) => ({ item: m.item, checked: m.checked }))} editable={canEdit && t.status !== "cancelled"} />
          </SectionCard>

          {canEdit ? (
            <SectionCard title="Andamento" bodyClass="px-5 pb-5 space-y-3">
              {open ? (
                <>
                  {t.status === "confirmed" ? <ActionForm action={statusAction} hidden={{ id: t.id, status: "in_progress" }} submitLabel="Marcar em andamento" variant="secondary" /> : null}
                  {t.status === "confirmed" || t.status === "in_progress" ? <ActionForm action={statusAction} hidden={{ id: t.id, status: "completed" }} submitLabel="Registrar conclusão" variant="success" /> : null}
                  <Disclosure label="Cancelar degustação" tone="danger">
                    <ActionForm action={statusAction} hidden={{ id: t.id, status: "cancelled" }} submitLabel="Cancelar" variant="danger">
                      <input name="reason" required placeholder="Motivo do cancelamento" className={inputClass} />
                      <label className="block">
                        <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Multa/cobrança à marca, se houver (R$)</span>
                        <input name="cancellationFee" inputMode="decimal" placeholder="0,00" className={inputClass} />
                      </label>
                    </ActionForm>
                  </Disclosure>
                </>
              ) : t.status === "cancelled" ? (
                <ActionForm action={statusAction} hidden={{ id: t.id, status: "awaiting_taster" }} submitLabel="Reabrir degustação" variant="secondary" />
              ) : (
                <p className="text-[13px] text-ok font-semibold">Concluída em {t.completedAt ? fmtDateTime(t.completedAt) : "—"}.</p>
              )}
            </SectionCard>
          ) : null}

          <SectionCard title="Anexos" subtitle="Cronograma, orientações, comprovantes, fotos e documentos" bodyClass="px-5 pb-5">
            {d.files.length ? (
              <ul className="space-y-1.5 mb-4">
                {d.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-[13px]">
                    <Download className="size-4 text-muted shrink-0" />
                    <a href={`/api/degustacoes/arquivos/${f.id}`} className="font-semibold text-brand-700 hover:underline truncate">
                      {f.name}
                    </a>
                    <span className="text-muted shrink-0">· {FILE_KIND_LABEL[f.kind]}{f.batchId && !f.tastingId ? " (importação)" : ""}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted mb-3">Nenhum arquivo.</p>
            )}
            {canEdit ? (
              <ActionForm action={fileAction} hidden={{ id: t.id }} submitLabel="Anexar" variant="secondary">
                <select name="kind" defaultValue="proof" className={selectClass} aria-label="Tipo de arquivo">
                  {FILE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FILE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input name="file" type="file" required accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.pptx,image/*" className="block w-full text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:font-semibold" />
                <p className="text-[11.5px] text-muted">Até 15 MB. Um arquivo novo nunca substitui outro: todos ficam guardados.</p>
              </ActionForm>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Item({ label, value, pending }: { label: string; value: string | null | undefined; pending?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className={value ? "font-semibold" : pending ? "text-warn font-medium" : "text-muted"}>{value || (pending ? "pendente" : "—")}</dd>
    </div>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="font-semibold">{value}</p>
      {sub ? <p className="text-[11.5px] text-muted">{sub}</p> : null}
    </div>
  );
}

function Money({ name, label, v }: { name: string; label: string; v: number | null | undefined }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      <input name={name} inputMode="decimal" defaultValue={moneyText(v)} placeholder="0,00" className={inputClass + " tnum"} />
    </label>
  );
}

function MoneyTable({ planned, actual, done }: { planned: TastingResult; actual: TastingResult; done: boolean }) {
  const rows: [string, keyof TastingResult, boolean?][] = [
    ["Receita (marca paga à agência)", "revenue"],
    ["Impostos / deduções", "taxes"],
    ["Receita líquida estimada", "netRevenue"],
    ["Degustadora", "tasterCost"],
    ["Demais custos diretos", "otherCosts"],
    ["Custo direto total", "directCost"],
    ["Resultado de contribuição", "contribution", true],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="text-[11.5px] uppercase tracking-wide text-muted">
            <th className="text-left font-semibold py-1.5"></th>
            <th className="text-right font-semibold py-1.5">Previsto</th>
            <th className="text-right font-semibold py-1.5">{done ? "Realizado" : "Realizado (após a ação)"}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([label, k, strong]) => (
            <tr key={k}>
              <td className={`py-2 ${strong ? "font-bold" : "text-ink-2"}`}>{label}</td>
              <td className={`py-2 text-right tnum ${strong ? "font-bold" : ""}`}>{brl(planned[k] as number)}</td>
              <td className={`py-2 text-right tnum ${strong ? "font-bold" : ""} ${done ? "" : "text-muted"}`}>{done ? brl(actual[k] as number) : "—"}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2 font-bold">Margem de contribuição</td>
            <td className="py-2 text-right tnum font-bold">{planned.margin === null ? "—" : pct(planned.margin)}</td>
            <td className="py-2 text-right tnum font-bold">{done ? (actual.margin === null ? "—" : pct(actual.margin)) : "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
