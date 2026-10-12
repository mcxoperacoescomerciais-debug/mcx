import type { Metadata } from "next";
import { isUuid } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, FileDown, History, MapPin, PencilLine, X } from "lucide-react";
import { getScope } from "@/server/auth";
import { getAttendanceDetail } from "@/server/details";
import {
  ATTENDANCE_STATUS_LABEL,
  ATTENDANCE_STATUS_TONE,
  EXCEPTION_ITEM_LABEL,
  EXCEPTION_REASON_LABEL,
  OCCURRENCE_CATEGORY_LABEL,
  OCCURRENCE_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  DAMAGE_KIND_LABEL,
  VALIDITY_LOCATION_LABEL,
  STOCK_STATE_LABEL,
  STOCK_STATE_TONE,
  UNIT_LABEL,
  VISIT_ORIGIN_LABEL,
  type StockDisplayState,
} from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtDuration, fmtTime } from "@/lib/dates";
import { isRelevantDivergence } from "@/lib/rules";
import { Badge, LinkButton, PageHeader, StatusBadge, inputClass } from "@/components/ui";
import { SeverityBadge } from "@/components/severity";
import { describeDays, formatIsoBr } from "@/lib/validity";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";
import { BeforeAfter, Gallery, type ViewerPhoto } from "../../_components/photo-viewer";
import { ActionForm, Disclosure } from "../../_components/action-form";
import { cancelCorrectionAction, occurrenceAction, requestCorrectionAction, reviewAttendanceAction } from "../../actions";

export const metadata: Metadata = { title: "Atendimento" };

const ACTION_LABEL: Record<string, string> = {
  started: "Iniciado",
  completed: "Concluído",
  cancelled: "Cancelado",
  finished: "Visita encerrada",
  status_changed: "Status alterado",
  correction_requested: "Correção solicitada",
  correction_answered: "Correção enviada pelo promotor",
  correction_cancelled: "Pedido de correção cancelado",
  approved: "Aprovado",
  rejected: "Reprovado",
};

export default async function AttendancePage({ params }: PageProps<"/painel/atendimentos/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  const d = await getAttendanceDetail(scope, id);
  if (!d) notFound();
  const a = d.attendance;
  const toViewer = (p: (typeof d.photos)[number], label: string, caption?: string): ViewerPhoto => ({
    id: p.id,
    kind: p.kind,
    label,
    takenAt: fmtDateTime(p.takenAt),
    uploaded: Boolean(p.uploadedAt),
    source: p.source,
    caption,
  });
  const before = d.photos.filter((p) => p.kind === "before").map((p) => toViewer(p, `Antes · ${d.brand.name} · ${d.store.name}`));
  const after = d.photos.filter((p) => p.kind === "after").map((p) => toViewer(p, `Depois · ${d.brand.name} · ${d.store.name}`));
  const informed = d.stockRows.filter((r) => r.entry).length;
  const openCorrection = d.corrections.find((c) => c.c.status === "open");
  const pctDiv = scope.settings.stockDivergencePct;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1 flex-wrap">
            <Link href={`/painel/visitas/${d.visit.id}`} className="hover:underline">
              Visita · {d.store.name}
            </Link>
            <ChevronRight className="size-3" /> Atendimento da marca
          </span>
        }
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {d.brand.name}
            <StatusBadge tone={ATTENDANCE_STATUS_TONE[a.status]}>{ATTENDANCE_STATUS_LABEL[a.status]}</StatusBadge>
            {a.reviewStatus !== "none" ? <StatusBadge tone={a.reviewStatus === "approved" ? "success" : "danger"}>{REVIEW_STATUS_LABEL[a.reviewStatus]}</StatusBadge> : null}
          </span>
        }
        subtitle={`${d.store.name} · ${[d.chainName, d.store.city].filter(Boolean).join(" · ")} · ${fmtDate(d.visit.visitDate)}`}
        actions={
          <LinkButton variant="secondary" href={`/api/reports/attendance/${a.id}`} prefetch={false}>
            <FileDown className="size-4" /> PDF do atendimento
          </LinkButton>
        }
      />

      <div className="space-y-3 mb-6">
        {openCorrection ? (
          <Notice tone="danger" icon={<PencilLine className="size-5" />}>
            <strong>Correção solicitada</strong> por {openCorrection.requestedByName} em {fmtDateTime(openCorrection.c.requestedAt)}: “{openCorrection.c.reason}”. Aguardando o promotor.
          </Notice>
        ) : null}
        {a.exceptionItems.length ? (
          <Notice tone="warning" icon={<AlertTriangle className="size-5" />}>
            <strong>Exceção justificada:</strong> {a.exceptionItems.map((i) => EXCEPTION_ITEM_LABEL[i]).join(", ")} — {a.exceptionReason ? EXCEPTION_REASON_LABEL[a.exceptionReason] : ""}. “{a.exceptionNote}”
          </Notice>
        ) : null}
        {a.status === "cancelled" ? (
          <Notice tone="warning" icon={<AlertTriangle className="size-5" />}>
            <strong>Atendimento cancelado pelo promotor:</strong> “{a.cancelReason}”
          </Notice>
        ) : null}
        {a.reviewStatus === "rejected" && a.reviewNote ? (
          <Notice tone="danger" icon={<X className="size-5" />}>
            <strong>Reprovado</strong> por {d.reviewerName} em {fmtDateTime(a.reviewedAt)}: “{a.reviewNote}”
          </Notice>
        ) : null}
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Foto do antes × foto do depois" subtitle="Clique para ampliar e navegar entre as fotos" bodyClass="px-5 pb-5">
            <BeforeAfter before={before} after={after} />
          </SectionCard>

          <SectionCard
            title="Relatório de estoque"
            subtitle={`${informed} de ${d.stockRows.length} produtos com informação · levantamento do promotor, não é saldo oficial da loja`}
          >
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Situação</Th>
                  <Th align="right">Quantidade</Th>
                  <Th align="right">Registro anterior</Th>
                  <Th>Observação</Th>
                </tr>
              </thead>
              <tbody>
                {d.stockRows.map(({ product, entry }) => {
                  const state: StockDisplayState = entry ? entry.state : "pending";
                  const prev = d.previous.get(product.id);
                  const divergent = entry && prev && isRelevantDivergence(prev.quantity, entry.quantity, pctDiv);
                  return (
                    <tr key={product.id}>
                      <Td>
                        <span className="font-medium">{product.name}</span>
                        <span className="block text-[11.5px] text-muted">
                          SKU {product.sku}
                          {product.ean ? ` · EAN ${product.ean}` : ""}
                          {product.category ? ` · ${product.category}` : ""}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge tone={STOCK_STATE_TONE[state]} size="sm">
                          {STOCK_STATE_LABEL[state]}
                        </StatusBadge>
                      </Td>
                      <Td align="right">{entry && entry.quantity !== null ? `${entry.quantity} ${entry.unit}` : "—"}</Td>
                      <Td align="right" className="text-muted">
                        {prev ? (
                          <span className={divergent ? "text-warn font-semibold" : ""} title={divergent ? `Variação acima de ${pctDiv}%` : undefined}>
                            {prev.quantity !== null ? prev.quantity : STOCK_STATE_LABEL[prev.state as StockDisplayState]} ({fmtDate(prev.date).slice(0, 5)}){divergent ? " ⚠" : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="text-muted">{entry?.note ?? ""}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            {d.unregistered.length ? (
              <div className="px-5 py-4 border-t border-line">
                <p className="text-[13px] font-semibold mb-2">Produtos encontrados fora do cadastro (conferir)</p>
                <ul className="text-[13px] space-y-1">
                  {d.unregistered.map((u) => (
                    <li key={u.id}>
                      <Badge tone="warning">Não cadastrado</Badge> {u.description}
                      {u.quantity !== null ? ` — ${u.quantity} encontrados` : ""}
                      {u.note ? ` · “${u.note}”` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="px-5 py-3 text-[12px] text-muted">Unidades: {Object.entries(UNIT_LABEL).map(([k, v]) => `${k} = ${v.toLowerCase()}`).join(" · ")}</p>
          </SectionCard>

          <SectionCard title={`Validades (${d.validities.length})`} subtitle="Classificação calculada sobre a data da visita">
            {d.validities.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th>Local</Th>
                    <Th>Validade</Th>
                    <Th>Situação</Th>
                    <Th align="right">Qtd.</Th>
                    <Th align="right">Preço</Th>
                    <Th>Lote</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.validities.map(({ v, productName, sku }) => (
                    <tr key={v.id} className="hover:bg-subtle">
                      <Td>
                        <span className="font-medium">{productName}</span>
                        <span className="block text-[11.5px] text-muted">
                          SKU {sku}
                          {v.note ? ` · “${v.note}”` : ""}
                        </span>
                      </Td>
                      <Td>{VALIDITY_LOCATION_LABEL[v.location]}</Td>
                      <Td className="tnum">
                        {formatIsoBr(v.expiryDate)}
                        <span className="block text-[11.5px] text-muted">{describeDays(v.daysToExpiry)}</span>
                      </Td>
                      <Td>
                        <SeverityBadge severity={v.severity} />
                      </Td>
                      <Td align="right" className="tnum">
                        {v.quantity} {v.unit}
                      </Td>
                      <Td align="right" className="tnum">
                        {((n: string | null) => (n === null ? "—" : `R$ ${Number(n).toFixed(2).replace(".", ",")}`))(v.price)}
                      </Td>
                      <Td>{v.lot ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="px-5 pb-5 text-[13.5px] text-muted">Nenhuma validade registrada neste atendimento.</p>
            )}
            {d.photos.some((p) => p.kind === "validity") ? (
              <div className="px-5 py-4 border-t border-line">
                <Gallery photos={d.photos.filter((p) => p.kind === "validity").map((p) => toViewer(p, `Validade · ${d.validities.find((x) => x.v.id === p.validityId)?.productName ?? ""}`))} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={`Rupturas (${d.ruptures.length})`} subtitle="Produtos marcados pelo promotor como “Ruptura total”">
            {d.ruptures.length ? (
              <ul className="px-5 pb-5 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13.5px]">
                {d.ruptures.map(({ rupture: r, productName, sku }) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <span className="mt-1.5 size-2 rounded-full bg-bad shrink-0" />
                    <span>
                      <span className="font-medium">{productName}</span>
                      <span className="block text-[11.5px] text-muted">
                        SKU {sku}
                        {r.fromStockSuggestion ? " · sugerida pelo estoque" : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[13.5px] text-muted">Nenhuma ruptura registrada neste atendimento.</p>
            )}
          </SectionCard>

          <SectionCard title={`Avarias (${d.damages.length})`}>
            {d.damages.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th>Tipo</Th>
                    <Th align="right">Qtd.</Th>
                    <Th>Validade</Th>
                    <Th>Lote</Th>
                    <Th>Foto</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.damages.map(({ d: x, productName, sku }) => {
                    const ph = d.photos.filter((p) => p.damageId === x.id).length;
                    return (
                      <tr key={x.id} className="hover:bg-subtle">
                        <Td>
                          <span className="font-medium">{productName}</span>
                          <span className="block text-[11.5px] text-muted">
                            SKU {sku}
                            {x.note ? ` · “${x.note}”` : ""}
                          </span>
                        </Td>
                        <Td>{DAMAGE_KIND_LABEL[x.kind]}</Td>
                        <Td align="right" className="tnum">
                          {x.quantity} {x.unit}
                        </Td>
                        <Td className="tnum">{formatIsoBr(x.expiryDate)}</Td>
                        <Td>{x.lot ?? "—"}</Td>
                        <Td>{ph ? `${ph} foto(s)` : <span className="text-bad">Sem foto</span>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <p className="px-5 pb-5 text-[13.5px] text-muted">Nenhuma avaria registrada neste atendimento.</p>
            )}
            {d.photos.some((p) => p.kind === "damage") ? (
              <div className="px-5 py-4 border-t border-line">
                <Gallery photos={d.photos.filter((p) => p.kind === "damage").map((p) => toViewer(p, `Avaria · ${d.damages.find((x) => x.d.id === p.damageId)?.productName ?? ""}`))} />
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={`Observações e ocorrências (${d.occurrences.length})`}>
            <div className="px-5 pb-5 space-y-4">
              {a.notes ? <p className="text-[13.5px]">Observação da execução: “{a.notes}”</p> : null}
              {d.occurrences.map((o) => (
                <div key={o.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-[14px]">{OCCURRENCE_CATEGORY_LABEL[o.category]}</p>
                    <StatusBadge tone={o.status === "open" ? "warning" : o.status === "resolved" ? "success" : "info"} size="sm">
                      {OCCURRENCE_STATUS_LABEL[o.status]}
                    </StatusBadge>
                  </div>
                  {o.note ? <p className="text-[13.5px] text-ink-2 mt-1">“{o.note}”</p> : null}
                  {o.action ? <p className="text-[12.5px] text-muted mt-1">Ação: {o.action} ({fmtDateTime(o.handledAt)})</p> : null}
                  <Gallery photos={d.photos.filter((p) => p.occurrenceId === o.id).map((p) => toViewer(p, OCCURRENCE_CATEGORY_LABEL[o.category]))} />
                  {o.status !== "resolved" ? (
                    <div className="mt-3">
                      <ActionForm action={occurrenceAction} hidden={{ id: o.id }} submitLabel="Registrar ação" variant="secondary">
                        <div className="flex flex-wrap gap-2">
                          <select name="status" className={inputClass + " w-auto"} defaultValue="analyzed" aria-label="Novo status">
                            <option value="analyzed">Analisada (continua em acompanhamento)</option>
                            <option value="resolved">Tratada</option>
                          </select>
                          <input name="action" required minLength={5} placeholder="Ação tomada" className={inputClass + " flex-1 min-w-[220px]"} />
                        </div>
                      </ActionForm>
                    </div>
                  ) : null}
                </div>
              ))}
              {!a.notes && !d.occurrences.length ? <p className="text-[13.5px] text-muted">Nenhuma observação registrada.</p> : null}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Identificação" bodyClass="px-5 pb-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <Info label="Promotor" value={d.promoterName} />
              <Info label="Data" value={fmtDate(d.visit.visitDate)} />
              <Info label="Início" value={fmtTime(a.startedAt)} />
              <Info label="Finalização" value={a.finishedAt ? fmtTime(a.finishedAt) : "—"} />
              <Info label="Duração" value={a.finishedAt ? fmtDuration(a.startedAt, a.finishedAt) : "Em andamento"} />
              <Info label="Visita" value={VISIT_ORIGIN_LABEL[d.visit.origin]} />
              <Info label="Loja" value={d.store.name} />
              <Info label="Rede" value={d.chainName ?? "—"} />
            </dl>
            {d.visit.geoStatus === "captured" && d.visit.lat !== null ? (
              <a
                href={`https://www.openstreetmap.org/?mlat=${d.visit.lat}&mlon=${d.visit.lng}#map=17/${d.visit.lat}/${d.visit.lng}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-brand-700 font-semibold"
              >
                <MapPin className="size-3.5" /> Localização no início da visita (±{Math.round(d.visit.accuracyM ?? 0)} m)
              </a>
            ) : (
              <p className="mt-3 text-[12.5px] text-muted">Localização: {d.visit.geoStatus === "denied" ? "não autorizada no aparelho" : d.visit.geoStatus === "disabled" ? "desativada" : "não registrada"}</p>
            )}
          </SectionCard>

          <SectionCard title="Execução" bodyClass="px-5 pb-5">
            {d.brand.activities.length ? (
              <ul className="space-y-1.5 text-[13.5px]">
                {d.brand.activities.map((act) => {
                  const ok = a.activitiesDone.includes(act);
                  return (
                    <li key={act} className="flex items-center gap-2">
                      {ok ? <Check className="size-4 text-ok" /> : <X className="size-4 text-muted" />}
                      <span className={ok ? "" : "text-muted"}>{act}</span>
                      <span className="sr-only">{ok ? "feito" : "não marcado"}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Marca sem atividades cadastradas.</p>
            )}
          </SectionCard>

          <SectionCard title="Ações do gestor" bodyClass="px-5 pb-5 space-y-3">
            {a.status === "completed" ? (
              <>
                {scope.settings.requireApproval ? (
                  <Disclosure label="Aprovar ou reprovar">
                    <ActionForm action={reviewAttendanceAction} hidden={{ id: a.id }} submitLabel="Registrar avaliação" resetOnSuccess={false}>
                      <select name="decision" className={inputClass} defaultValue="approved" aria-label="Decisão">
                        <option value="approved">Aprovar</option>
                        <option value="rejected">Reprovar</option>
                      </select>
                      <input name="note" placeholder="Comentário (obrigatório para reprovar)" className={inputClass} />
                    </ActionForm>
                  </Disclosure>
                ) : null}
                <Disclosure label="Solicitar correção ao promotor" tone="danger">
                  <ActionForm action={requestCorrectionAction} hidden={{ id: a.id }} submitLabel="Solicitar correção" variant="danger">
                    <textarea name="reason" required minLength={10} rows={3} placeholder="O que o promotor precisa corrigir?" className={inputClass + " h-auto py-2"} />
                    <p className="text-[12px] text-muted">O atendimento volta para o promotor. O registro atual fica guardado no histórico.</p>
                  </ActionForm>
                </Disclosure>
              </>
            ) : a.status === "correction_requested" ? (
              <Disclosure label="Cancelar pedido de correção">
                <ActionForm action={cancelCorrectionAction} hidden={{ id: a.id }} submitLabel="Cancelar pedido" variant="secondary">
                  <input name="reason" placeholder="Motivo (opcional)" className={inputClass} />
                </ActionForm>
              </Disclosure>
            ) : (
              <p className="text-[13px] text-muted">Ações disponíveis quando o atendimento estiver concluído.</p>
            )}
          </SectionCard>

          <SectionCard title="Histórico" subtitle="Quem fez o quê e quando" bodyClass="px-5 pb-5">
            <ol className="relative border-l border-line ml-1.5 space-y-3">
              {d.history.map(({ log, userName }) => (
                <li key={log.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-brand-600" />
                  <p className="text-[13px] font-semibold">
                    {log.entity === "visit" ? "Visita: " : ""}
                    {ACTION_LABEL[log.action] ?? log.action}
                  </p>
                  <p className="text-[12px] text-muted">
                    {fmtDateTime(log.createdAt)} · {userName ?? "sistema"}
                  </p>
                  {log.reason ? <p className="text-[12.5px] text-ink-2 mt-0.5">“{log.reason}”</p> : null}
                </li>
              ))}
            </ol>
            {d.corrections.length ? (
              <div className="mt-4 pt-3 border-t border-line">
                <p className="text-[12.5px] font-semibold mb-1.5 flex items-center gap-1.5">
                  <History className="size-3.5" /> Pedidos de correção
                </p>
                <ul className="text-[12.5px] space-y-1.5">
                  {d.corrections.map(({ c, requestedByName }) => (
                    <li key={c.id}>
                      {fmtDateTime(c.requestedAt)} · {requestedByName}: “{c.reason}” — <strong>{c.status === "open" ? "aberto" : c.status === "answered" ? `respondido ${fmtDateTime(c.answeredAt)}` : "cancelado"}</strong>
                      <span className="block text-muted">Registro original preservado no pedido.</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {d.removedPhotos.length ? (
              <p className="mt-3 text-[12.5px] text-muted">{d.removedPhotos.length} foto(s) substituída(s)/removida(s) — arquivos originais preservados.</p>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="font-semibold truncate tnum">{value}</dd>
    </div>
  );
}

function Notice({ tone, icon, children }: { tone: "danger" | "warning"; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-xl px-4 py-3 text-[13.5px] ${tone === "danger" ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn"}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div>{children}</div>
    </div>
  );
}
