import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getScope } from "@/server/auth";
import { canSeeFinance, financeOverview } from "@/server/finance";
import { fmtDate } from "@/lib/dates";
import { ActionForm, Disclosure } from "../../_components/action-form";
import { cancelInvoiceAction, createInvoiceAction, receiveInvoiceAction } from "../actions";
import { brl, pct } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { todayIso } from "@/lib/dates";
import { Badge, EmptyState, inputClass } from "@/components/ui";
import { KpiCard, SectionCard, Table, Td, Th } from "../../_components/widgets";
import { DreRow, DreTable, FinHeader, Mini, PctRow } from "../_components/fin-ui";

export const metadata: Metadata = { title: "DRE degustações" };

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** DRE das degustações: receita das marcas menos degustadoras e custos diretos de cada ação. */
export default async function DegustacoesDre({ searchParams }: PageProps<"/painel/financeiro/degustacoes">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const sp = await searchParams;
  const ov = await financeOverview(scope, typeof sp.mes === "string" ? sp.mes : todayIso().slice(0, 7));
  const [{ listInvoices, shiftMonth, unbilledTastings }] = await Promise.all([import("@/server/finance")]);
  const [invoices, unbilled] = await Promise.all([listInvoices(scope, `${shiftMonth(ov.month, -2)}-01`, ov.to), unbilledTastings(scope)]);
  const P = ov.dre.planned;
  const R = ov.dre.realized;
  const t = ov.tastings;
  const res = (x: typeof P) => x.tastingRevenue - x.taxes - x.tasterCost - x.tastingOtherCosts;
  const margin = (x: typeof P) => (x.tastingRevenue > 0 ? Math.round((res(x) / x.tastingRevenue) * 1000) / 10 : null);
  const maxMonth = Math.max(1, ...ov.months.map((m) => Math.max(m.revenue, m.costs)));
  const byBrandUnbilled = new Map<string, { brandName: string; rows: typeof unbilled }>();
  for (const r of unbilled) byBrandUnbilled.set(r.brandId, { brandName: r.brandName, rows: [...(byBrandUnbilled.get(r.brandId)?.rows ?? []), r] });
  return (
    <>
      <FinHeader title="DRE degustações" subtitle="receita das ações × degustadoras e custos diretos" month={ov.month} path="/painel/financeiro/degustacoes" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Receita prevista" value={brl(P.tastingRevenue)} sub={`${t.count} ação(ões) no mês`} />
        <KpiCard label="Receita realizada" value={brl(R.tastingRevenue)} tone="info" sub="Concluídas + multas" />
        <KpiCard label="A receber" value={brl(t.toReceive)} tone={t.toReceive ? "info" : "neutral"} sub={`Recebido ${brl(t.received)}`} />
        <KpiCard label="A pagar às degustadoras" value={brl(t.toPay)} tone={t.toPay ? "warning" : "neutral"} sub={`Pago ${brl(t.paid)}`} />
      </div>
      <div className="grid xl:grid-cols-5 gap-6 mt-6">
        <SectionCard className="xl:col-span-2" title="DRE das degustações" subtitle="Previsto (ações programadas) × realizado (concluídas)" bodyClass="px-5 pb-5">
          <DreTable>
            <DreRow label="Receita de degustações" p={P.tastingRevenue} r={R.tastingRevenue} strong />
            <DreRow label="(−) Impostos e deduções informados" p={-P.taxes} r={-R.taxes} />
            <DreRow label="(−) Degustadoras" p={-P.tasterCost} r={-R.tasterCost} />
            <DreRow label="(−) Transporte, alimentação, materiais e outros" p={-P.tastingOtherCosts} r={-R.tastingOtherCosts} />
            <DreRow label="Resultado das degustações" p={res(P)} r={res(R)} strong />
            <PctRow label="Margem" p={pct(margin(P))} r={pct(margin(R))} />
          </DreTable>
          <p className="text-[12px] text-muted mt-3 flex gap-1.5">
            <Info className="size-4 shrink-0" /> Canceladas só entram com a multa registrada. O painel operacional fica no menu Degustações.
          </p>
        </SectionCard>
        <SectionCard className="xl:col-span-3" title="Degustações por marca" subtitle="Rentabilidade no mês" bodyClass="pb-1">
          {ov.brands.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th align="right">Ações</Th>
                  <Th align="right">Receita</Th>
                  <Th align="right">Degustadoras</Th>
                  <Th align="right">Outros</Th>
                  <Th align="right">Contribuição</Th>
                  <Th align="right">Margem</Th>
                </tr>
              </thead>
              <tbody>
                {ov.brands.map((b) => (
                  <tr key={b.brandId} className="hover:bg-subtle">
                    <Td className="font-semibold">
                      <Link href={`/painel/degustacoes/agenda${withParams({ mes: ov.month, view: "lista", brand: b.brandId })}`} className="hover:underline">
                        {b.brandName}
                      </Link>
                    </Td>
                    <Td align="right" className="tnum">{b.count}</Td>
                    <Td align="right" className="tnum">{brl(b.revenue)}</Td>
                    <Td align="right" className="tnum">{brl(b.tasterCost)}</Td>
                    <Td align="right" className="tnum">{brl(b.otherCosts)}</Td>
                    <Td align="right" className="tnum font-semibold">{brl(b.contribution)}</Td>
                    <Td align="right" className="tnum">{b.margin === null ? "—" : pct(b.margin)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhuma degustação no mês" />
          )}
          <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12.5px] border-t border-line">
            <Mini label="Faturado" value={brl(t.billed)} />
            <Mini label="Recebido" value={brl(t.received)} />
            <Mini label="Pago às degustadoras" value={brl(t.paid)} />
            <Mini label="Pendente de pagar" value={brl(t.toPay)} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Comparação mensal das degustações" subtitle="Últimos 6 meses · receita × custos diretos" className="mt-6" bodyClass="px-5 pb-5">
        <div className="grid grid-cols-6 gap-3 items-end h-44">
          {ov.months.map((m) => (
            <div key={m.month} className="flex flex-col items-center justify-end h-full gap-1">
              <div className="flex items-end gap-1 h-32 w-full justify-center">
                <div className="w-1/3 max-w-7 rounded-t bg-brand-600" style={{ height: `${(m.revenue / maxMonth) * 100}%` }} title={`Receita ${brl(m.revenue)}`} />
                <div className="w-1/3 max-w-7 rounded-t bg-warn/70" style={{ height: `${(m.costs / maxMonth) * 100}%` }} title={`Custos ${brl(m.costs)}`} />
              </div>
              <p className="text-[11.5px] font-semibold">
                {SHORT[Number(m.month.slice(5)) - 1]}/{m.month.slice(2, 4)}
              </p>
              <p className={`text-[11px] tnum ${m.contribution < 0 ? "text-bad" : "text-ok"}`}>{brl(m.contribution)}</p>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-muted mt-2 flex gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-brand-600" /> Receita
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-warn/70" /> Custos diretos
          </span>
          <span>· valor embaixo = receita − custos diretos (antes de impostos)</span>
        </p>
      </SectionCard>

      <div className="mt-6">
        <SectionCard title="Faturas de degustação" subtitle="Uma fatura pode juntar várias degustações da mesma marca — a receita não é contada duas vezes" bodyClass="px-5 pb-5">
          {invoices.length ? (
            <ul className="divide-y divide-line mb-4">
              {invoices.map((i) => (
                <li key={i.id} className="py-2.5 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{i.number ?? "Sem número"}</strong>
                    <span>· {i.brandName}</span>
                    <span className="tnum">· {brl(i.amount)}</span>
                    <span className="text-muted">· {i.count} degustação(ões) · emitida {fmtDate(i.issueDate)}</span>
                    {i.sample ? <Badge>Exemplo</Badge> : null}
                    <Badge tone={i.status === "received" ? "success" : i.status === "cancelled" ? "neutral" : "warning"}>{i.status === "received" ? `Recebida ${i.receivedAt ? fmtDate(i.receivedAt) : ""}` : i.status === "cancelled" ? "Cancelada" : "A receber"}</Badge>
                  </div>
                  {i.status === "issued" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionForm action={receiveInvoiceAction} hidden={{ id: i.id }} submitLabel="Registrar recebimento" variant="success" className="!space-y-0 flex flex-wrap items-center gap-2">
                        <input type="date" name="receivedAt" defaultValue={todayIso()} required className={inputClass + " !w-40"} aria-label="Data do recebimento" />
                        <input name="amount" inputMode="decimal" placeholder={i.amount.toFixed(2).replace(".", ",")} className={inputClass + " !w-32"} aria-label="Valor recebido" />
                      </ActionForm>
                      <ActionForm action={cancelInvoiceAction} hidden={{ id: i.id }} submitLabel="Cancelar fatura" variant="secondary" />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted mb-4">Nenhuma fatura nos últimos meses.</p>
          )}
          {byBrandUnbilled.size ? (
            <Disclosure label="Nova fatura com degustações concluídas e não faturadas">
              <div className="space-y-5">
                {[...byBrandUnbilled.entries()].map(([brandId, g]) => (
                  <ActionForm key={brandId} action={createInvoiceAction} hidden={{ brandId }} submitLabel={`Faturar ${g.brandName}`}>
                    <p className="text-[13px] font-semibold">{g.brandName}</p>
                    <ul className="space-y-1">
                      {g.rows.map((r) => (
                        <li key={r.id}>
                          <label className="inline-flex items-center gap-2 text-[13px]">
                            <input type="checkbox" name="tastingId" value={r.id} defaultChecked /> {fmtDate(r.date)} · {r.storeName} · <span className="tnum">{brl(r.actual.revenue)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="grid grid-cols-3 gap-2">
                      <input name="number" placeholder="Nº da nota/fatura" className={inputClass} aria-label="Número" />
                      <input name="issueDate" type="date" required defaultValue={todayIso()} className={inputClass} aria-label="Emissão" />
                      <input name="dueDate" type="date" className={inputClass} aria-label="Vencimento" />
                    </div>
                  </ActionForm>
                ))}
              </div>
            </Disclosure>
          ) : (
            <p className="text-[12.5px] text-muted">Nenhuma degustação concluída aguardando faturamento.</p>
          )}
        </SectionCard>
      </div>
    </>
  );
}
