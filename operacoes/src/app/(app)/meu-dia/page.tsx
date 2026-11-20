import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { formatBr, formatMinutes, isIsoDate, todayIso } from "@/lib/dates";
import { TIMEZONE } from "@/lib/domain";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { formOptions } from "@/server/demands";
import { dayOf } from "@/server/time";

export const metadata = { title: "Meu dia" };

const hour = (d: Date | null) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(d) : "—");

export default async function MyDayPage({ searchParams }: { searchParams: Promise<{ dia?: string; pessoa?: string }> }) {
  const user = await requireUser();
  const p = await searchParams;
  const today = todayIso();
  const day = isIsoDate(p.dia) && p.dia <= today ? p.dia : today;
  const manager = can(user.role, "time.viewAll");
  const { people } = await formOptions();
  // Só o gestor abre o dia de outra pessoa — e vê exatamente o que a própria pessoa vê.
  const target = manager && p.pessoa && people.some((x) => x.id === p.pessoa) ? p.pessoa : user.id;
  const d = await dayOf(user, target, day);
  const name = people.find((x) => x.id === target)?.name ?? "";
  if (!d) return null;

  return (
    <>
      <PageHeader title={target === user.id ? "Meu dia" : `Dia de ${name}`} subtitle={day === today ? "Hoje" : formatBr(day)}>
        <form className="flex flex-wrap items-end gap-2">
          {manager && (
            <div>
              <label className="label" htmlFor="md-p">Pessoa</label>
              <select id="md-p" name="pessoa" defaultValue={target} className="field">
                {people.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="md-d">Dia</label>
            <input id="md-d" type="date" name="dia" defaultValue={day} max={today} className="field" />
          </div>
          <button className="btn-ghost">Ver</button>
        </form>
      </PageHeader>

      <p className="mb-5 rounded-lg bg-info-bg px-4 py-3 text-sm text-info">
        O que é medido: o tempo que você aponta nas demandas e o “tempo no sistema” (minutos com esta aba aberta e em uso). Nada do que você digita, nenhuma tela e nada fora do MCX é registrado — e o tempo no sistema não serve para pagamento, desconto ou advertência.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{formatMinutes(d.loggedMinutes)}</p>
          <p className="mt-1 text-sm text-ink-2">Tempo apontado em demandas</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{formatMinutes(d.systemMinutes)}</p>
          <p className="mt-1 text-sm text-ink-2">Tempo no sistema</p>
          <p className="text-xs text-muted">Primeiro sinal {hour(d.firstAt)} · último {hour(d.lastAt)}</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{d.completed}</p>
          <p className="mt-1 text-sm text-ink-2">Demandas concluídas</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{d.created} · {d.moved}</p>
          <p className="mt-1 text-sm text-ink-2">Criadas · movidas</p>
        </div>
      </div>

      <section className="card mt-5 p-4" aria-labelledby="md-tempo">
        <h2 id="md-tempo" className="mb-3 text-sm font-bold text-ink-2">Tempo apontado</h2>
        {d.entries.length === 0 ? (
          <p className="text-sm text-muted">Nenhum tempo apontado neste dia.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {d.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/demandas/${e.demandId}`} className="min-w-0 text-ink-2 underline-offset-2 hover:underline">
                  {e.title} <span className="text-muted">· {e.clientName}</span>
                </Link>
                <strong className="shrink-0 tabular-nums">{formatMinutes(e.minutes)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
