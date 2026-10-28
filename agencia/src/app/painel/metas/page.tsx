import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Target, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { portfolioPromoters, portfolioWeek } from "@/server/portfolio";
import { matchText, parseFilters, withParams } from "@/lib/filters";
import { addDays, fmtDate, todayIso } from "@/lib/dates";
import { pct } from "@/lib/rules";
import { frequencyLabel, TARGET_STATUS_LABEL, TARGET_STATUS_TONE, weekdaysLabel, weekStart } from "@/lib/portfolio";
import { Badge, EmptyState, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { KpiCard, SectionCard, Table, Td, Th } from "../_components/widgets";
import { ActionForm } from "../_components/action-form";
import { deleteTargetAction } from "./actions";

export const metadata: Metadata = { title: "Carteira e metas" };

const MODE = { route: "Roteiro", portfolio: "Carteira" } as const;

/**
 * Carteira com meta semanal: o promotor escolhe o dia; aqui se acompanha se a
 * semana vai fechar — meta × realizado × ritmo esperado até hoje.
 */
export default async function TargetsPage({ searchParams }: PageProps<"/painel/metas">) {
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const sp = await searchParams;
  const f = parseFilters(sp);
  // Período escolhido na barra de filtros (de/até); sem ele, a semana.
  const custom = Boolean(sp.from || sp.to);
  const [w, options, promoters] = await Promise.all([portfolioWeek(scope, f, custom ? { from: f.from, to: f.to } : undefined), filterOptions(scope), portfolioPromoters(scope)]);
  const canEdit = scope.brandIds === null;
  const keep = { promoter: f.promoter, brand: f.brand, store: f.store, city: f.city, q: f.q || null };
  const weekLink = (d: string) => withParams({ ...keep, date: weekStart(d) === weekStart(todayIso()) ? null : d });
  const t = w.totals;
  const behind = w.rows.filter((r) => r.status === "behind").length;
  const modeOf = new Map(promoters.map((p) => [p.id, p.mode]));
  // Busca: o nome do promotor mostra a carteira inteira; senão, só as linhas da loja, marca ou cidade.
  const groups = f.q
    ? w.promoters.map((p) => (matchText(f.q, p.promoterName) ? p : { ...p, rows: p.rows.filter((r) => matchText(f.q, r.storeName, r.brandName, r.city)) })).filter((p) => p.rows.length)
    : w.promoters;
  const idle = f.q ? w.idle.filter((u) => matchText(f.q, u.name)) : w.idle;
  const byMode = { route: promoters.filter((p) => p.mode === "route").length, portfolio: promoters.filter((p) => p.mode === "portfolio").length };

  return (
    <>
      <PageHeader
        title="Carteira e metas"
        subtitle={`${custom ? "Período" : "Semana"} de ${fmtDate(w.from)} a ${fmtDate(w.to)} · resultado de todos os promotores — atribuições (com ou sem dia fixo) e lojas programadas${custom ? " · meta proporcional aos dias do período" : ""}`}
        actions={
          <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
            <Link href={weekLink(addDays(w.from, -7))} aria-label="Semana anterior" className="h-9 w-9 grid place-items-center text-ink-2 hover:bg-subtle rounded-l-lg">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={weekLink(todayIso())} className={`h-9 px-3 grid place-items-center text-[13px] font-semibold hover:bg-subtle border-x border-line ${custom ? "text-brand-700" : "text-ink-2"}`}>
              Esta semana
            </Link>
            <Link href={weekLink(addDays(w.from, 7))} aria-label="Próxima semana" className="h-9 w-9 grid place-items-center text-ink-2 hover:bg-subtle rounded-r-lg">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />
      <FilterBar fields={["period", "promoter", "brand", "store", "city", "q"]} range={{ from: w.from, to: w.to }} options={options} qPlaceholder="Promotor, loja, marca ou cidade" />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Meta cumprida"
          value={
            <>
              {t.counted}
              <span className="text-[16px] font-medium text-muted"> de {t.target}</span>
            </>
          }
          tone="success"
          sub={`${pct(t.counted, t.target) ?? "—"}% das visitas ${custom ? "do período" : "da semana"}`}
          icon={<Target className="size-4" />}
        />
        <KpiCard
          label="Ritmo"
          value={t.counted >= t.expected ? "No ritmo" : `−${t.expected - t.counted}`}
          tone={t.counted >= t.expected ? "success" : "danger"}
          sub={`Esperado até ${fmtDate(w.ref).slice(0, 5)}: ${t.expected} · feito: ${t.counted}`}
          icon={<TrendingUp className="size-4" />}
        />
        <KpiCard label="Lojas × marcas atrasadas" value={behind} tone={behind ? "danger" : "success"} sub={`de ${w.rows.length} combinação(ões) ${custom ? "no período" : "na semana"}`} icon={<TriangleAlert className="size-4" />} />
        <KpiCard label="Promotores cadastrados" value={w.registered} sub={`${byMode.route} por roteiro · ${byMode.portfolio} por carteira`} icon={<Users className="size-4" />} />
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mt-6">
        <div className="xl:col-span-2 space-y-5">
          {groups.length === 0 ? (
            <div className="bg-surface border border-line rounded-[var(--radius-card)]">
              <EmptyState title="Nada nesta semana">Nenhuma atribuição nem loja programada com estes filtros. As atribuições são feitas no cadastro de cada promotor.</EmptyState>
            </div>
          ) : null}
          {groups.map((p) => (
            <SectionCard
              key={p.promoterId}
              title={
                <span className="inline-flex items-center gap-2">
                  {p.promoterName}
                  {modeOf.get(p.promoterId) ? <Badge tone="neutral">{MODE[modeOf.get(p.promoterId)!]}</Badge> : null}
                </span>
              }
              subtitle={`${p.totals.counted} de ${p.totals.target} visitas · ${pct(p.totals.counted, p.totals.target) ?? 0}%${p.behind ? ` · ${p.behind} atrasada(s)` : ""}`}
              action={<Progress value={p.totals.counted} total={p.totals.target} className="w-32" tone={p.totals.counted >= p.totals.target ? "success" : p.totals.counted >= p.totals.expected ? "info" : "warning"} />}
              bodyClass="pb-1"
            >
              <Table>
                <thead>
                  <tr>
                    <Th>Loja</Th>
                    <Th>Marca</Th>
                    <Th align="right">Feitas / meta</Th>
                    <Th>Situação</Th>
                    <Th>Última visita</Th>
                    {canEdit ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {p.rows.map((r) => (
                    <tr key={r.id} className="hover:bg-subtle">
                      <Td>
                        <span className="font-semibold">{r.storeName}</span>
                        <span className="block text-[11.5px] text-muted">{r.city}</span>
                      </Td>
                      <Td>
                        {r.brandName}
                        <span className="block text-[11.5px] text-muted">
                          {r.source === "schedule" ? `${r.perWeek}x programada(s) ${custom ? "no período" : "na semana"}` : frequencyLabel(r.perWeek, r.period)} · {weekdaysLabel(r.weekdays)}
                          {r.source === "schedule" ? " · programação" : ""}
                        </span>
                      </Td>
                      <Td align="right" className="whitespace-nowrap">
                        <span className="tnum font-semibold">
                          {r.done}/{r.goal ?? r.perWeek}
                        </span>
                        <Progress value={Math.min(r.done, r.goal ?? r.perWeek)} total={r.goal ?? r.perWeek} className="w-20 ml-auto mt-1" tone={r.status === "done" ? "success" : r.status === "behind" ? "danger" : "info"} />
                      </Td>
                      <Td>
                        <StatusBadge tone={TARGET_STATUS_TONE[r.status]} size="sm">
                          {TARGET_STATUS_LABEL[r.status]}
                        </StatusBadge>
                      </Td>
                      <Td className="tnum text-[12.5px] text-muted">{r.lastVisit ? fmtDate(r.lastVisit) : "nunca"}</Td>
                      {canEdit ? (
                        <Td align="right">
                          {r.source === "assignment" ? <ActionForm action={deleteTargetAction} hidden={{ id: r.id }} submitLabel="Remover" variant="secondary" /> : null}
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </SectionCard>
          ))}
          {idle.length && !f.brand && !f.store && !f.city ? (
            <SectionCard title={`Sem atribuição nem loja programada nesta semana (${idle.length})`} subtitle="Faça as atribuições no cadastro de cada promotor" bodyClass="px-5 pb-4">
              <ul className="flex flex-wrap gap-2">
                {idle.map((u) => (
                  <li key={u.id}>
                    <Link href={`/painel/cadastros/usuarios/${u.id}`} target="_blank" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-line-strong text-[13px] font-medium hover:bg-subtle">
                      {u.name}
                      {modeOf.get(u.id) ? <span className="text-muted text-[11.5px]">· {MODE[modeOf.get(u.id)!]}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>

        {canEdit ? (
          <div className="space-y-5">
            <SectionCard title="Muitas metas de uma vez" bodyClass="px-5 pb-5">
              <p className="text-[13px] text-ink-2">
                Use{" "}
                <Link href="/painel/cadastros/importar" className="font-semibold text-brand-700 hover:underline">
                  Importar planilha
                </Link>{" "}
                com o tipo <strong>Atribuições</strong> (planilha padrão): colunas <code>promotor</code> (usuário), <code>loja</code> (código ou nome), <code>marca</code>, <code>vezes</code>, <code>periodo</code> (semana, quinzena ou mês) e <code>dias</code> (ex.: SEG/QUI; vazio = só a quantidade).
              </p>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </>
  );
}
