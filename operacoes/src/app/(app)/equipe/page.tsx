import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { formatBr, formatMinutes, formatRelative, isIsoDate, todayIso } from "@/lib/dates";
import { TIMEZONE } from "@/lib/domain";
import { isOverdue } from "@/lib/queue";
import { requireCan } from "@/server/auth";
import { formOptions, listDemands } from "@/server/demands";
import { teamDay } from "@/server/time";
import { Reassign } from "./reassign";

export const metadata = { title: "Equipe" };

const hour = (d: Date | null) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(d) : "—");

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const user = await requireCan("team.view");
  const { dia } = await searchParams;
  const today = todayIso();
  const day = isIsoDate(dia) && dia <= today ? dia : today;
  const [rows, open, { people }] = await Promise.all([teamDay(user, day), listDemands(user, { status: "open" }), formOptions()]);

  return (
    <>
      <PageHeader title="Equipe" subtitle={day === today ? "Hoje" : formatBr(day)}>
        <form className="flex items-end gap-2">
          <div>
            <label className="label" htmlFor="eq-d">Dia</label>
            <input id="eq-d" type="date" name="dia" defaultValue={day} max={today} className="field" />
          </div>
          <button className="btn-ghost">Ver</button>
        </form>
      </PageHeader>
      <p className="mb-4 text-xs text-muted">“Tempo no sistema” é indicativo: boa parte do trabalho acontece fora do MCX (WhatsApp, planilhas, sistemas das indústrias). Não é horas trabalhadas.</p>

      <div className="space-y-5">
        {rows.map((p) => {
          const mine = open.filter((d) => d.assigneeId === p.id);
          return (
            <section key={p.id} className="card p-4" aria-labelledby={`eq-${p.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`eq-${p.id}`} className="text-lg font-bold text-brand-900">{p.name}</h2>
                <p className="text-sm">
                  <Link href={`/meu-dia?pessoa=${p.id}&dia=${day}`} className="font-semibold text-brand-600 underline-offset-2 hover:underline">Ver o dia</Link>
                  {" · "}
                  <Link href={`/?pessoa=${p.id}`} className="font-semibold text-brand-600 underline-offset-2 hover:underline">Ver a fila</Link>
                </p>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <div><dt className="text-xs text-muted">Tempo apontado</dt><dd className="font-bold tabular-nums">{formatMinutes(p.loggedMinutes)}</dd></div>
                <div><dt className="text-xs text-muted">Tempo no sistema</dt><dd className="font-bold tabular-nums">{formatMinutes(p.systemMinutes)} <span className="font-normal text-muted">({hour(p.firstAt)}–{hour(p.lastAt)})</span></dd></div>
                <div><dt className="text-xs text-muted">Concluídas no dia</dt><dd className="font-bold tabular-nums">{p.completed}</dd></div>
                <div><dt className="text-xs text-muted">Carga aberta</dt><dd className="font-bold tabular-nums">{p.open}{p.overdue > 0 && <span className="font-semibold text-bad"> · {p.overdue} atrasada(s)</span>}</dd></div>
                <div><dt className="text-xs text-muted">Horas estimadas abertas</dt><dd className="font-bold tabular-nums">{p.estimateMinutes ? formatMinutes(p.estimateMinutes) : "—"}</dd></div>
              </dl>
              {mine.length > 0 && (
                <ul className="mt-4 divide-y divide-line text-sm">
                  {mine.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/demandas/${d.id}`} className="min-w-0 flex-1 text-ink-2 underline-offset-2 hover:underline">
                        {d.title} <span className="text-muted">· {d.clientName} · </span>
                        <span className={isOverdue(d, today) ? "font-semibold text-bad" : "text-muted"}>{formatRelative(d.dueDate, today)}</span>
                      </Link>
                      <Reassign id={d.id} title={d.title} assigneeId={p.id} people={people} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <p className="mt-5 text-sm text-muted">Para adicionar uma demanda à fila de alguém, use o botão “+ Demanda” e escolha a pessoa como responsável.</p>
    </>
  );
}
