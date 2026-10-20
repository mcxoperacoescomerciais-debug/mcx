import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { getScope } from "@/server/auth";
import { canSeeFinance, strategyOverview, type BrandStrategy } from "@/server/finance";
import { brl, pct } from "@/lib/tasting";
import { todayIso } from "@/lib/dates";
import { EmptyState } from "@/components/ui";
import { KpiCard, SectionCard, Table, Td, Th } from "../../_components/widgets";
import { FinHeader } from "../_components/fin-ui";

export const metadata: Metadata = { title: "Visão estratégica" };

const READING: Record<BrandStrategy["reading"], { label: string; cls: string; action: string }> = {
  star: { label: "Estrela", cls: "bg-ok-bg text-ok", action: "Crescer: levar a marca às lojas que já visitamos." },
  niche: { label: "Nicho bem pago", cls: "bg-info-bg text-info", action: "Replicar o modelo em outra cidade densa." },
  heavy_cheap: { label: "Muito trabalho, pouco preço", cls: "bg-bad-bg text-bad", action: "Renegociar valor mínimo por loja ou reduzir frequência." },
  cheap: { label: "Preço baixo", cls: "bg-warn-bg text-warn", action: "Manter só onde vai junto com marca maior; reajustar." },
  no_value: { label: "Sem valor", cls: "bg-bad-bg text-bad", action: "Cadastrar o VR ATEND: hoje é trabalho sem receita." },
};

/**
 * Visão estratégica: cada marca como um pequeno DRE (receita × custo de campo
 * rateado pelos atendimentos) e cada promotor (receita gerada × custo). Mostra
 * quem mais paga, quem gera mais trabalho por real e onde crescer sem novo
 * deslocamento.
 */
export default async function StrategyPage({ searchParams }: PageProps<"/painel/financeiro/estrategico">) {
  const scope = await getScope();
  if (!canSeeFinance(scope)) notFound();
  const sp = await searchParams;
  const month = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : todayIso().slice(0, 7);
  const st = await strategyOverview(scope);
  const T = st.totals;
  const noCost = T.payroll === 0;
  const growth = [...st.brands].filter((b) => b.opportunities.length && b.perStore).sort((a, b) => b.potential - a.potential);
  const maxRev = Math.max(1, ...st.brands.map((b) => b.revenue));

  return (
    <>
      <FinHeader title="Visão estratégica" subtitle="DRE por marca e por promotor (mês cheio, receita prevista pelo VR ATEND)" month={month} path="/painel/financeiro/estrategico" noMonth />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Receita prevista/mês" value={brl(T.revenue)} sub={`${st.brands.length} marcas · ${T.stores} lojas`} />
        <KpiCard label="Atendimentos/mês" value={T.visits.toLocaleString("pt-BR")} sub={`Média ${brl(T.avgPerVisit)} por atendimento`} />
        <KpiCard label="Custo de campo (folha)" value={brl(T.payroll)} tone={noCost ? "warning" : "neutral"} sub={noCost ? "Preencha os custos dos promotores" : `${brl(T.visits ? T.payroll / T.visits : 0)} por atendimento`} />
        <KpiCard label="Crescer sem novo deslocamento" value={brl(growth.reduce((t, b) => t + b.potential, 0))} tone="success" sub="Lojas que já visitamos sem a marca (mesma rede e cidade)" />
      </div>

      {noCost ? (
        <p className="mt-4 text-[13px] text-warn font-medium flex gap-1.5">
          <Info className="size-4 shrink-0 mt-0.5" /> Os custos dos promotores ainda estão vazios, então o resultado por marca mostra só a receita. Preencha o padrão em{" "}
          <Link href="/painel/configuracoes" className="underline">
            Configurações
          </Link>{" "}
          e os ajustes no cadastro de cada promotor.
        </p>
      ) : null}

      <SectionCard title="DRE por marca" subtitle="Custo de campo = custo mensal de cada promotor rateado pelos atendimentos que ele faz para a marca" className="mt-6" bodyClass="pb-1">
        {st.brands.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Marca</Th>
                <Th align="right">Lojas</Th>
                <Th align="right">Cidades</Th>
                <Th align="right">Atend./mês</Th>
                <Th align="right">Receita/mês</Th>
                <Th align="right">% receita</Th>
                <Th align="right">R$ por loja</Th>
                <Th align="right">R$ por atend.</Th>
                <Th align="right">Custo de campo</Th>
                <Th align="right">Resultado</Th>
                <Th align="right">Margem</Th>
                <Th>Leitura</Th>
              </tr>
            </thead>
            <tbody>
              {st.brands.map((b) => (
                <tr key={b.brandId} className="hover:bg-subtle align-top">
                  <Td className="font-semibold">
                    {b.brandName}
                    <span className="block mt-1 h-1.5 rounded-full bg-brand-600/70" style={{ width: `${Math.max(4, (b.revenue / maxRev) * 100)}%` }} aria-hidden />
                    {b.missingValue ? <span className="block text-[11px] text-warn font-medium">{b.missingValue} sem VR ATEND</span> : null}
                  </Td>
                  <Td align="right" className="tnum">{b.stores}</Td>
                  <Td align="right" className="tnum">{b.cities}</Td>
                  <Td align="right" className="tnum">{b.visits}</Td>
                  <Td align="right" className="tnum font-semibold">{brl(b.revenue)}</Td>
                  <Td align="right" className="tnum">{pct(b.revenueShare)}</Td>
                  <Td align="right" className="tnum">{brl(b.perStore)}</Td>
                  <Td align="right" className={`tnum ${b.perVisit !== null && b.perVisit < T.avgPerVisit ? "text-bad" : ""}`}>{brl(b.perVisit)}</Td>
                  <Td align="right" className="tnum">{noCost ? "—" : brl(b.fieldCost)}</Td>
                  <Td align="right" className={`tnum font-semibold ${!noCost && b.result < 0 ? "text-bad" : ""}`}>{noCost ? "—" : brl(b.result)}</Td>
                  <Td align="right" className="tnum">{noCost ? "—" : pct(b.margin)}</Td>
                  <Td>
                    <span className={`inline-block text-[11.5px] font-semibold rounded-full px-2 py-0.5 ${READING[b.reading].cls}`}>{READING[b.reading].label}</span>
                    <span className="block text-[11.5px] text-muted mt-1 whitespace-normal min-w-48">{READING[b.reading].action}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma atribuição com promotor ativo" />
        )}
        <p className="px-5 py-3 text-[12px] text-muted">
          R$ por atendimento abaixo da média ({brl(T.avgPerVisit)}) aparece em vermelho. “Estrela” = paga acima da média e gera volume; “Muito trabalho, pouco preço” = abaixo da média com mais de 250 atendimentos/mês.
        </p>
      </SectionCard>

      <SectionCard title="Onde crescer sem novo deslocamento" subtitle="Lojas que algum promotor já visita, na mesma rede e cidade onde a marca está, e que ainda não têm a marca" className="mt-6" bodyClass="pb-1">
        {growth.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Marca</Th>
                <Th align="right">Lojas possíveis</Th>
                <Th align="right">Potencial/mês</Th>
                <Th>Exemplos</Th>
              </tr>
            </thead>
            <tbody>
              {growth.map((b) => (
                <tr key={b.brandId} className="hover:bg-subtle align-top">
                  <Td className="font-semibold">{b.brandName}</Td>
                  <Td align="right" className="tnum">{b.opportunities.length}</Td>
                  <Td align="right" className="tnum font-semibold text-ok">{brl(b.potential)}</Td>
                  <Td className="text-[12.5px] whitespace-normal min-w-72">
                    {b.opportunities
                      .slice(0, 6)
                      .map((o) => `${o.name} (${o.city})`)
                      .join(" · ")}
                    {b.opportunities.length > 6 ? ` · +${b.opportunities.length - 6}` : ""}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhuma oportunidade encontrada" />
        )}
        <p className="px-5 py-3 text-[12px] text-muted">Potencial = lojas possíveis × receita média por loja da marca. O deslocamento já é pago pela rota atual.</p>
      </SectionCard>

      <SectionCard title="DRE por promotor" subtitle="Receita que a rota gera (VR ATEND das lojas dele) × quanto ele custa por mês" className="mt-6" bodyClass="pb-1">
        <Table>
          <thead>
            <tr>
              <Th>Promotor</Th>
              <Th align="right">Lojas</Th>
              <Th align="right">Marcas</Th>
              <Th align="right">Atend./mês</Th>
              <Th align="right">Receita/mês</Th>
              <Th align="right">Custo/mês</Th>
              <Th align="right">Resultado</Th>
              <Th align="right">Receita por atend.</Th>
              <Th align="right">Custo por atend.</Th>
            </tr>
          </thead>
          <tbody>
            {st.promoters.map((p) => (
              <tr key={p.promoterId} className="hover:bg-subtle">
                <Td>
                  <Link href={`/painel/cadastros/usuarios/${p.promoterId}#custos`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                  <span className="block text-[11px] text-muted">{p.employment === "fixed" ? "Fixo" : "Freelancer"}</span>
                </Td>
                <Td align="right" className="tnum">{p.stores}</Td>
                <Td align="right" className="tnum">{p.brands}</Td>
                <Td align="right" className="tnum">{p.visits}</Td>
                <Td align="right" className="tnum">{brl(p.revenue)}</Td>
                <Td align="right" className="tnum">{p.cost ? brl(p.cost) : "—"}</Td>
                <Td align="right" className={`tnum font-semibold ${p.cost && p.result < 0 ? "text-bad" : ""}`}>{p.cost ? brl(p.result) : "—"}</Td>
                <Td align="right" className="tnum">{brl(p.perVisit)}</Td>
                <Td align="right" className="tnum">{brl(p.costPerVisit)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="px-5 py-3 text-[12px] text-muted">Promotor com poucos atendimentos e custo fixo cheio quase sempre dá prejuízo: vale rever a rota (somar lojas na mesma região) ou o modelo de pagamento.</p>
      </SectionCard>
    </>
  );
}
