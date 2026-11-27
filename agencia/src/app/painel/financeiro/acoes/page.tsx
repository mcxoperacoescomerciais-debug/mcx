import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canSeeFinance } from "@/server/finance";
import { filterOptions } from "@/server/operations";
import { loadActions, summarize, type Group } from "@/server/actions-data";
import { parseFilters } from "@/lib/filters";
import { fmtDate } from "@/lib/dates";
import { brl, monthLabel } from "@/lib/tasting";
import { pct } from "@/lib/actions";
import { FilterBar } from "../../_components/filter-bar";
import { KpiCard, SectionCard, Table, Td, Th } from "../../_components/widgets";
import { FinTabs } from "../_components/fin-tabs";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Financeiro por ação" };

const n = (v: number) => v.toLocaleString("pt-BR");
const perUnit = (cost: number, units: number) => (units ? brl(cost / units) : "—");

/** Custo, valor cobrado e margem de cada ação, por marca e por mês; custo por abordagem e por amostra. */
export default async function ActionsFinancePage({ searchParams }: PageProps<"/painel/financeiro/acoes">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const f = parseFilters(await searchParams, 60);
  const [list, options] = await Promise.all([loadActions(scope, f), filterOptions(scope)]);
  const sum = summarize(list);
  const fin = sum.finance;
  const realized = list.filter((a) => a.state === "realized" && a.money);
  const lost = list.filter((a) => (a.state === "cancelled" || a.state === "not_done") && a.revenueCounted > 0);

  return (
    <>
      <FinTabs month={f.to.slice(0, 7)} actions />
      <PageHeader
        title="Financeiro por ação"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · valor cobrado da marca, custos diretos de cada ação e margem${scope.settings.demo ? " · valores de exemplo" : ""}`}
      />
      <FilterBar range={{ from: f.from, to: f.to }} fields={["period", "brand", "city", "chain", "promoter"]} options={options} />

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <KpiCard label="Cobrado das marcas" value={brl(fin.revenue)} sub={`${realized.length} ação(ões) realizada(s)${lost.length ? ` + ${lost.length} multa(s)` : ""}`} />
        <KpiCard label="Custo direto" value={brl(fin.cost)} sub="promotora, transporte, alimentação e insumos" />
        <KpiCard label="Margem" value={brl(fin.contribution)} tone={fin.contribution >= 0 ? "success" : "danger"} sub={pct(fin.margin)} />
        <KpiCard label="Custo por ação" value={brl(fin.perAction)} />
        <KpiCard label="Custo por abordagem" value={brl(fin.perApproach)} sub={`${n(sum.result.approached)} abordagens`} />
        <KpiCard label="Custo por amostra" value={brl(fin.perSample)} sub={`${n(sum.result.samples)} amostras`} />
      </div>

      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        <MarginTable title="Margem por marca" rows={sum.byBrand} />
        <MarginTable title="Margem por mês" rows={sum.byMonth.map((r) => ({ ...r, name: /^\d{4}-\d{2}$/.test(r.name) ? monthLabel(r.name) : r.name })).sort((a, b) => a.name.localeCompare(b.name))} />
      </div>

      <SectionCard title="Custo e margem de cada ação" subtitle="Realizado quando a ação foi feita; cada custo vem da ação na agenda" className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>PDV</Th>
              <Th>Marca</Th>
              <Th>Promotora</Th>
              <Th align="right">Cobrado</Th>
              <Th align="right">Diária</Th>
              <Th align="right">Transporte</Th>
              <Th align="right">Alimentação</Th>
              <Th align="right">Insumos</Th>
              <Th align="right">Margem</Th>
              <Th align="right">Custo/abordagem</Th>
            </tr>
          </thead>
          <tbody>
            {realized
              .slice()
              .reverse()
              .map((a) => {
                const m = a.money!;
                const p = a.parts;
                return (
                  <tr key={a.key}>
                    <Td className="tnum whitespace-nowrap">{fmtDate(a.date)}</Td>
                    <Td>
                      {a.storeName}
                      <span className="block text-[12px] text-muted">{a.city}</span>
                    </Td>
                    <Td>{a.brandName}</Td>
                    <Td>{a.promoterName ?? "—"}</Td>
                    <Td align="right" className="tnum">
                      {brl(m.revenue)}
                    </Td>
                    <Td align="right" className="tnum">
                      {brl(p?.tasterFee ?? null)}
                    </Td>
                    <Td align="right" className="tnum">
                      {brl(p?.transport ?? null)}
                    </Td>
                    <Td align="right" className="tnum">
                      {brl(p?.food ?? null)}
                    </Td>
                    <Td align="right" className="tnum">
                      {brl((p?.materialsCost ?? 0) + (p?.otherCost ?? 0))}
                    </Td>
                    <Td align="right" className="tnum font-semibold">
                      {brl(m.contribution)} <span className="text-muted font-normal">{m.margin === null ? "" : `${String(m.margin).replace(".", ",")}%`}</span>
                    </Td>
                    <Td align="right" className="tnum">
                      {a.outcome?.approached ? perUnit(m.directCost, a.outcome.approached) : "—"}
                    </Td>
                  </tr>
                );
              })}
          </tbody>
        </Table>
      </SectionCard>
    </>
  );
}

function MarginTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <SectionCard title={title}>
      <Table>
        <thead>
          <tr>
            <Th>{title.replace("Margem por ", "").replace(/^./, (c) => c.toUpperCase())}</Th>
            <Th align="right">Ações</Th>
            <Th align="right">Cobrado</Th>
            <Th align="right">Custo</Th>
            <Th align="right">Margem</Th>
            <Th align="right">Custo/abordagem</Th>
            <Th align="right">Custo/amostra</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <Td className="font-semibold">{r.name}</Td>
              <Td align="right" className="tnum">
                {r.actions}
              </Td>
              <Td align="right" className="tnum">
                {brl(r.revenue)}
              </Td>
              <Td align="right" className="tnum">
                {brl(r.cost)}
              </Td>
              <Td align="right" className="tnum font-semibold">
                {brl(r.contribution)} <span className="text-muted font-normal">{pct(r.margin)}</span>
              </Td>
              <Td align="right" className="tnum">
                {perUnit(r.cost, r.approached)}
              </Td>
              <Td align="right" className="tnum">
                {perUnit(r.cost, r.samples)}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </SectionCard>
  );
}
