import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { getClientSettings } from "@/server/settings";
import { computeKpis, loadFacts, loadVisits, storeRanking, weeklySeries, isAlertFact } from "@/server/analytics";
import { addDays, formatIsoBr, todayIso } from "@/lib/validity";
import { parseFilters, resolveRange } from "@/lib/filters";
import { Badge, PageHeader, SeverityBadge } from "@/components/ui";
import { STORE_FORMAT_LABEL as FORMAT_LABEL, type StoreFormat } from "@/lib/domain";
import { FilterBar } from "../../_components/filter-bar";
import { WeeklyStack } from "../../_components/charts";
import { KpiCard, SectionCard } from "../../_components/widgets";
import { OpenOccurrence } from "../../_components/occurrence-drawer";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductPage({ params, searchParams }: PageProps<"/painel/produtos/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const db = await getDb();
  const [product] = await db.select().from(s.products).where(and(eq(s.products.id, id), eq(s.products.clientId, scope.clientId)));
  if (!product) notFound();
  const mixes = await db
    .select({ network: s.networks.name, format: s.productMixes.format, chainCode: s.productMixes.chainCode })
    .from(s.productMixes)
    .innerJoin(s.networks, eq(s.networks.id, s.productMixes.networkId))
    .where(eq(s.productMixes.productId, id));

  const settings = await getClientSettings(scope.clientId);
  const base = parseFilters(await searchParams, "30d");
  const filters = { ...base, productId: id };
  const range = resolveRange(filters);
  const today = todayIso();
  const [facts, visits, weekly] = await Promise.all([
    loadFacts(scope, filters, range.from, range.to),
    loadVisits(scope, base, range.from, range.to),
    loadFacts(scope, { period: "custom", productId: id }, addDays(today, -7 * 12), today),
  ]);
  const kpi = computeKpis(facts, visits, settings);
  const stores = storeRanking(facts, settings)
    .map((r) => ({ ...r, total: facts.filter((x) => x.storeId === r.storeId && isAlertFact(x)).length }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  const recent = facts.filter(isAlertFact).sort((a, b) => b.visitDate.localeCompare(a.visitDate)).slice(0, 15);

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={
          <span>
            {product.category}
            {product.code ? ` · Código SUINCO ${product.code}` : ""}
            {product.referencePrice ? ` · Tabela R$ ${Number(product.referencePrice).toFixed(2).replace(".", ",")}` : ""}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-1.5">
            {mixes.map((m) => (
              <Badge key={`${m.network}-${m.format}`} tone="neutral">
                {m.network} {FORMAT_LABEL[m.format as StoreFormat]}
                {m.chainCode ? ` · ${m.chainCode}` : ""}
              </Badge>
            ))}
          </div>
        }
      />
      <FilterBar filters={base} options={{ networks: [], stores: [], cities: [], promoters: [], products: [], categories: [] }} fields={[]} />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Registros" value={facts.length} />
        <KpiCard label="Próx. ao vencimento" value={kpi.nearExpiry} hint={<span className="text-[12px] text-muted">{kpi.nearExpiryUnits.toLocaleString("pt-BR")} unidades</span>} />
        <KpiCard label="Vencidos" value={kpi.expired} tone="critical" />
        <KpiCard label="Rupturas" value={kpi.ruptures} />
        <KpiCard label="Avarias" value={kpi.damages} />
      </section>

      <div className="grid gap-4 mt-4 xl:grid-cols-[1.3fr_1fr]">
        <SectionCard title="Evolução do produto" subtitle="Alertas por semana · últimas 12 semanas">
          <div className="px-3 pb-3">
            <WeeklyStack data={weeklySeries(weekly, 12, today)} />
          </div>
        </SectionCard>
        <SectionCard title="Lojas onde mais aparece" subtitle={range.label}>
          {stores.length ? (
            <ol className="px-5 pb-4 space-y-2">
              {stores.slice(0, 10).map((r, i) => (
                <li key={r.storeId} className="flex items-center justify-between text-[13px]">
                  <Link href={`/painel/lojas/${r.storeId}`} className="hover:underline">
                    <span className="text-muted tnum mr-1.5">{i + 1}.</span>
                    <b>{r.storeName}</b>
                    {r.storeCode ? ` · ${r.storeCode}` : ""} <span className="text-muted">· {r.city}</span>
                  </Link>
                  <span className="tnum font-semibold">{r.total}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 pb-5 text-[13px] text-muted">Sem alertas no período.</p>
          )}
        </SectionCard>
      </div>

      <div className="mt-4">
        <SectionCard title="Registros recentes" subtitle="Alertas do produto no período">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
                  <th className="font-semibold px-5 py-2">Visita</th>
                  <th className="font-semibold px-3 py-2">Loja</th>
                  <th className="font-semibold px-3 py-2">Tipo</th>
                  <th className="font-semibold px-3 py-2 text-right">Qtd</th>
                  <th className="font-semibold px-3 py-2">Validade</th>
                  <th className="font-semibold px-5 py-2">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((x) => (
                  <tr key={x.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-2.5 tnum">
                      <OpenOccurrence id={x.id} className="font-semibold hover:underline">
                        {formatIsoBr(x.visitDate)}
                      </OpenOccurrence>
                    </td>
                    <td className="px-3">
                      {x.storeName}
                      {x.storeCode ? ` · ${x.storeCode}` : ""}
                    </td>
                    <td className="px-3">{x.type === "validity" ? (x.location === "stock" ? "Estoque" : "Área de vendas") : x.type === "rupture" ? "Ruptura" : "Avaria"}</td>
                    <td className="px-3 text-right tnum">{x.quantity ?? "—"}</td>
                    <td className="px-3 tnum">{formatIsoBr(x.expiryDate)}</td>
                    <td className="px-5">{x.severity ? <SeverityBadge severity={x.severity} days={x.daysToExpiry} size="sm" /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
