import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { getScope } from "@/server/auth";
import { canSeeFinance, financeOverview, listInvoices, shiftMonth, unbilledTastings } from "@/server/finance";
import { brl, monthLabel, pct } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { fmtDate, todayIso } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, inputClass } from "@/components/ui";
import { KpiCard, SectionCard, Table, Td, Th } from "../_components/widgets";
import { ActionForm, Disclosure } from "../_components/action-form";
import { brandFeeAction, cancelInvoiceAction, createInvoiceAction, receiveInvoiceAction } from "./actions";

export const metadata: Metadata = { title: "Financeiro" };

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * Financeiro da agência: resultado de contribuição do mês (promotoria + degustações).
 * O painel específico das degustações fica no menu Degustações.
 */
export default async function FinancePage({ searchParams }: PageProps<"/painel/financeiro">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const sp = await searchParams;
  const ov = await financeOverview(scope, typeof sp.mes === "string" ? sp.mes : todayIso().slice(0, 7));
  const [invoices, unbilled] = await Promise.all([listInvoices(scope, `${shiftMonth(ov.month, -2)}-01`, ov.to), unbilledTastings(scope)]);
  const dre = ov.dre;
  const t = ov.tastings;
  const maxMonth = Math.max(1, ...ov.months.map((m) => Math.max(m.revenue, m.costs)));
  const byBrandUnbilled = new Map<string, { brandName: string; rows: typeof unbilled }>();
  for (const r of unbilled) byBrandUnbilled.set(r.brandId, { brandName: r.brandName, rows: [...(byBrandUnbilled.get(r.brandId)?.rows ?? []), r] });

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle={`${monthLabel(ov.month)} · resultado de contribuição da agência (promotoria e degustações)`}
        actions={
          <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
            <Link href={withParams({ mes: shiftMonth(ov.month, -1) })} aria-label="Mês anterior" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-l-lg">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href="/painel/financeiro" className="h-9 px-3 grid place-items-center text-[13px] font-semibold border-x border-line hover:bg-subtle">
              Este mês
            </Link>
            <Link href={withParams({ mes: shiftMonth(ov.month, 1) })} aria-label="Próximo mês" className="h-9 w-9 grid place-items-center hover:bg-subtle rounded-r-lg">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Receita do mês" value={brl(dre.revenue)} sub={`Promotoria ${brl(dre.promotoriaRevenue)} · Degustações ${brl(dre.tastingRevenue)}`} />
        <KpiCard label="Custos diretos" value={brl(dre.directCosts)} tone="warning" sub={`Promotores ${brl(dre.promoterCost)} · Degustação ${brl(dre.tasterCost + dre.tastingOtherCosts)}`} />
        <KpiCard label="Resultado de contribuição" value={brl(dre.contribution)} tone={dre.contribution >= 0 ? "success" : "danger"} sub={dre.margin === null ? "—" : `Margem ${pct(dre.margin)}`} />
        <KpiCard label="A receber (degustações)" value={brl(t.toReceive)} tone={t.toReceive ? "info" : "neutral"} sub={`Recebido ${brl(t.received)} · a pagar degustadoras ${brl(t.toPay)}`} />
      </div>

      <div className="grid xl:grid-cols-5 gap-6 mt-6">
        <SectionCard className="xl:col-span-2" title="DRE gerencial do mês" subtitle="Até o resultado de contribuição" bodyClass="px-5 pb-5">
          <dl className="text-[14px] divide-y divide-line">
            <Row label="Receita de promotoria (contratos mensais)" value={brl(dre.promotoriaRevenue)} />
            <Row label="Receita de degustações" value={brl(dre.tastingRevenue)} />
            <Row label="Receita bruta" value={brl(dre.revenue)} strong />
            <Row label="(−) Impostos e deduções informados" value={`− ${brl(dre.taxes)}`} />
            <Row label="(−) Pagamento de promotores" value={`− ${brl(dre.promoterCost)}`} />
            <Row label="(−) Degustadoras" value={`− ${brl(dre.tasterCost)}`} />
            <Row label="(−) Outros custos diretos das degustações" value={`− ${brl(dre.tastingOtherCosts)}`} />
            <Row label="Resultado de contribuição (após impostos informados)" value={brl(dre.contribution)} strong />
            <Row label="Margem de contribuição" value={dre.margin === null ? "—" : pct(dre.margin)} />
          </dl>
          <p className="text-[12px] text-muted mt-3 flex gap-1.5">
            <Info className="size-4 shrink-0" /> Não é o lucro líquido: faltam despesas administrativas e gerais. Degustações por competência (data da ação): concluídas pelo realizado, programadas pelo previsto, canceladas só com multa registrada.
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

      <SectionCard
        title="Promotoria · pagamento dos promotores"
        subtitle="Como na planilha: VR ATEND de cada loja × visitas feitas no mês ÷ meta do mês (pode passar de 100%)"
        className="mt-6"
        bodyClass="pb-1"
      >
        {ov.payroll.missing ? (
          <p className="px-5 pb-3 text-[12.5px] text-warn font-medium">
            {ov.payroll.missing} loja(s) × marca(s) ainda sem VR ATEND cadastrado — não entram no total. Importe a planilha de atribuições com a coluna “valor”.
          </p>
        ) : null}
        {ov.payroll.rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Promotor</Th>
                <Th>Marca</Th>
                <Th align="right">Lojas</Th>
                <Th align="right">Visitas</Th>
                <Th align="right">Meta</Th>
                <Th align="right">% cumpr.</Th>
                <Th align="right">VR ATEND</Th>
                <Th align="right">A pagar</Th>
              </tr>
            </thead>
            <tbody>
              {ov.payroll.rows.map((r) => (
                <tr key={`${r.promoterId}:${r.brandId}`} className="hover:bg-subtle">
                  <Td className="font-semibold">{r.promoterName}</Td>
                  <Td>{r.brandName}</Td>
                  <Td align="right" className="tnum">{r.stores}</Td>
                  <Td align="right" className="tnum">{r.visits}</Td>
                  <Td align="right" className="tnum">{r.meta}</Td>
                  <Td align="right" className="tnum">{r.pct === null ? "—" : pct(r.pct)}</Td>
                  <Td align="right" className="tnum">
                    {brl(r.value)}
                    {r.missingValue ? <span className="block text-[11px] text-warn">{r.missingValue} sem valor</span> : null}
                  </Td>
                  <Td align="right" className="tnum font-semibold">{brl(r.toPay)}</Td>
                </tr>
              ))}
              <tr className="bg-subtle font-bold">
                <Td>Total</Td>
                <Td />
                <Td />
                <Td />
                <Td />
                <Td />
                <Td />
                <Td align="right" className="tnum">{brl(ov.payroll.total)}</Td>
              </tr>
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma atribuição de promotor" />
        )}
      </SectionCard>

      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        <SectionCard title="Receita de promotoria por marca" subtitle="Quanto cada marca paga por mês pela promotoria (contrato)" bodyClass="px-5 pb-5">
          <ul className="divide-y divide-line">
            {ov.fees.map((b) => (
              <li key={b.id} className="py-2">
                <ActionForm action={brandFeeAction} hidden={{ brandId: b.id }} submitLabel="Salvar" variant="secondary" resetOnSuccess={false} className="!space-y-0 flex flex-wrap items-center gap-2">
                  <span className="flex-1 min-w-32 text-[13.5px] font-semibold">{b.name}</span>
                  <input name="fee" inputMode="decimal" defaultValue={b.monthlyFee === null ? "" : b.monthlyFee.toFixed(2).replace(".", ",")} placeholder="R$ por mês" className={inputClass + " !w-36 tnum"} aria-label={`Valor mensal ${b.name}`} />
                </ActionForm>
              </li>
            ))}
          </ul>
        </SectionCard>

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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={strong ? "font-bold" : "text-ink-2"}>{label}</dt>
      <dd className={`tnum ${strong ? "font-bold" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className="font-semibold tnum">{value}</p>
    </div>
  );
}
