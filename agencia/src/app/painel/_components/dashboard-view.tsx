/**
 * Tela de indicadores (gráficos) — usada no menu Indicadores e na visão geral
 * executiva (agência de uma marca só). Os dados de cada gráfico também vão numa
 * tabela oculta, para o "Exportar Excel" levar tudo.
 */
import { AlertTriangle, CalendarClock, PackageX, Store, Warehouse } from "lucide-react";
import type { DashboardData } from "@/server/dashboard";
import { DAMAGE_KIND_LABEL, RUPTURE_SITUATION_LABEL, VALIDITY_LOCATION_LABEL, type DamageKind, type RuptureSituation, type ValidityLocation } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { describeDays } from "@/lib/validity";
import { withParams } from "@/lib/filters";
import { KpiCard, SectionCard, Table, Td, Th } from "./widgets";
import { CountBars, Donut, Gauge, IndexBars, TrendChart, type ChartSlice } from "./dashboard-charts";

const pct = (v: number | null) => (v === null ? "—" : `${String(v).replace(".", ",")}%`);

function DataTable({ title, rows }: { title: string; rows: ChartSlice[] }) {
  return (
    <table hidden data-export-title={title}>
      <thead>
        <tr>
          <th>{title.startsWith("Evolução") ? "Dia" : "Nome"}</th>
          <th>SKUs verificados</th>
          <th>SKUs em ruptura</th>
          <th>Índice de ruptura (%)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{title.startsWith("Evolução") ? fmtDate(r.id) : r.name}</td>
            <td>{r.checks}</td>
            <td>{r.ruptures}</td>
            <td>{r.index ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DashboardView({ d, variant, from, to }: { d: DashboardData; variant: "full" | "executive"; from: string; to: string }) {
  const t = d.totals;
  const link = (path: string, extra: Record<string, string | null> = {}) => `${path}${withParams({ from, to, ...extra })}`;
  const situationRows = d.situations.map((x) => ({ name: RUPTURE_SITUATION_LABEL[x.situation as RuptureSituation] ?? x.situation, value: x.n }));
  const damageRows = d.damages.map((x) => ({ name: DAMAGE_KIND_LABEL[x.kind as DamageKind] ?? x.kind, value: x.units || x.n }));
  const validityByLocation = (["sales_floor", "stock"] as ValidityLocation[]).map((loc) => ({
    name: VALIDITY_LOCATION_LABEL[loc],
    value: d.validities.filter((v) => v.location === loc && (v.severity === "expired" || v.severity === "critical")).reduce((n, v) => n + v.n, 0),
  }));

  return (
    <div className="space-y-6">
      {/* Indicadores principais */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="Índice de ruptura" value={pct(t.ruptureIndex)} tone={(t.ruptureIndex ?? 0) >= 15 ? "danger" : (t.ruptureIndex ?? 0) >= 8 ? "warning" : "success"} sub={`${t.ruptures} de ${t.checks} SKU(s) verificados`} href={link("/painel/rupturas")} icon={<PackageX className="size-4" />} />
        <KpiCard label="Ruptura na área de vendas" value={t.salesFloor} tone={t.salesFloor ? "danger" : "success"} sub="Gôndola sem o produto" href={link("/painel/rupturas")} icon={<Store className="size-4" />} />
        <KpiCard label="Ruptura no estoque" value={t.stockroom} tone={t.stockroom ? "warning" : "success"} sub="Depósito sem o produto" href={link("/painel/rupturas")} icon={<Warehouse className="size-4" />} />
        <KpiCard label="Datas críticas" value={t.critical} tone={t.critical ? "danger" : "success"} sub={`${t.criticalUnits} un · ${t.expired} vencido(s)`} href={link("/painel/validades", { status: "urgent" })} icon={<CalendarClock className="size-4" />} />
        <KpiCard label="Avarias" value={t.damages} tone={t.damages ? "warning" : "success"} sub={`${t.damageUnits} unidade(s)`} href={link("/painel/avarias")} icon={<AlertTriangle className="size-4" />} />
        <KpiCard label="Lojas não atendidas" value={t.storesMissed} tone={t.storesMissed ? "danger" : "success"} sub={`${t.storesDone} de ${t.storesPlanned} atendida(s)${t.storesInProgress ? ` · ${t.storesInProgress} em andamento` : ""}`} href={link("/painel/visitas", { status: "missed" })} />
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <SectionCard title="Índice de ruptura por rede" subtitle="Clique numa rede para filtrar a tela. Vermelho: 20% ou mais · laranja: 10% ou mais." bodyClass="px-3 pb-4">
          <IndexBars data={d.byChain} filterKey="chain" />
          <DataTable title="Índice de ruptura por rede" rows={d.byChain} />
        </SectionCard>
        <SectionCard title="Evolução da ruptura" subtitle="SKUs em ruptura por dia (barras) e índice de ruptura (linha)" bodyClass="px-3 pb-4">
          <TrendChart data={d.byDay} />
          <DataTable title="Evolução da ruptura" rows={d.byDay} />
        </SectionCard>
        <SectionCard title="SKUs com mais ruptura" subtitle="Quantas vezes cada produto foi encontrado em ruptura no período" bodyClass="px-3 pb-4">
          <CountBars data={d.byProduct.map((p) => ({ id: p.id, name: p.name, value: p.ruptures, extra: `índice ${pct(p.index)} (${p.checks} verificações)` }))} />
          <DataTable title="SKUs com mais ruptura" rows={d.byProduct} />
        </SectionCard>
        <SectionCard title="Lojas com maior índice de ruptura" subtitle="Clique numa loja para filtrar a tela" bodyClass="px-3 pb-4">
          <IndexBars data={d.byStore} filterKey="store" />
          <DataTable title="Lojas com maior ruptura" rows={d.byStore} />
        </SectionCard>
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <SectionCard title="Lojas atendidas" subtitle="Programadas no período" bodyClass="px-5 pb-5 space-y-4">
          <Gauge value={t.coverage} label={`${t.storesDone} de ${t.storesPlanned} loja(s) atendida(s)`} />
          <Donut
            center="lojas"
            data={[
              { name: "Atendidas", value: t.storesDone, color: "#1d7348" },
              { name: "Em andamento", value: t.storesInProgress, color: "#1d5ea6" },
              { name: "Não atendidas", value: t.storesMissed, color: "#c0392b" },
              { name: "Ainda no prazo", value: Math.max(0, t.storesPlanned - t.storesDone - t.storesInProgress - t.storesMissed), color: "#9aa7ab" },
            ]}
          />
        </SectionCard>
        <SectionCard title={variant === "executive" ? "Ruptura: área de vendas × estoque" : "Ruptura por situação"} bodyClass="px-5 pb-5">
          {variant === "executive" ? (
            <Donut
              center="rupturas"
              data={[
                { name: "Área de vendas", value: t.salesFloor, color: "#c0392b" },
                { name: "Estoque (depósito)", value: t.stockroom, color: "#d98200" },
              ]}
            />
          ) : (
            <Donut center="rupturas" data={situationRows} />
          )}
        </SectionCard>
        <SectionCard title={variant === "executive" ? "Datas críticas por local" : "Avarias por tipo"} subtitle={variant === "executive" ? "Vencidos e críticos" : "Unidades avariadas"} bodyClass="px-5 pb-5">
          {variant === "executive" ? <Donut center="itens" data={validityByLocation} /> : <Donut center="un" data={damageRows} />}
        </SectionCard>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <SectionCard title={`Lojas não atendidas (${d.missed.length})`} subtitle="Programadas e não iniciadas" bodyClass="pb-1">
          {d.missed.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Dia</Th>
                  <Th>Loja</Th>
                  <Th>Promotor</Th>
                  <Th>Marcas</Th>
                </tr>
              </thead>
              <tbody>
                {d.missed.slice(0, 50).map((m, i) => (
                  <tr key={i}>
                    <Td className="tnum whitespace-nowrap">{fmtDate(m.date)}</Td>
                    <Td>
                      <span className="font-semibold">{m.store}</span> <span className="text-muted">· {m.city}</span>
                    </Td>
                    <Td>{m.promoter}</Td>
                    <Td className="text-muted">{m.brands}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-4 text-[13px] text-ok font-medium">Todas as lojas programadas foram atendidas.</p>
          )}
        </SectionCard>
        <SectionCard title={`Datas críticas (${d.criticalList.length})`} subtitle="Vencidos e vencendo na faixa crítica — os mais urgentes primeiro" bodyClass="pb-1">
          {d.criticalList.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Loja</Th>
                  <Th>Validade</Th>
                  <Th align="right">Qtd.</Th>
                  <Th>Local</Th>
                </tr>
              </thead>
              <tbody>
                {d.criticalList.map((v, i) => (
                  <tr key={i}>
                    <Td>
                      <span className="font-semibold">{v.product}</span>
                      <span className="block text-[11.5px] text-muted">SKU {v.sku}</span>
                    </Td>
                    <Td>{v.store}</Td>
                    <Td className={v.days < 0 ? "text-bad font-semibold" : "text-warn font-semibold"}>
                      {fmtDate(v.expiry)}
                      <span className="block text-[11.5px] font-normal text-muted">{v.days < 0 ? "vencido" : describeDays(v.days)}</span>
                    </Td>
                    <Td align="right" className="tnum">
                      {v.quantity} {v.unit}
                    </Td>
                    <Td>{VALIDITY_LOCATION_LABEL[v.location as ValidityLocation] ?? v.location}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-4 text-[13px] text-ok font-medium">Nenhum produto vencido ou crítico no período.</p>
          )}
        </SectionCard>
      </div>

      {variant === "full" ? null : (
        <SectionCard title="Avarias por tipo" subtitle="Unidades avariadas no período" bodyClass="px-5 pb-5">
          <Donut center="un" data={damageRows} />
        </SectionCard>
      )}
    </div>
  );
}
