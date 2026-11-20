import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/stock/forms";
import { formatBr, isMonth, monthLabel, todayIso } from "@/lib/dates";
import { UNIT_STATUS_LABEL } from "@/lib/stock";
import { requireCan } from "@/server/auth";
import { monthlyStockReport } from "@/server/stock";

export const metadata = { title: "Relatório de estoque" };

export default async function StockReportPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ mes?: string }> }) {
  const user = await requireCan("stock.manage");
  const [{ clientId }, { mes }] = await Promise.all([params, searchParams]);
  const month = isMonth(mes) ? mes : todayIso().slice(0, 7);
  const r = await monthlyStockReport(user, clientId, `${month}-01`);
  if (!r) notFound();
  const destinations = r.rows.flatMap((row) => row.byDestination.map((d) => ({ ...d, item: row.name, unit: row.unit })));
  const th = "px-2 py-1.5 text-right font-semibold";
  const td = "px-2 py-1.5 text-right";
  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-end justify-between gap-3">
        <Link href={`/estoque/${r.client.id}`} className="text-sm font-semibold text-brand-600 underline-offset-2 hover:underline">← Estoque — {r.client.name}</Link>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <div>
              <label className="label" htmlFor="sr-mes">Mês</label>
              <input id="sr-mes" type="month" name="mes" defaultValue={month} className="field" />
            </div>
            <button className="btn-ghost">Ver</button>
          </form>
          <PrintButton />
        </div>
      </div>

      <article className="card p-5">
        <header className="mb-4 border-b border-line pb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">MCX · Prestação de contas do estoque</p>
          <h1 className="text-2xl font-bold text-brand-900">{r.client.name}</h1>
          <p className="text-sm text-ink-2">{monthLabel(r.from)} · de {formatBr(r.from)} a {formatBr(r.to)}</p>
        </header>

        {r.rows.length === 0 ? (
          <p className="text-sm text-muted">Sem saldo nem movimentação de materiais neste mês.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="px-2 py-1.5 text-left font-semibold">Item</th>
                  <th className={th}>Saldo inicial</th>
                  <th className={th}>Entradas</th>
                  <th className={th}>Saídas</th>
                  <th className={th}>Devoluções</th>
                  <th className={th}>Perdas</th>
                  <th className={th}>Ajustes</th>
                  <th className={th}>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-2 py-1.5 text-ink">{row.name} <span className="text-xs text-muted">({row.unit})</span></td>
                    <td className={td}>{row.opening}</td>
                    <td className={td}>{row.entries || "—"}</td>
                    <td className={td}>{row.outputs || "—"}</td>
                    <td className={td}>{row.returns || "—"}</td>
                    <td className={td}>{row.losses || "—"}</td>
                    <td className={td}>{row.adjustments ? `${row.adjustments > 0 ? "+" : ""}${row.adjustments}` : "—"}</td>
                    <td className={`${td} font-bold text-ink`}>{row.closing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {destinations.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold text-ink-2">Saídas por ação e cidade</h2>
            <table className="w-full text-sm">
              <tbody>
                {destinations.map((d) => (
                  <tr key={`${d.item}-${d.destination}`} className="border-t border-line">
                    <td className="px-2 py-1.5 text-ink">{d.destination}</td>
                    <td className="px-2 py-1.5 text-ink-2">{d.item}</td>
                    <td className={`${td} font-semibold text-ink`}>{d.quantity} {d.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {r.equipment.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-bold text-ink-2">Equipamentos (situação de hoje)</h2>
            <table className="w-full text-sm">
              <tbody>
                {r.equipment.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-2 py-1.5 text-ink">{u.label}</td>
                    <td className="px-2 py-1.5 text-ink-2">{UNIT_STATUS_LABEL[u.status]}{u.status === "in_use" ? ` — com ${u.holder} até ${formatBr(u.dueBack)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <p className="mt-6 text-xs text-muted">Emitido em {formatBr(todayIso())}. Saldos calculados a partir das movimentações registradas.</p>
      </article>
    </>
  );
}
