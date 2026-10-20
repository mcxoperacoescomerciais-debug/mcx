import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getScope } from "@/server/auth";
import { canSeeFinance, financeOverview } from "@/server/finance";
import { brl, pct } from "@/lib/tasting";
import { todayIso } from "@/lib/dates";
import { EmptyState } from "@/components/ui";
import { KpiCard, SectionCard, Table, Td, Th } from "../../_components/widgets";
import { DreRow, DreTable, FinHeader, PctRow } from "../_components/fin-ui";

export const metadata: Metadata = { title: "DRE promotoria" };

/** DRE da promotoria: receita pelo VR ATEND (previsto e realizado) menos a folha dos promotores. */
export default async function PromotoriaDre({ searchParams }: PageProps<"/painel/financeiro/promotoria">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const sp = await searchParams;
  const ov = await financeOverview(scope, typeof sp.mes === "string" ? sp.mes : todayIso().slice(0, 7));
  const P = { rev: ov.promo.planned, cost: ov.payroll.total };
  const R = { rev: ov.promo.realized, cost: ov.payroll.total };
  const margin = (rev: number, cost: number) => (rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : null);
  return (
    <>
      <FinHeader title="DRE promotoria" subtitle="receita das marcas pelo VR ATEND × folha dos promotores" month={ov.month} path="/painel/financeiro/promotoria" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Receita prevista (meta cheia)" value={brl(P.rev)} sub={`${ov.promo.brands.length} marca(s)`} />
        <KpiCard label="Receita realizada (visitas feitas)" value={brl(R.rev)} tone="info" sub={`${pct(P.rev ? (R.rev / P.rev) * 100 : null)} do previsto`} />
        <KpiCard label="Folha de pagamento" value={brl(ov.payroll.total)} tone="warning" sub={`${ov.payroll.people.length} promotor(es) ativo(s)`} href="#folha" />
        <KpiCard label="Resultado previsto" value={brl(P.rev - P.cost)} tone={P.rev - P.cost >= 0 ? "success" : "danger"} sub={`Margem ${pct(margin(P.rev, P.cost))}`} />
      </div>
      <SectionCard title="DRE da promotoria" subtitle="Previsto (meta cheia) × realizado (visitas feitas)" className="mt-6" bodyClass="px-5 pb-5">
        <DreTable>
          <DreRow label="Receita de promotoria (VR ATEND)" p={P.rev} r={R.rev} strong />
          <DreRow label="(−) Salários" p={-ov.payroll.salary} r={-ov.payroll.salary} />
          <DreRow label="(−) Alimentação" p={-ov.payroll.meal} r={-ov.payroll.meal} />
          <DreRow label="(−) Combustível" p={-ov.payroll.fuel} r={-ov.payroll.fuel} />
          <DreRow label="(−) Encargos" p={-ov.payroll.charges} r={-ov.payroll.charges} />
          <DreRow label="(−) Outros custos dos promotores" p={-ov.payroll.other} r={-ov.payroll.other} />
          <DreRow label="Resultado da promotoria" p={P.rev - P.cost} r={R.rev - R.cost} strong />
          <PctRow label="Margem" p={pct(margin(P.rev, P.cost))} r={pct(margin(R.rev, R.cost))} />
        </DreTable>
        <p className="text-[12px] text-muted mt-3 flex gap-1.5">
          <Info className="size-4 shrink-0" /> Realizado = VR ATEND × visitas feitas ÷ meta do mês (como o “A PAGAR” da planilha). A folha entra inteira nas duas colunas.
        </p>
      </SectionCard>

      <div className="grid xl:grid-cols-2 gap-6 mt-6">
        <SectionCard title="Promotoria · receita por marca" subtitle="VR ATEND somado das lojas de cada marca" bodyClass="pb-1">
          {ov.promo.brands.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Marca</Th>
                  <Th align="right">Lojas</Th>
                  <Th align="right">Visitas / meta</Th>
                  <Th align="right">Previsto</Th>
                  <Th align="right">Realizado</Th>
                </tr>
              </thead>
              <tbody>
                {ov.promo.brands.map((b) => (
                  <tr key={b.brandId} className="hover:bg-subtle">
                    <Td className="font-semibold">{b.brandName}</Td>
                    <Td align="right" className="tnum">{b.stores}</Td>
                    <Td align="right" className="tnum">
                      {b.visits}/{b.meta}
                    </Td>
                    <Td align="right" className="tnum">{brl(b.planned)}</Td>
                    <Td align="right" className="tnum font-semibold">{brl(b.realized)}</Td>
                  </tr>
                ))}
                <tr className="bg-subtle font-bold">
                  <Td>Total</Td>
                  <Td />
                  <Td />
                  <Td align="right" className="tnum">{brl(ov.promo.planned)}</Td>
                  <Td align="right" className="tnum">{brl(ov.promo.realized)}</Td>
                </tr>
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhuma atribuição com VR ATEND" />
          )}
          {ov.promo.missing ? <p className="px-5 py-3 text-[12.5px] text-warn font-medium">{ov.promo.missing} loja(s) × marca(s) sem VR ATEND — não entram na receita. Inclua a coluna “valor” na planilha de atribuições.</p> : null}
        </SectionCard>

        <SectionCard title="Folha de pagamento" subtitle="Custo mensal de cada promotor ativo — ajuste no cadastro do promotor; o padrão fica em Configurações" bodyClass="pb-1">
          <div id="folha" />
          {ov.payroll.people.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Promotor</Th>
                  <Th align="right">Salário</Th>
                  <Th align="right">Alimentação</Th>
                  <Th align="right">Combustível</Th>
                  <Th align="right">Encargos</Th>
                  <Th align="right">Outros</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {ov.payroll.people.map((p) => (
                  <tr key={p.id} className="hover:bg-subtle">
                    <Td>
                      <Link href={`/painel/cadastros/usuarios/${p.id}#custos`} className="font-semibold hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-[11px] text-muted">{p.employment === "fixed" ? "Fixo" : "Freelancer"}</span>
                    </Td>
                    <Td align="right" className="tnum">{brl(p.cost.salary)}</Td>
                    <Td align="right" className="tnum">{brl(p.cost.meal)}</Td>
                    <Td align="right" className="tnum">{brl(p.cost.fuel)}</Td>
                    <Td align="right" className="tnum">{brl(p.cost.charges)}</Td>
                    <Td align="right" className="tnum">{brl(p.cost.other)}</Td>
                    <Td align="right" className="tnum font-semibold">{brl(p.cost.total)}</Td>
                  </tr>
                ))}
                <tr className="bg-subtle font-bold">
                  <Td>Total</Td>
                  <Td align="right" className="tnum">{brl(ov.payroll.salary)}</Td>
                  <Td align="right" className="tnum">{brl(ov.payroll.meal)}</Td>
                  <Td align="right" className="tnum">{brl(ov.payroll.fuel)}</Td>
                  <Td align="right" className="tnum">{brl(ov.payroll.charges)}</Td>
                  <Td align="right" className="tnum">{brl(ov.payroll.other)}</Td>
                  <Td align="right" className="tnum">{brl(ov.payroll.total)}</Td>
                </tr>
              </tbody>
            </Table>
          ) : (
            <EmptyState title="Nenhum promotor ativo" />
          )}
          {ov.payroll.withoutCost ? (
            <p className="px-5 py-3 text-[12.5px] text-warn font-medium">
              {ov.payroll.withoutCost} promotor(es) com custo zero. Preencha o padrão em{" "}
              <Link href="/painel/configuracoes" className="underline">
                Configurações
              </Link>{" "}
              ou o custo no cadastro de cada um.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Promotoria · receita por promotor e marca" subtitle="Como o RESUMO da planilha: VR ATEND × visitas feitas ÷ meta do mês (pode passar de 100%)" className="mt-6" bodyClass="pb-1">
        {ov.promo.rows.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Promotor</Th>
                <Th>Marca</Th>
                <Th align="right">Lojas</Th>
                <Th align="right">Visitas</Th>
                <Th align="right">Meta</Th>
                <Th align="right">% cumpr.</Th>
                <Th align="right">VR ATEND (previsto)</Th>
                <Th align="right">A receber (realizado)</Th>
              </tr>
            </thead>
            <tbody>
              {ov.promo.rows.map((r) => (
                <tr key={`${r.promoterId}:${r.brandId}`} className="hover:bg-subtle">
                  <Td className="font-semibold">{r.promoterName}</Td>
                  <Td>{r.brandName}</Td>
                  <Td align="right" className="tnum">{r.stores}</Td>
                  <Td align="right" className="tnum">{r.visits}</Td>
                  <Td align="right" className="tnum">{r.meta}</Td>
                  <Td align="right" className="tnum">{pct(r.pct)}</Td>
                  <Td align="right" className="tnum">
                    {brl(r.planned)}
                    {r.missingValue ? <span className="block text-[11px] text-warn">{r.missingValue} sem valor</span> : null}
                  </Td>
                  <Td align="right" className="tnum font-semibold">{brl(r.realized)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma atribuição de promotor" />
        )}
      </SectionCard>

    </>
  );
}
