import { PageHeader } from "@/components/ui";
import { formatMoney } from "@/lib/crm";
import { formatBr, isMonth, monthLabel, todayIso } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { commercialDashboard } from "@/server/crm";

export const metadata = { title: "Painel comercial" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-bold text-brand-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export default async function CommercialDashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireCan("crm.view");
  const { mes } = await searchParams;
  const month = isMonth(mes) ? mes : todayIso().slice(0, 7);
  const data = (await commercialDashboard(user, `${month}-01`))!;
  const maxWeek = Math.max(1, ...data.weeks.map((w) => Math.max(w.contacts, w.goal)));
  return (
    <>
      <PageHeader title="Painel comercial" subtitle={`${monthLabel(`${month}-01`)} e as últimas 4 semanas.`}>
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="pc-mes">Mês</label>
            <input id="pc-mes" type="month" name="mes" defaultValue={month} className="field" />
          </div>
          <button className="btn-ghost">Ver</button>
        </form>
      </PageHeader>

      {data.total === 0 && <p className="card mb-4 px-4 py-6 text-center text-sm text-muted">Ainda não há leads. Os números aparecem conforme o funil for usado.</p>}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Taxa de resposta (mês)" value={`${data.response.percent}%`} hint={`${data.response.answered} de ${data.response.contacted} contatados responderam`} />
        <Stat label="Demonstrações (mês)" value={String(data.demos)} />
        <Stat label="Propostas (mês)" value={String(data.proposals)} />
        <Stat label="Fechamentos (mês)" value={String(data.won.count)} hint={`MRR ganho: ${formatMoney(data.won.cents)}`} />
        <Stat label="Pipeline em aberto" value={formatMoney(data.pipeline.totalCents)} hint={`${data.pipeline.count} ${data.pipeline.count === 1 ? "lead" : "leads"} · por mês`} />
        <Stat label="Pipeline ponderado" value={formatMoney(data.pipeline.weightedCents)} hint="Valor × chance de fechar da etapa" />
        <Stat label="Ciclo médio" value={data.cycleDays == null ? "—" : `${data.cycleDays} ${data.cycleDays === 1 ? "dia" : "dias"}`} hint="Do primeiro contato ao ganho (ganhos do mês)" />
        <Stat label="Meta diária" value={`${data.goal} contatos`} hint="Novos contatos por dia útil" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="pc-weeks">
          <h2 id="pc-weeks" className="mb-3 text-sm font-bold text-ink-2">Novos contatos por semana × meta</h2>
          <ul className="space-y-3">
            {data.weeks.map((w) => (
              <li key={w.week}>
                <div className="flex justify-between text-xs text-muted">
                  <span>Semana de {formatBr(w.week)}</span>
                  <span className={w.contacts >= w.goal ? "font-semibold text-ok" : "font-semibold text-ink-2"}>
                    {w.contacts} de {w.goal}
                  </span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-subtle">
                  <div className={w.contacts >= w.goal ? "h-full rounded-full bg-ok" : "h-full rounded-full bg-brand-600"} style={{ width: `${(w.contacts / maxWeek) * 100}%` }} />
                  <span aria-hidden className="absolute top-[-3px] h-3.5 w-0.5 bg-ink-2" style={{ left: `${(w.goal / maxWeek) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4" aria-labelledby="pc-conv">
          <h2 id="pc-conv" className="mb-3 text-sm font-bold text-ink-2">Conversão entre etapas (todo o histórico)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-1 font-semibold">Etapa</th>
                <th className="pb-1 text-right font-semibold">Chegaram</th>
                <th className="pb-1 text-right font-semibold">Da etapa anterior</th>
              </tr>
            </thead>
            <tbody>
              {data.conversion.map((c) => (
                <tr key={c.name} className="border-t border-line">
                  <td className="py-1.5 text-ink">{c.name}</td>
                  <td className="py-1.5 text-right font-semibold text-ink">{c.count}</td>
                  <td className="py-1.5 text-right text-ink-2">{c.percentFromPrevious == null ? "—" : `${c.percentFromPrevious}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card p-4" aria-labelledby="pc-loss">
          <h2 id="pc-loss" className="mb-3 text-sm font-bold text-ink-2">Motivos de perda (mês)</h2>
          {data.lossReasons.length === 0 ? (
            <p className="text-sm text-muted">Nenhum lead perdido neste mês.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.lossReasons.map((r) => (
                <li key={r.reason} className="flex justify-between border-t border-line py-1.5 first:border-t-0">
                  <span className="text-ink">{r.reason}</span>
                  <span className="font-semibold text-ink">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {[
          { id: "pc-src", title: "Resultado por origem", rows: data.bySource },
          { id: "pc-type", title: "Resultado por tipo de lead", rows: data.byType },
        ].map((block) => (
          <section key={block.id} className="card p-4" aria-labelledby={block.id}>
            <h2 id={block.id} className="mb-3 text-sm font-bold text-ink-2">{block.title}</h2>
            {block.rows.length === 0 ? (
              <p className="text-sm text-muted">Sem leads ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="pb-1 font-semibold">&nbsp;</th>
                    <th className="pb-1 text-right font-semibold">Leads</th>
                    <th className="pb-1 text-right font-semibold">Ganhos</th>
                    <th className="pb-1 text-right font-semibold">Perdidos</th>
                    <th className="pb-1 text-right font-semibold">MRR ganho</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.name} className="border-t border-line">
                      <td className="py-1.5 text-ink">{r.name}</td>
                      <td className="py-1.5 text-right text-ink">{r.total}</td>
                      <td className="py-1.5 text-right text-ok">{r.won}</td>
                      <td className="py-1.5 text-right text-bad">{r.lost}</td>
                      <td className="py-1.5 text-right text-ink">{formatMoney(r.wonCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
