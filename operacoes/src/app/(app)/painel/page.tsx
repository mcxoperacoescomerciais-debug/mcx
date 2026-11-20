import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { formatBr, formatMinutes, isMonth, monthLabel, todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { contractsEnding } from "@/server/contracts";
import { documentsExpiring } from "@/server/documents";
import { dashboard } from "@/server/reports";

export const metadata = { title: "Painel" };

const money = (cents: number | null) => (cents === null ? "—" : `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

function Stat({ label, value, href, tone }: { label: string; value: number; href?: string; tone?: "bad" | "warn" | "ok" }) {
  const color = value === 0 ? "text-ink" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  const body = (
    <>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-ink-2">{label}</p>
    </>
  );
  return href ? <Link href={href} className="card block p-4 hover:border-brand-500">{body}</Link> : <div className="card p-4">{body}</div>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const { mes } = await searchParams;
  const month = isMonth(mes) ? mes : todayIso().slice(0, 7);
  const [d, ending, expiring] = await Promise.all([dashboard(user, month), contractsEnding(user), documentsExpiring(user)]);
  const all = can(user.role, "demand.viewAll");
  return (
    <>
      <PageHeader title="Painel" subtitle={all ? `Operação da MCX · ${monthLabel(`${month}-01`)}` : `Suas demandas · ${monthLabel(`${month}-01`)}`}>
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="p-mes">Mês</label>
            <input id="p-mes" type="month" name="mes" defaultValue={month} className="field" />
          </div>
          <button className="btn-ghost">Ver</button>
        </form>
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Demandas abertas" value={d.open} href="/demandas" />
        <Stat label="Atrasadas" value={d.overdue} href="/demandas?atrasadas=1" tone="bad" />
        <Stat label="Aguardando retorno com cobrança vencida" value={d.followUp} href="/demandas?aguardando=1" tone="warn" />
        {all && <Stat label="Sem responsável (deve ser zero)" value={d.unassigned} href="/demandas?responsavel=none" tone="bad" />}
        <Stat label="Concluídas no mês" value={d.done} href="/demandas?status=done" />
        <Stat label="Rotinas geradas hoje" value={d.routinesToday} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="p-resp">
          <h2 id="p-resp" className="mb-3 text-sm font-bold text-ink-2">Abertas por responsável</h2>
          {d.byAssignee.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma demanda aberta.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.byAssignee.map((r) => (
                <li key={r.id ?? "none"} className="flex items-center justify-between">
                  <Link href={`/demandas?responsavel=${r.id ?? "none"}`} className={`underline-offset-2 hover:underline ${r.id ? "text-ink-2" : "font-semibold text-warn"}`}>{r.name ?? "A distribuir"}</Link>
                  <strong className="tabular-nums">{r.n}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.byClient && (
          <section className="card p-4" aria-labelledby="p-horas">
            <h2 id="p-horas" className="mb-3 text-sm font-bold text-ink-2">Horas por contratante no mês × valor do contrato</h2>
            {d.byClient.length === 0 ? (
              <p className="text-sm text-muted">Nenhum tempo apontado neste mês ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="pb-1 font-semibold">Contratante</th>
                    <th scope="col" className="pb-1 text-right font-semibold">Horas</th>
                    {d.revenue && <th scope="col" className="pb-1 text-right font-semibold">Contrato</th>}
                  </tr>
                </thead>
                <tbody>
                  {d.byClient.map((c) => (
                    <tr key={c.clientId} className="border-t border-line">
                      <td className="py-1.5 text-ink-2">{c.clientName}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMinutes(c.minutes)}</td>
                      {d.revenue && <td className="py-1.5 text-right tabular-nums">{money(d.revenue.rows.find((r) => r.clientId === c.clientId)?.revenueCents ?? null)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-sm">
              <Link href={`/relatorios?mes=${month}`} className="font-semibold text-brand-600 underline-offset-2 hover:underline">Ver relatório completo →</Link>
            </p>
          </section>
        )}
      </div>
      {(ending.length > 0 || expiring.length > 0) && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {ending.length > 0 && (
            <section className="card border-l-4 border-l-warn p-4" aria-labelledby="p-contratos">
              <h2 id="p-contratos" className="mb-3 text-sm font-bold text-ink-2">Contratos terminando em até 30 dias</h2>
              <ul className="space-y-2 text-sm">
                {ending.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-x-3">
                    <Link href={`/contratos/${c.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">{c.clientName}</Link>
                    <span className={c.expired ? "font-semibold text-bad" : "text-ink-2"}>{c.expired ? "venceu em" : "até"} {formatBr(c.endDate)}{c.autoRenew ? " · renova sozinho" : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {expiring.length > 0 && (
            <section className="card border-l-4 border-l-warn p-4" aria-labelledby="p-docs">
              <h2 id="p-docs" className="mb-3 text-sm font-bold text-ink-2">Documentos com validade em até 30 dias</h2>
              <ul className="space-y-2 text-sm">
                {expiring.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap justify-between gap-x-3">
                    <Link href={`/documentos/${doc.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">{doc.title}{doc.clientName ? ` — ${doc.clientName}` : ""}</Link>
                    <span className={doc.expired ? "font-semibold text-bad" : "text-ink-2"}>{doc.expired ? "venceu em" : "até"} {formatBr(doc.expiresOn)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
