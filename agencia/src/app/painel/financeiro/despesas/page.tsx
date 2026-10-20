import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getScope } from "@/server/auth";
import { EXPENSE_CATEGORIES, canSeeFinance, financeOverview } from "@/server/finance";
import { brl, monthLabel, pct } from "@/lib/tasting";
import { withParams } from "@/lib/filters";
import { todayIso } from "@/lib/dates";
import { EmptyState } from "@/components/ui";

import { KpiCard, SectionCard } from "../../_components/widgets";
import { FinHeader } from "../_components/fin-ui";
import { EndExpenseButton, ExpenseForm } from "./expense-forms";

export const metadata: Metadata = { title: "Despesas fixas" };

const mm = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

/** Despesas administrativas e fixas: não entram no preço das ações (calculadora), só no DRE geral. */
export default async function ExpensesPage({ searchParams }: PageProps<"/painel/financeiro/despesas">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const sp = await searchParams;
  const ov = await financeOverview(scope, typeof sp.mes === "string" ? sp.mes : todayIso().slice(0, 7));
  const P = ov.dre.planned;
  const editing = typeof sp.editar === "string" ? ov.fixed.rows.find((r) => r.id === sp.editar) ?? null : null;
  const here = `/painel/financeiro/despesas${withParams({ mes: ov.month })}`;
  return (
    <>
      <FinHeader title="Despesas administrativas e fixas" subtitle="o que a agência gasta todo mês, independente do volume de ações" month={ov.month} path="/painel/financeiro/despesas" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Despesas fixas do mês" value={brl(ov.fixed.total)} tone="warning" sub={`${ov.fixed.rows.length} lançamento(s)`} />
        <KpiCard label="Margem de contribuição prevista" value={brl(P.contribution)} sub={`${pct(P.margin)} da receita`} />
        <KpiCard label="Resultado operacional previsto" value={brl(P.operating)} tone={P.operating >= 0 ? "success" : "danger"} sub={`Margem operacional ${pct(P.operatingMargin)}`} href={`/painel/financeiro${withParams({ mes: ov.month })}`} />
        <KpiCard
          label="Ponto de equilíbrio"
          value={P.breakEven === null ? "—" : brl(P.breakEven)}
          tone="info"
          sub={P.breakEven === null ? "precisa de margem de contribuição positiva" : P.revenue >= P.breakEven ? `receita prevista cobre (${brl(P.revenue - P.breakEven)} acima)` : `faltam ${brl(P.breakEven - P.revenue)} de receita`}
        />
      </div>

      <div className="grid xl:grid-cols-5 gap-6 mt-6">
        <SectionCard className="xl:col-span-3" title={`Despesas de ${monthLabel(ov.month)}`} subtitle="Recorrentes ativas no mês e lançamentos só deste mês" bodyClass="px-5 pb-5">
          {ov.fixed.rows.length ? (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="text-left font-semibold py-1.5">Despesa</th>
                  <th className="text-left font-semibold py-1.5 hidden sm:table-cell">Vigência</th>
                  <th className="text-right font-semibold py-1.5">Valor</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ov.fixed.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2">
                      <span className="font-semibold">{r.name}</span>
                      <span className="block text-[12px] text-muted">
                        {EXPENSE_CATEGORIES[r.category as keyof typeof EXPENSE_CATEGORIES] ?? r.category}
                        {r.notes ? ` · ${r.notes}` : ""}
                      </span>
                    </td>
                    <td className="py-2 text-ink-2 hidden sm:table-cell">{r.endMonth === r.startMonth ? `só ${mm(r.startMonth)}` : `desde ${mm(r.startMonth)}${r.endMonth ? ` até ${mm(r.endMonth)}` : ""}`}</td>
                    <td className="py-2 text-right tnum font-semibold">{brl(r.amount)}</td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-3">
                        <Link href={`/painel/financeiro/despesas${withParams({ mes: ov.month, editar: r.id })}`} className="text-[12.5px] font-semibold text-brand-700 hover:underline">
                          Editar
                        </Link>
                        <EndExpenseButton id={r.id} month={ov.month} label={r.startMonth === ov.month ? "Remover" : "Encerrar"} />
                      </span>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-bold" colSpan={2}>
                    Total
                  </td>
                  <td className="py-2 text-right tnum font-bold">{brl(ov.fixed.total)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          ) : (
            <EmptyState title="Nenhuma despesa fixa neste mês">Lance aluguel, contador, sistemas, salários do escritório… Elas entram no DRE geral, abaixo da margem de contribuição.</EmptyState>
          )}
          <p className="text-[12px] text-muted mt-3 flex gap-1.5">
            <Info className="size-4 shrink-0" /> &quot;Encerrar&quot; tira a despesa deste mês em diante; os meses anteriores continuam com ela. Promotores e degustadoras não entram aqui: já estão nos custos diretos.
          </p>
        </SectionCard>
        <div className="xl:col-span-2 grid gap-4 content-start">
          <SectionCard title={editing ? "Editar despesa" : "Lançar despesa"} bodyClass="px-5 pb-5">
            <ExpenseForm
              draft={
                editing
                  ? { id: editing.id, name: editing.name, category: editing.category, amount: editing.amount, startMonth: editing.startMonth, endMonth: editing.endMonth, notes: editing.notes }
                  : { id: null, name: "", category: "", amount: null, startMonth: ov.month, endMonth: null, notes: null }
              }
              categories={EXPENSE_CATEGORIES}
              cancelHref={here}
            />
          </SectionCard>
          {ov.fixed.byCategory.length ? (
            <SectionCard title="Por categoria" bodyClass="px-5 pb-5">
              <table className="w-full text-[13.5px]">
                <tbody className="divide-y divide-line">
                  {ov.fixed.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td className="py-2 text-ink-2">{c.label}</td>
                      <td className="py-2 text-right tnum font-semibold">{brl(c.total)}</td>
                      <td className="py-2 text-right tnum text-muted w-16">{pct(ov.fixed.total ? Math.round((c.total / ov.fixed.total) * 1000) / 10 : null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
