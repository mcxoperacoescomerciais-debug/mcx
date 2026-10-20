import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, X } from "lucide-react";
import clsx from "clsx";
import { and, asc, eq } from "drizzle-orm";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { canManageTastings, listTastings, monthRange, type TastingRow } from "@/server/tastings";
import { shiftMonth } from "@/server/finance";
import { brl, CONTACT_STATUS_LABEL, MATERIALS_STATE_LABEL, monthLabel, TASTING_FLAG_LABEL, TASTING_FLAGS, TASTING_STATUS_DOT, TASTING_STATUS_LABEL, TASTING_STATUS_TONE, TASTING_STATUSES, pct } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { addDays, fmtDate, todayIso, weekdayOf } from "@/lib/dates";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge, buttonClass, inputClass, selectClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";
import { DegTabs } from "../_components/deg-tabs";

export const metadata: Metadata = { title: "Agenda de degustações" };

const WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

export default async function TastingAgenda({ searchParams }: PageProps<"/painel/degustacoes/agenda">) {
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const sp = await searchParams;
  const { from, to, month } = monthRange(one(sp.mes));
  const view = one(sp.view) === "lista" ? "lista" : "mes";
  const f = { brand: one(sp.brand), city: one(sp.city), store: one(sp.store), taster: one(sp.taster), status: one(sp.status), flag: one(sp.flag) };
  const day = one(sp.dia);
  const ev = one(sp.ev);
  const db = await getDb();
  const [rows, brands, tasters] = await Promise.all([
    listTastings(scope, { from, to, ...f }),
    db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(eq(s.brands.agencyId, scope.agencyId)).orderBy(asc(s.brands.name)),
    db.select({ id: s.tasters.id, name: s.tasters.name }).from(s.tasters).where(and(eq(s.tasters.agencyId, scope.agencyId))).orderBy(asc(s.tasters.name)),
  ]);
  const keep = { mes: month, view: view === "lista" ? "lista" : null, ...f };
  const byDay = new Map<string, TastingRow[]>();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
  const selected = ev ? rows.find((r) => r.id === ev) ?? null : null;
  const dayRows = day ? (byDay.get(day) ?? []) : [];

  // Grade do mês começando na segunda-feira.
  const first = from;
  const lead = (weekdayOf(first) + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = first; d <= to; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const today = todayIso();

  return (
    <>
      <DegTabs />
      <PageHeader
        title="Agenda de degustações"
        subtitle={`${monthLabel(month)} · ${rows.length} ação(ões) com estes filtros`}
        actions={
          <>
            <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
              <Link href={withParams({ ...keep, mes: shiftMonth(month, -1) })} aria-label="Mês anterior" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-l-lg">
                <ChevronLeft className="size-4" />
              </Link>
              <Link href={withParams({ ...keep, mes: null })} className="h-9 px-3 grid place-items-center text-[13px] font-semibold border-x border-line hover:bg-subtle">
                Este mês
              </Link>
              <Link href={withParams({ ...keep, mes: shiftMonth(month, 1) })} aria-label="Próximo mês" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-r-lg">
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
              <Link href={withParams({ ...keep, view: null })} aria-current={view === "mes" ? "page" : undefined} className={clsx("h-9 px-3 inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-l-lg", view === "mes" ? "bg-brand-800 text-white" : "hover:bg-subtle")}>
                <CalendarDays className="size-4" /> Mês
              </Link>
              <Link href={withParams({ ...keep, view: "lista" })} aria-current={view === "lista" ? "page" : undefined} className={clsx("h-9 px-3 inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-r-lg", view === "lista" ? "bg-brand-800 text-white" : "hover:bg-subtle")}>
                <List className="size-4" /> Lista
              </Link>
            </div>
            {canManageTastings(scope) ? (
              <LinkButton href={`/painel/degustacoes/nova${day ? `?data=${day}` : ""}`}>
                <Plus className="size-4" /> Nova
              </LinkButton>
            ) : null}
          </>
        }
      />

      {/* Filtros: marca, cidade, loja, degustadora e situação */}
      <form method="get" className="grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-7 gap-2 mb-5 no-print">
        <input type="hidden" name="mes" value={month} />
        {view === "lista" ? <input type="hidden" name="view" value="lista" /> : null}
        <select name="brand" defaultValue={f.brand ?? ""} className={selectClass} aria-label="Marca">
          <option value="">Todas as marcas</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input name="city" defaultValue={f.city ?? ""} placeholder="Cidade" className={inputClass} aria-label="Cidade" />
        <input name="store" defaultValue={f.store ?? ""} placeholder="Loja ou rede" className={inputClass} aria-label="Loja" />
        <select name="taster" defaultValue={f.taster ?? ""} className={selectClass} aria-label="Degustadora">
          <option value="">Todas as degustadoras</option>
          {tasters.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={f.status ?? ""} className={selectClass} aria-label="Situação">
          <option value="">Todas as situações</option>
          {TASTING_STATUSES.map((st) => (
            <option key={st} value={st}>
              {TASTING_STATUS_LABEL[st]}
            </option>
          ))}
        </select>
        <select name="flag" defaultValue={f.flag ?? ""} className={selectClass} aria-label="Pendência">
          <option value="">Qualquer pendência</option>
          {TASTING_FLAGS.map((fl) => (
            <option key={fl} value={fl}>
              {TASTING_FLAG_LABEL[fl]}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className={buttonClass("primary") + " flex-1"}>Filtrar</button>
          <Link href={withParams({ mes: month, view: view === "lista" ? "lista" : null })} className={buttonClass("secondary")} aria-label="Limpar filtros">
            <X className="size-4" />
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3 text-[12px] text-ink-2">
        {TASTING_STATUSES.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5">
            <span className={clsx("size-2.5 rounded-full", TASTING_STATUS_DOT[st])} /> {TASTING_STATUS_LABEL[st]}
          </span>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <div className={selected || day ? "xl:col-span-2" : "xl:col-span-3"}>
          {view === "mes" ? (
            <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
              <div className="grid grid-cols-7 bg-subtle border-b border-line">
                {WEEK.map((w) => (
                  <div key={w} className="px-2 py-2 text-[12px] font-bold text-muted text-center">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((d, i) => {
                  const list = d ? (byDay.get(d) ?? []) : [];
                  return (
                    <div key={i} className={clsx("min-h-24 sm:min-h-28 border-b border-r border-line p-1", !d && "bg-canvas/60", d === day && "bg-brand-50/60")}>
                      {d ? (
                        <>
                          <Link href={withParams({ ...keep, dia: d })} className={clsx("block text-[12px] font-bold px-1 rounded tnum", d === today ? "text-brand-700" : "text-ink-2")}>
                            {Number(d.slice(8))}
                            {list.length ? <span className="ml-1 text-[10.5px] font-semibold text-muted">· {list.length}</span> : null}
                          </Link>
                          <ul className="mt-0.5 space-y-0.5">
                            {list.slice(0, 3).map((r) => (
                              <li key={r.id}>
                                <Link href={withParams({ ...keep, dia: d, ev: r.id })} className={clsx("flex items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-subtle", r.id === ev && "bg-brand-100")} title={`${r.brandName} · ${r.storeName}`}>
                                  <span className={clsx("size-2 rounded-full shrink-0", TASTING_STATUS_DOT[r.status])} />
                                  <span className="truncate">
                                    {r.startTime ? `${r.startTime} ` : ""}
                                    {r.brandName}
                                  </span>
                                </Link>
                              </li>
                            ))}
                            {list.length > 3 ? (
                              <li>
                                <Link href={withParams({ ...keep, dia: d })} className="block px-1 text-[11px] font-semibold text-brand-700">
                                  +{list.length - 3} mais
                                </Link>
                              </li>
                            ) : null}
                          </ul>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : rows.length ? (
            <div className="bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
              <Table>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Marca · loja</Th>
                    <Th>Degustadora</Th>
                    <Th>Situação</Th>
                    <Th align="right">Receita</Th>
                    <Th align="right">Contribuição</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-subtle">
                      <Td className="whitespace-nowrap tnum">
                        <Link href={`/painel/degustacoes/${r.id}`} className="font-semibold hover:underline">
                          {fmtDate(r.date)}
                        </Link>
                        <span className="block text-[11.5px] text-muted">{[r.startTime, r.endTime].filter(Boolean).join("–") || "sem horário"}</span>
                      </Td>
                      <Td>
                        <Link href={`/painel/degustacoes/${r.id}`} className="font-semibold hover:underline">
                          {r.brandName}
                        </Link>
                        {r.sample ? <Badge className="ml-1.5">Exemplo</Badge> : null}
                        <span className="block text-[11.5px] text-muted">
                          {r.storeName} · {r.city}
                        </span>
                      </Td>
                      <Td>{r.tasterName ?? <span className="text-bad font-medium">Sem degustadora</span>}</Td>
                      <Td>
                        <StatusBadge tone={TASTING_STATUS_TONE[r.status]} size="sm">
                          {TASTING_STATUS_LABEL[r.status]}
                        </StatusBadge>
                        {r.docStatus === "pending" && r.status !== "cancelled" ? <span className="block text-[11px] text-warn font-semibold mt-0.5">documentação pendente</span> : null}
                        {r.pendingFinance ? <span className="block text-[11px] text-warn font-semibold">faturamento/pagamento pendente</span> : null}
                      </Td>
                      <Td align="right" className="tnum">{brl(r.status === "completed" ? r.actual.revenue : r.status === "cancelled" ? r.revenueCounted : r.planned.revenue)}</Td>
                      <Td align="right" className="tnum font-semibold">{r.status === "cancelled" ? brl(r.revenueCounted) : brl(r.status === "completed" ? r.actual.contribution : r.planned.contribution)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-[var(--radius-card)]">
              <EmptyState title="Nenhuma degustação com estes filtros" />
            </div>
          )}
        </div>

        {selected || day ? (
          <div className="space-y-5">
            {selected ? <Summary r={selected} /> : null}
            {day ? (
              <SectionCard title={`Degustações de ${fmtDate(day)}`} subtitle={`${dayRows.length} ação(ões)`} bodyClass="pb-2">
                {dayRows.length ? (
                  <ul className="divide-y divide-line border-t border-line">
                    {dayRows.map((r) => (
                      <li key={r.id}>
                        <Link href={withParams({ ...keep, dia: day, ev: r.id })} className={clsx("flex items-start gap-2.5 px-5 py-2.5 hover:bg-subtle", r.id === ev && "bg-brand-50")}>
                          <span className={clsx("size-2.5 rounded-full mt-1.5 shrink-0", TASTING_STATUS_DOT[r.status])} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold">
                              {r.startTime ?? "—"} · {r.brandName}
                            </span>
                            <span className="block text-[12px] text-muted truncate">
                              {r.storeName} · {r.city} · {r.tasterName ?? "sem degustadora"}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 pb-3 text-[13px] text-muted">Nenhuma ação neste dia.</p>
                )}
              </SectionCard>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Resumo ao clicar numa degustação da agenda. */
function Summary({ r }: { r: TastingRow }) {
  const m = r.status === "completed" ? r.actual : r.planned;
  return (
    <SectionCard
      title={
        <span className="inline-flex items-center gap-2">
          {r.brandName}
          {r.sample ? <Badge>Exemplo</Badge> : null}
        </span>
      }
      subtitle={`${fmtDate(r.date)} · ${[r.startTime, r.endTime].filter(Boolean).join(" às ") || "sem horário"}`}
      action={
        <StatusBadge tone={TASTING_STATUS_TONE[r.status]} size="sm">
          {TASTING_STATUS_LABEL[r.status]}
        </StatusBadge>
      }
      bodyClass="px-5 pb-5"
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
        <Item label="Loja" value={r.storeName} />
        <Item label="Cidade" value={r.city} />
        <Item label="Produto" value={r.product ?? "—"} />
        <Item label="Degustadora" value={r.tasterName ?? "Sem degustadora"} />
        <Item label="Confirmação" value={r.tasterId ? CONTACT_STATUS_LABEL[r.contactStatus] : "—"} />
        <Item label="Materiais" value={MATERIALS_STATE_LABEL[r.materials]} />
        <Item label={r.status === "completed" ? "Receita realizada" : "Receita prevista"} value={brl(r.status === "cancelled" ? r.revenueCounted : m.revenue)} />
        <Item label={r.status === "completed" ? "Custo realizado" : "Custo previsto"} value={brl(m.directCost)} />
        <Item label="Resultado" value={`${brl(r.status === "cancelled" ? r.revenueCounted : m.contribution)}${m.margin !== null && r.status !== "cancelled" ? ` (${pct(m.margin)})` : ""}`} />
      </dl>
      <LinkButton href={`/painel/degustacoes/${r.id}`} className="w-full mt-4">
        Abrir degustação
      </LinkButton>
    </SectionCard>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
