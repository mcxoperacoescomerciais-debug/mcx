import type { Metadata } from "next";
import { FileDown, RefreshCw } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { actionCampaigns, loadActions, summarize } from "@/server/actions-data";
import { REPORT_BLOCKS } from "@/server/pdf/brand-report-pdf";
import { addDays, fmtDate, todayIso } from "@/lib/dates";
import { pct } from "@/lib/actions";
import { EmptyState, PageHeader, buttonClass, inputClass, selectClass } from "@/components/ui";
import { KpiCard, SectionCard } from "../../_components/widgets";

export const metadata: Metadata = { title: "Relatório para a marca" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const n = (v: number) => v.toLocaleString("pt-BR");

/** Relatório da campanha para a marca: escolhe marca, período, campanha e os blocos; gera o PDF. */
export default async function BrandReportPage({ searchParams }: PageProps<"/painel/acoes/relatorio">) {
  const scope = await getScope();
  const sp = await searchParams;
  const options = await filterOptions(scope);
  const brand = options.brands.find((b) => b.id === one(sp.brand))?.id ?? options.brands[0]?.id ?? "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.to)) ? one(sp.to) : todayIso();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.from)) ? one(sp.from) : addDays(to, -30);
  const campaign = one(sp.campaign) || null;
  const chosen = new Set(Array.isArray(sp.bloco) ? sp.bloco : sp.bloco ? [sp.bloco] : REPORT_BLOCKS.map((b) => b.key));
  const [campaigns, actions] = brand ? await Promise.all([actionCampaigns(scope, brand), loadActions(scope, { from, to, brand, campaign })]) : [[], []];
  const sum = summarize(actions);
  const realized = actions.filter((a) => a.state === "realized");
  const photos = realized.reduce((t, a) => t + a.photos.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Ações · relatório para a marca"
        title="Relatório para a marca"
        subtitle="Escolha a marca, o período (ou a campanha) e o que entra no relatório. O PDF sai com o logo da agência, pronto para enviar."
        noExport
      />
      {!options.brands.length ? (
        <EmptyState title="Nenhuma marca cadastrada">Cadastre as marcas clientes em Cadastros › Marcas.</EmptyState>
      ) : (
        <div className="grid xl:grid-cols-3 gap-6">
          <SectionCard title="Montar relatório" bodyClass="px-5 pb-5">
            <form method="get" className="space-y-3">
              <label className="block">
                <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Marca</span>
                <select name="brand" defaultValue={brand} className={selectClass}>
                  {options.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">De</span>
                  <input type="date" name="from" defaultValue={from} className={inputClass} />
                </label>
                <label className="block">
                  <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Até</span>
                  <input type="date" name="to" defaultValue={to} className={inputClass} />
                </label>
              </div>
              <label className="block">
                <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Campanha (opcional)</span>
                <select name="campaign" defaultValue={campaign ?? ""} className={selectClass}>
                  <option value="">Todas as ações da marca no período</option>
                  {campaigns.map((c) => (
                    <option key={c.ref} value={c.ref}>
                      {c.ref}
                      {c.description ? ` · ${c.description}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="block text-[12.5px] font-semibold text-ink-2 mb-1">O que entra no relatório</legend>
                <div className="space-y-1.5">
                  {REPORT_BLOCKS.map((b) => (
                    <label key={b.key} className="flex items-center gap-2 text-[13.5px]">
                      <input type="checkbox" name="bloco" value={b.key} defaultChecked={chosen.has(b.key)} /> {b.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="block">
                <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Mensagem de abertura (opcional)</span>
                <textarea name="intro" rows={3} maxLength={800} defaultValue={one(sp.intro)} placeholder="Ex.: Segue o resultado das ações de degustação da campanha de novembro." className={inputClass + " h-auto py-2"} />
              </label>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="submit" className={buttonClass("secondary")}>
                  <RefreshCw className="size-4" /> Atualizar prévia
                </button>
                <button type="submit" formAction="/api/reports/acoes" formTarget="_blank" className={buttonClass("primary")}>
                  <FileDown className="size-4" /> Gerar PDF
                </button>
              </div>
            </form>
          </SectionCard>

          <div className="xl:col-span-2 space-y-4">
            <SectionCard title="Prévia do que vai no relatório" subtitle={`${options.brands.find((b) => b.id === brand)?.name ?? ""} · ${fmtDate(from)} a ${fmtDate(to)}${campaign ? ` · campanha ${campaign}` : ""}`} bodyClass="px-5 pb-5">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <KpiCard label="Ações realizadas" value={realized.length} tone="success" sub={`${sum.operation.cancelled + sum.operation.notDone} cancelada(s) ou não realizada(s)`} />
                <KpiCard label="Pessoas abordadas" value={n(sum.result.approached)} />
                <KpiCard label="Amostras" value={n(sum.result.samples)} />
                <KpiCard label="Vendas na ação" value={`${n(sum.result.sold)} un.`} sub={`conversão ${pct(sum.result.conversion)}`} />
              </div>
              <ul className="mt-4 text-[13.5px] text-ink-2 space-y-1">
                <li>
                  <strong>{new Set(realized.map((a) => a.storeId ?? a.storeName)).size}</strong> PDV(s) e <strong>{new Set(realized.map((a) => a.promoterName)).size}</strong> promotora(s)
                </li>
                <li>
                  <strong>{photos}</strong> foto(s) registradas (o PDF mostra montagem, ação e encerramento das ações mais recentes de cada PDV)
                </li>
                <li>
                  <strong>{sum.quality.occurrences.reduce((t, o) => t + o.n, 0)}</strong> ocorrência(s) e <strong>{realized.filter((a) => a.notes?.trim()).length}</strong> observação(ões) das promotoras
                </li>
              </ul>
              <p className="mt-4 text-[12.5px] text-muted">O relatório para a marca não mostra custos nem margem da agência.</p>
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}
