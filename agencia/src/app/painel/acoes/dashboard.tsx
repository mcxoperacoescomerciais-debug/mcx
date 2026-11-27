/**
 * Painel de ações (modo ações): operação, resultado e qualidade, com filtros de
 * período, marca, cidade, rede e promotora. É a visão geral das agências de
 * degustação e ativação.
 */
import Link from "next/link";
import { CalendarCheck2, Clock3, FileText, Handshake, Megaphone, ShoppingCart, Sparkles, Timer, XCircle } from "lucide-react";
import type { Scope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { loadActions, summarize, type Group } from "@/server/actions-data";
import { parseFilters, withParams } from "@/lib/filters";
import { fmtDate } from "@/lib/dates";
import { brl } from "@/lib/tasting";
import { ACCEPTANCE_LABEL, pct } from "@/lib/actions";
import { OCCURRENCE_CATEGORY_LABEL, type OccurrenceCategory } from "@/lib/domain";
import { PageHeader, buttonClass } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { KpiCard, RankBar, SectionCard, Table, Td, Th } from "../_components/widgets";
import { DailyBars } from "../_components/daily-bars";

const n = (v: number) => v.toLocaleString("pt-BR");
const acc = (v: number | null) => (v === null ? "—" : `${v.toFixed(1).replace(".", ",")} · ${ACCEPTANCE_LABEL[Math.round(v)] ?? ""}`);

export async function ActionsDashboard({ scope, sp }: { scope: Scope; sp: Record<string, string | string[] | undefined> }) {
  const f = parseFilters(sp, 60);
  const [list, options] = await Promise.all([loadActions(scope, f), filterOptions(scope)]);
  const sum = summarize(list);
  const o = sum.operation;
  const r = sum.result;
  const q = sum.quality;
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, city: f.city, promoter: f.promoter };

  return (
    <>
      <PageHeader
        eyebrow="Ações · degustação e ativação"
        title="Painel de ações"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · agenda, execução e resultado das ações nos PDVs`}
        actions={
          <Link href={`/painel/acoes/relatorio${withParams({ brand: f.brand, from: f.from, to: f.to })}`} className={buttonClass("primary")}>
            <FileText className="size-4" /> Relatório para a marca
          </Link>
        }
      />
      <FilterBar range={{ from: f.from, to: f.to }} fields={["period", "brand", "city", "chain", "promoter"]} options={options} />

      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted mt-2 mb-2">Operação</h2>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KpiCard label="Ações agendadas" value={n(o.due)} sub={o.upcoming ? `+ ${o.upcoming} nos próximos dias` : "até hoje no período"} href={`/painel/degustacoes/agenda`} icon={<CalendarCheck2 className="size-4" />} />
        <KpiCard label="Realizadas" value={n(o.realized)} tone="success" sub={o.due ? `${pct(o.realized / o.due, 0)} das agendadas` : undefined} icon={<Megaphone className="size-4" />} />
        <KpiCard label="Taxa de cancelamento" value={pct(o.cancelRate)} tone={o.cancelRate && o.cancelRate > 0.1 ? "warning" : "neutral"} sub={`${o.cancelled} cancelada(s) · ${o.notDone} não realizada(s)`} icon={<XCircle className="size-4" />} />
        <KpiCard label="Pontualidade" value={pct(o.onTime, 0)} tone={o.onTime !== null && o.onTime < 0.85 ? "warning" : "success"} sub="check-in até 10 min do horário" icon={<Clock3 className="size-4" />} />
        <KpiCard label="Horas em ação" value={`${Math.round(o.hours)} h`} sub="check-in a check-out" icon={<Timer className="size-4" />} />
      </div>

      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted mt-6 mb-2">Resultado</h2>
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <KpiCard label="Pessoas abordadas" value={n(r.approached)} icon={<Handshake className="size-4" />} sub={o.realized ? `${n(Math.round(r.approached / Math.max(1, r.withResult)))} por ação` : undefined} />
        <KpiCard label="Amostras distribuídas" value={n(r.samples)} icon={<Sparkles className="size-4" />} />
        <KpiCard label="Vendas na ação" value={`${n(r.sold)} un.`} icon={<ShoppingCart className="size-4" />} />
        <KpiCard label="Conversão" value={pct(r.conversion)} tone="success" sub="vendas ÷ abordagens" />
        <KpiCard label="Aceitação média" value={r.acceptance === null ? "—" : r.acceptance.toFixed(1).replace(".", ",")} sub={r.acceptance === null ? undefined : `${ACCEPTANCE_LABEL[Math.round(r.acceptance)]} (escala 1 a 5)`} />
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mt-6">
        <SectionCard title="Ações por dia" subtitle="Realizadas no período" className="xl:col-span-2" bodyClass="px-5 pb-5">
          <DailyBars data={sum.daily.map((d) => ({ date: d.date, n: d.realized }))} from={f.from} to={f.to} label="Ações realizadas" />
        </SectionCard>
        <SectionCard title="Qualidade" subtitle="Fotos e ocorrências registradas pelas promotoras" bodyClass="px-5 pb-5 space-y-4">
          <div>
            <p className="text-[13px] text-muted">Ações com as 3 fotos (montagem, ação e encerramento)</p>
            <p className="text-[26px] font-bold tnum">{pct(q.photosComplete, 0)}</p>
            <p className="text-[12px] text-muted">{q.appRecorded} ação(ões) registradas no app</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold mb-2">Ocorrências por tipo</p>
            {q.occurrences.length ? (
              <ul className="space-y-1.5 text-[13px]">
                {q.occurrences.map((x) => (
                  <li key={x.category} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">{OCCURRENCE_CATEGORY_LABEL[x.category as OccurrenceCategory] ?? x.category}</span>
                    <RankBar value={x.n} max={q.occurrences[0].n} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">Nenhuma ocorrência no período.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        <GroupTable title="Resultado por marca" rows={sum.byBrand} filterKey="brand" />
        <GroupTable title="Resultado por cidade" rows={sum.byCity} />
      </div>
      <div className="mt-6">
        <GroupTable title="Resultado por rede" rows={sum.byChain} />
      </div>

      <SectionCard title="Ranking de promotoras" subtitle="Nota de 0 a 100: execução (35), pontualidade (25), conversão (25) e fotos completas (15)" className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Promotora</Th>
              <Th align="right">Ações</Th>
              <Th align="right">Horas</Th>
              <Th align="right">Pontualidade</Th>
              <Th align="right">Abordagens</Th>
              <Th align="right">Conversão</Th>
              <Th align="right">Aceitação</Th>
              <Th align="right">Fotos completas</Th>
              <Th align="right">Nota</Th>
            </tr>
          </thead>
          <tbody>
            {sum.ranking.map((p, i) => (
              <tr key={p.name}>
                <Td className="tnum text-muted">{i + 1}</Td>
                <Td className="font-semibold">{p.name}</Td>
                <Td align="right" className="tnum">
                  {p.actions}/{p.scheduled}
                </Td>
                <Td align="right" className="tnum">
                  {p.hours.toFixed(0)} h
                </Td>
                <Td align="right" className="tnum">
                  {pct(p.onTime, 0)}
                </Td>
                <Td align="right" className="tnum">
                  {n(p.approached)}
                </Td>
                <Td align="right" className="tnum">
                  {pct(p.conversion)}
                </Td>
                <Td align="right">{acc(p.acceptance)}</Td>
                <Td align="right" className="tnum">
                  {pct(p.photoPct, 0)}
                </Td>
                <Td align="right">
                  <RankBar value={p.score} max={100} tone="brand" />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Financeiro do período" subtitle="Valores das ações na agenda (realizado quando a ação foi feita)" className="mt-6" bodyClass="px-5 pb-5">
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 text-[13px]">
          <Money label="Faturado das marcas" value={brl(sum.finance.revenue)} />
          <Money label="Custo das ações" value={brl(sum.finance.cost)} />
          <Money label="Margem" value={`${brl(sum.finance.contribution)} · ${pct(sum.finance.margin)}`} />
          <Money label="Custo por abordagem" value={brl(sum.finance.perApproach)} />
          <Money label="Custo por amostra" value={brl(sum.finance.perSample)} />
        </div>
        <Link href={`/painel/financeiro/acoes${withParams(keep)}`} className="inline-block mt-4 text-[13px] font-semibold text-brand-700 hover:underline">
          Ver financeiro por ação →
        </Link>
      </SectionCard>
    </>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="text-[17px] font-bold tnum mt-0.5">{value}</p>
    </div>
  );
}

function GroupTable({ title, rows, filterKey }: { title: string; rows: Group[]; filterKey?: string }) {
  void filterKey;
  const max = Math.max(1, ...rows.map((r) => r.approached));
  return (
    <SectionCard title={title}>
      <Table>
        <thead>
          <tr>
            <Th>{title.replace("Resultado por ", "").replace(/^./, (c) => c.toUpperCase())}</Th>
            <Th align="right">Ações</Th>
            <Th align="right">Abordagens</Th>
            <Th align="right">Amostras</Th>
            <Th align="right">Vendas</Th>
            <Th align="right">Conversão</Th>
            <Th align="right">Aceitação</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <Td className="font-semibold">{r.name}</Td>
              <Td align="right" className="tnum">
                {r.actions}
              </Td>
              <Td align="right">
                <div className="flex justify-end">
                  <RankBar value={r.approached} max={max} tone="brand" />
                </div>
              </Td>
              <Td align="right" className="tnum">
                {n(r.samples)}
              </Td>
              <Td align="right" className="tnum">
                {n(r.sold)}
              </Td>
              <Td align="right" className="tnum">
                {pct(r.conversion)}
              </Td>
              <Td align="right" className="tnum">
                {r.acceptance === null ? "—" : r.acceptance.toFixed(1).replace(".", ",")}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
