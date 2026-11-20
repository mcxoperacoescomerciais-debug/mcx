import { PageHeader } from "@/components/ui";
import { formatBr, formatMinutes, isMonth, monthLabel, todayIso } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { monthReport } from "@/server/reports";
import { missesReport } from "@/server/templates";

export const metadata = { title: "Relatórios" };

const money = (cents: number | null) => (cents === null ? "—" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireCan("report.view");
  const { mes } = await searchParams;
  const month = isMonth(mes) ? mes : todayIso().slice(0, 7);
  const [r, misses] = await Promise.all([monthReport(user, month), missesReport(user)]);
  if (!r) return null;
  const th = "pb-1 font-semibold";
  const td = "py-1.5";

  return (
    <>
      <PageHeader title="Relatórios" subtitle={`${monthLabel(r.from)} · ${formatMinutes(r.totalMinutes)} apontados`}>
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="r-mes">Mês</label>
            <input id="r-mes" type="month" name="mes" defaultValue={month} className="field" />
          </div>
          <button className="btn-ghost">Ver</button>
        </form>
      </PageHeader>

      {r.hiring && <p role="status" className="mb-5 rounded-lg bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">A equipe passou de 80% da capacidade por 4 semanas seguidas — é o sinal de contratação.</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="r-cli">
          <h2 id="r-cli" className="mb-3 text-sm font-bold text-ink-2">Horas por contratante (ranking)</h2>
          {r.byClient.length === 0 ? <p className="text-sm text-muted">Nenhum tempo apontado neste mês.</p> : (
            <ol className="space-y-2 text-sm">
              {r.byClient.map((c, i) => (
                <li key={c.clientId}>
                  <div className="flex items-center justify-between">
                    <span className="text-ink-2">{i + 1}. {c.clientName}</span>
                    <strong className="tabular-nums">{formatMinutes(c.minutes)}</strong>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-line" aria-hidden>
                    <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.round((c.minutes / r.byClient[0].minutes) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="card overflow-x-auto p-4" aria-labelledby="r-tipo">
          <h2 id="r-tipo" className="mb-3 text-sm font-bold text-ink-2">Tempo por categoria e tipo</h2>
          {r.byType.length === 0 ? <p className="text-sm text-muted">Nenhum tempo apontado neste mês.</p> : (
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className={th}>Categoria · tipo</th>
                  <th scope="col" className={`${th} text-right`}>Total</th>
                  <th scope="col" className={`${th} text-right`}>Concluídas</th>
                  <th scope="col" className={`${th} text-right`}>Média</th>
                  <th scope="col" className={`${th} text-right`}>Mediana</th>
                </tr>
              </thead>
              <tbody>
                {r.byType.map((t) => (
                  <tr key={`${t.category}|${t.type}`} className="border-t border-line">
                    <td className={`${td} text-ink-2`}>{t.category} · <span className={t.type === "Sem tipo" ? "text-warn" : ""}>{t.type}</span></td>
                    <td className={`${td} text-right tabular-nums`}>{formatMinutes(t.minutes)}</td>
                    <td className={`${td} text-right tabular-nums`}>{t.count}</td>
                    <td className={`${td} text-right tabular-nums`}>{t.count ? formatMinutes(t.average) : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{t.count ? formatMinutes(t.median) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-muted">Média e mediana consideram o tempo total de cada demanda concluída.</p>
        </section>

        <section className="card overflow-x-auto p-4" aria-labelledby="r-cap">
          <h2 id="r-cap" className="mb-3 text-sm font-bold text-ink-2">Capacidade por semana (apontado ÷ disponível)</h2>
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className={th}>Semana de</th>
                {r.capacity[0]?.persons.map((p) => <th key={p.id} scope="col" className={`${th} text-right`}>{p.name}</th>)}
                <th scope="col" className={`${th} text-right`}>Equipe</th>
              </tr>
            </thead>
            <tbody>
              {r.capacity.map((w) => (
                <tr key={w.week} className="border-t border-line">
                  <td className={`${td} text-ink-2`}>{formatBr(w.week)}</td>
                  {w.persons.map((p) => <td key={p.id} className={`${td} text-right tabular-nums`}>{p.percent}%</td>)}
                  <td className={`${td} text-right font-bold tabular-nums ${w.teamPercent > 80 ? "text-warn" : ""}`}>{w.teamPercent}%{w.teamPercent > 80 ? " ▲" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">Horas disponíveis por pessoa são configuradas em Usuários. Acima de 80% por 4 semanas seguidas: sinal de contratação.</p>
        </section>

        {r.revenue && (
          <section className="card overflow-x-auto p-4" aria-labelledby="r-rec">
            <h2 id="r-rec" className="mb-3 text-sm font-bold text-ink-2">Horas × Receita por contratante</h2>
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className={th}>Contratante</th>
                  <th scope="col" className={`${th} text-right`}>Horas</th>
                  <th scope="col" className={`${th} text-right`}>Custo estimado</th>
                  <th scope="col" className={`${th} text-right`}>Contrato</th>
                  <th scope="col" className={`${th} text-right`}>Resultado</th>
                  <th scope="col" className={`${th} text-right`}>Margem</th>
                </tr>
              </thead>
              <tbody>
                {r.revenue.rows.map((c) => (
                  <tr key={c.clientId} className="border-t border-line">
                    <td className={`${td} text-ink-2`}>{c.clientName}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatMinutes(c.minutes)}</td>
                    <td className={`${td} text-right tabular-nums`}>{money(c.costCents)}</td>
                    <td className={`${td} text-right tabular-nums`}>{money(c.revenueCents)}</td>
                    <td className={`${td} text-right tabular-nums ${c.resultCents !== null && c.resultCents < 0 ? "font-semibold text-bad" : ""}`}>{money(c.resultCents)}</td>
                    <td className={`${td} text-right tabular-nums`}>{c.margin === null ? "—" : `${c.margin}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              {r.revenue.missingCost ? "Há pessoas sem custo/hora cadastrado (Usuários): o custo delas entra como zero. " : ""}
              O valor mensal de cada contratante é informado no cadastro dele, até os contratos entrarem na Fase 5.
            </p>
          </section>
        )}

        <section className="card p-4" aria-labelledby="r-faltou">
          <h2 id="r-faltou" className="mb-3 text-sm font-bold text-ink-2">Itens que mais faltaram (checklists)</h2>
          {misses.length === 0 ? <p className="text-sm text-muted">Nenhum “Faltou algo” registrado.</p> : (
            <ul className="space-y-1.5 text-sm">
              {misses.map((m, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="text-ink-2"><strong>{m.item}</strong> <span className="text-muted">· {m.templateName ?? "sem modelo"} · {m.clientName}</span></span>
                  <strong className="tabular-nums">{m.n}×</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
