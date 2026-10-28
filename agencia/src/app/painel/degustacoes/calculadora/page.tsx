import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canManageTastings, tastingFormOptions } from "@/server/tastings";
import { calcReferences, getQuote, listQuotes } from "@/server/tasting-quotes";
import { isUuid } from "@/lib/filters";
import { DEFAULT_FUEL_PRICE, blankCity, normalizeCity, type CalcCity } from "@/lib/tasting-calc";
import { fmtDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { DegTabs } from "../_components/deg-tabs";
import { Calculator, type QuoteData } from "./calculator";

export const metadata: Metadata = { title: "Calculadora de degustação" };

/** Calculadora: quanto cobrar em cada cidade para não ter prejuízo e chegar à margem desejada. */
export default async function CalculatorPage({ searchParams }: PageProps<"/painel/degustacoes/calculadora">) {
  const scope = await getScope();
  if (!canManageTastings(scope)) notFound();
  const sp = await searchParams;
  const id = typeof sp.orcamento === "string" && isUuid(sp.orcamento) ? sp.orcamento : null;
  const [opts, refs, quotes, saved] = await Promise.all([tastingFormOptions(scope), calcReferences(scope), listQuotes(scope), id ? getQuote(scope, id) : Promise.resolve(null)]);
  // Ponto de partida: um exemplo com valores comuns, para ajustar.
  const example: CalcCity = { ...blankCity("Divinópolis"), actions: 8, tasterFee: 160, meal: 25, transportKm: 30, transportKml: 10, consumables: 15, equipment: 10, supervision: 150 };
  const initial: QuoteData = saved
    ? { id: saved.id, name: saved.name, brandId: saved.brandId, globals: { ...saved.globals, fuelPrice: saved.globals.fuelPrice ?? DEFAULT_FUEL_PRICE }, cities: Array.isArray(saved.cities) ? saved.cities.map(normalizeCity) : [], notes: saved.notes }
    : { id: null, name: "", brandId: null, globals: { taxPct: 6, adminPct: 0, marginPct: 30, fuelPrice: DEFAULT_FUEL_PRICE }, cities: [example], notes: null };
  return (
    <>
      <DegTabs />
      <PageHeader noExport
        title="Calculadora de degustação"
        subtitle="Monte o pedido da marca por cidade: a calculadora mostra o preço mínimo para não ter prejuízo, o preço com a sua margem e quanto cada cidade deixa."
      />
      <Calculator
        key={initial.id ?? "novo"}
        initial={initial}
        brands={opts.brands.map((b) => ({ id: b.id, name: b.name }))}
        refs={refs}
        quotes={quotes.map((x) => ({ id: x.id, name: x.name, brandName: x.brandName, count: Array.isArray(x.cities) ? x.cities.length : 0, updatedAt: fmtDate(x.updatedAt.toISOString().slice(0, 10)) }))}
      />
      <p className="text-[12px] text-muted mt-6 max-w-4xl">
        Como a conta é feita: custo direto = (degustadoras × cachê e alimentação + transporte + descartáveis, produto e equipamento) × ações + custos da cidade (frete × viagens, hospedagem e supervisão). Transporte e frete pelo km: km rodados ÷ km por litro do veículo × preço do combustível. Preço mínimo = custo ÷ (1 − impostos). Preço sugerido = custo ÷ (1 − impostos − margem de contribuição). A margem aqui é de contribuição: as despesas administrativas e fixas da agência não entram na calculadora — elas são descontadas no DRE geral do Financeiro.
      </p>
    </>
  );
}
