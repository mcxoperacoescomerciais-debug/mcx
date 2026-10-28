import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { ArrowDown, ArrowUp, CalendarPlus, Wand2 } from "lucide-react";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { filterOptions } from "@/server/operations";
import { allowedBrands, listDaySchedules } from "@/server/schedules";
import { matchText, parseFilters } from "@/lib/filters";
import { addDays, fmtDateTime, fmtLongDate, todayIso } from "@/lib/dates";
import { VISIT_STATUS_LABEL, VISIT_STATUS_TONE, type VisitStatus } from "@/lib/domain";
import { EmptyState, PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { SectionCard } from "../_components/widgets";
import { ActionForm, Disclosure } from "../_components/action-form";
import { cancelScheduleAction, createScheduleAction, generateAction, moveScheduleAction, updateScheduleAction } from "./actions";

export const metadata: Metadata = { title: "Programação" };

const AUDIT_LABEL: Record<string, string> = { created: "Criada", updated: "Alterada", cancelled: "Cancelada", reordered: "Reordenada", generated_from_routes: "Gerada dos roteiros" };

export default async function SchedulePage({ searchParams }: PageProps<"/painel/programacao">) {
  const scope = await getScope();
  if (scope.brandIds !== null) notFound();
  const f = parseFilters(await searchParams);
  const [allRows, options] = await Promise.all([listDaySchedules(scope, f.date, f.promoter), filterOptions(scope)]);
  const rows = f.q ? allRows.filter((r) => matchText(f.q, r.promoterName, r.storeName, r.city, ...r.brands.map((b) => b.name))) : allRows;
  const allowed = new Map(await Promise.all(rows.map(async (r) => [r.id, await allowedBrands(r.promoterId, r.storeId)] as const)));
  const brandName = new Map(options.brands.map((b) => [b.id, b.name]));
  const byPromoter = new Map<string, typeof rows>();
  for (const r of rows) byPromoter.set(r.promoterName, [...(byPromoter.get(r.promoterName) ?? []), r]);
  const db = await getDb();
  const history = await db
    .select({ log: s.auditLogs, userName: s.users.name })
    .from(s.auditLogs)
    .leftJoin(s.users, eq(s.users.id, s.auditLogs.userId))
    .where(and(eq(s.auditLogs.agencyId, scope.agencyId), eq(s.auditLogs.entity, "schedule")))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(15);
  const isPast = f.date < todayIso();

  return (
    <>
      <PageHeader title="Programação" subtitle={<span className="first-letter:uppercase inline-block">{fmtLongDate(f.date)} · lojas e marcas de cada promotor</span>} actions={<Link href="/painel/roteiros" className="text-[13px] font-semibold text-brand-700">Gerenciar roteiros →</Link>} />
      <FilterBar fields={["date", "promoter", "q"]} options={options} qPlaceholder="Promotor, loja, cidade ou marca" />

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          {byPromoter.size === 0 ? (
            <div className="bg-surface border border-line rounded-[var(--radius-card)]">
              <EmptyState title="Nenhuma loja programada nesta data">Adicione lojas ao lado ou gere a programação a partir dos roteiros.</EmptyState>
            </div>
          ) : null}
          {[...byPromoter.entries()].map(([name, list]) => (
            <SectionCard key={name} title={name} subtitle={`${list.filter((x) => x.status === "active").length} loja(s) ativa(s)`}>
              <ol className="divide-y divide-line border-t border-line" data-export-list data-export-title="Programação" data-export-columns="Promotor|Ordem|Horário|Loja|Cidade|Marcas|Origem|Situação|Visita">
                {list.map((r, idx) => (
                  <li key={r.id} data-export-row className={`px-5 py-3 ${r.status === "cancelled" ? "opacity-60" : ""}`}>
                    <span hidden>
                      <span data-export-cell>{name}</span>
                      <span data-export-cell>{idx + 1}</span>
                      <span data-export-cell>{r.plannedStart ?? ""}</span>
                      <span data-export-cell>{r.storeName}</span>
                      <span data-export-cell>{r.city}</span>
                      <span data-export-cell>{r.brands.map((b) => b.name).join(", ")}</span>
                      <span data-export-cell>{r.routeId ? "Roteiro" : "Avulsa"}</span>
                      <span data-export-cell>{r.status === "cancelled" ? `Cancelada: ${r.cancelReason ?? ""}` : "Ativa"}</span>
                      <span data-export-cell>{r.visitStatus ? VISIT_STATUS_LABEL[r.visitStatus as VisitStatus] : "Não iniciada"}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="size-7 rounded-full bg-brand-50 text-brand-800 grid place-items-center text-[12px] font-bold">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14px]">
                          {r.plannedStart ? <span className="tnum text-ink-2 mr-2">{r.plannedStart}</span> : null}
                          {r.storeName} <span className="text-muted font-normal text-[12.5px]">· {r.city}</span>
                        </p>
                        <p className="text-[12.5px] text-muted">
                          {r.brands.map((b) => b.name).join(", ")}
                          {r.routeId ? " · via roteiro" : ""}
                          {r.status === "cancelled" ? ` · cancelada: “${r.cancelReason}”` : ""}
                        </p>
                      </div>
                      {r.visitStatus ? (
                        <StatusBadge tone={VISIT_STATUS_TONE[r.visitStatus as VisitStatus]} size="sm">
                          Visita {VISIT_STATUS_LABEL[r.visitStatus as VisitStatus].toLowerCase()}
                        </StatusBadge>
                      ) : null}
                      {r.status === "active" ? (
                        <div className="flex">
                          <form action={moveScheduleAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button className="size-8 grid place-items-center rounded-lg hover:bg-subtle text-ink-2" aria-label="Mover para cima" disabled={idx === 0}>
                              <ArrowUp className="size-4" />
                            </button>
                          </form>
                          <form action={moveScheduleAction}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button className="size-8 grid place-items-center rounded-lg hover:bg-subtle text-ink-2" aria-label="Mover para baixo" disabled={idx === list.length - 1}>
                              <ArrowDown className="size-4" />
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                    {r.status === "active" && !isPast ? (
                      <div className="grid sm:grid-cols-2 gap-2 mt-2 ml-10">
                        <Disclosure label="Alterar horário ou marcas">
                          <ActionForm action={updateScheduleAction} hidden={{ id: r.id }} submitLabel="Salvar alteração" resetOnSuccess={false}>
                            <input type="time" name="plannedStart" defaultValue={r.plannedStart ?? ""} className={inputClass} aria-label="Horário previsto" />
                            <fieldset className="flex flex-wrap gap-3 text-[13px]">
                              {(allowed.get(r.id) ?? []).map((b) => (
                                <label key={b} className="inline-flex items-center gap-1.5">
                                  <input type="checkbox" name="brandIds" value={b} defaultChecked={r.brands.some((x) => x.id === b)} /> {brandName.get(b)}
                                </label>
                              ))}
                            </fieldset>
                            <input name="reason" required minLength={5} placeholder="Justificativa (obrigatória)" className={inputClass} />
                          </ActionForm>
                        </Disclosure>
                        {!r.visitStatus ? (
                          <Disclosure label="Cancelar esta loja" tone="danger">
                            <ActionForm action={cancelScheduleAction} hidden={{ id: r.id }} submitLabel="Cancelar programação" variant="danger">
                              <input name="reason" required minLength={5} placeholder="Motivo (obrigatório)" className={inputClass} />
                            </ActionForm>
                          </Disclosure>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            </SectionCard>
          ))}
        </div>

        <div className="space-y-6">
          <SectionCard title="Adicionar loja ao dia" subtitle="Também serve para trabalhos pontuais de freelancers" action={<CalendarPlus className="size-5 text-muted" />} bodyClass="px-5 pb-5">
            <ActionForm action={createScheduleAction} hidden={{ date: f.date }} submitLabel="Adicionar">
              <select name="promoterId" required className={selectClass} defaultValue={f.promoter ?? ""} aria-label="Promotor">
                <option value="">Promotor</option>
                {options.promoters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select name="storeId" required className={selectClass} defaultValue="" aria-label="Loja">
                <option value="">Loja</option>
                {options.stores.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} — {st.city}
                  </option>
                ))}
              </select>
              <input type="time" name="plannedStart" className={inputClass} aria-label="Horário previsto (opcional)" />
              <input name="notes" placeholder="Observação (opcional)" className={inputClass} />
              <p className="text-[12px] text-muted">As marcas são as autorizadas ao promotor nesta loja (ajuste depois em “Alterar”).</p>
            </ActionForm>
          </SectionCard>

          <SectionCard title="Gerar a partir dos roteiros" action={<Wand2 className="size-5 text-muted" />} bodyClass="px-5 pb-5">
            <ActionForm action={generateAction} hidden={{}} submitLabel="Gerar programação" variant="secondary">
              <div className="grid grid-cols-2 gap-2">
                <input type="date" name="from" defaultValue={f.date} className={inputClass} aria-label="De" />
                <input type="date" name="to" defaultValue={addDays(f.date, 6)} className={inputClass} aria-label="Até" />
              </div>
              <p className="text-[12px] text-muted">Cria as lojas dos roteiros ativos nos dias da semana configurados. O que já existe não é duplicado.</p>
            </ActionForm>
          </SectionCard>

          <SectionCard title="Histórico de alterações" bodyClass="px-5 pb-5">
            {history.length ? (
              <ul className="space-y-2 text-[12.5px]">
                {history.map(({ log, userName }) => (
                  <li key={log.id}>
                    <strong>{AUDIT_LABEL[log.action] ?? log.action}</strong> · {fmtDateTime(log.createdAt)} · {userName ?? "sistema"}
                    {log.reason ? <span className="block text-ink-2">“{log.reason}”</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Sem alterações registradas.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
