import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Target, TrendingUp, TriangleAlert, Users } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { portfolioPromoters, portfolioWeek } from "@/server/portfolio";
import { parseFilters, withParams } from "@/lib/filters";
import { addDays, fmtDate, todayIso } from "@/lib/dates";
import { pct } from "@/lib/rules";
import { WORK_MODE_LABEL } from "@/lib/domain";
import { TARGET_STATUS_LABEL, TARGET_STATUS_TONE, weekStart } from "@/lib/portfolio";
import { EmptyState, PageHeader, Progress, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { KpiCard, SectionCard, Table, Td, Th } from "../_components/widgets";
import { ActionForm } from "../_components/action-form";
import { deleteTargetAction, saveTargetAction } from "./actions";

export const metadata: Metadata = { title: "Carteira e metas" };

/**
 * Carteira com meta semanal: o promotor escolhe o dia; aqui se acompanha se a
 * semana vai fechar — meta × realizado × ritmo esperado até hoje.
 */
export default async function TargetsPage({ searchParams }: PageProps<"/painel/metas">) {
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const f = parseFilters(await searchParams);
  const [w, options, promoters] = await Promise.all([portfolioWeek(scope, f), filterOptions(scope), portfolioPromoters(scope)]);
  const canEdit = scope.brandIds === null;
  const keep = { promoter: f.promoter, brand: f.brand, store: f.store, city: f.city };
  const weekLink = (d: string) => withParams({ ...keep, date: weekStart(d) === weekStart(todayIso()) ? null : d });
  const t = w.totals;
  const behind = w.rows.filter((r) => r.status === "behind").length;

  return (
    <>
      <PageHeader
        title="Carteira e metas"
        subtitle={`Semana de ${fmtDate(w.from)} a ${fmtDate(w.to)} · visitas por semana em cada marca de cada loja — o promotor escolhe o dia`}
        actions={
          <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface">
            <Link href={weekLink(addDays(w.from, -7))} aria-label="Semana anterior" className="h-9 w-9 grid place-items-center text-ink-2 hover:bg-subtle rounded-l-lg">
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={weekLink(todayIso())} className="h-9 px-3 grid place-items-center text-[13px] font-semibold text-ink-2 hover:bg-subtle border-x border-line">
              Esta semana
            </Link>
            <Link href={weekLink(addDays(w.from, 7))} aria-label="Próxima semana" className="h-9 w-9 grid place-items-center text-ink-2 hover:bg-subtle rounded-r-lg">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />
      <FilterBar fields={["promoter", "brand", "store", "city"]} options={options} />

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
          sub={`${pct(t.counted, t.target) ?? "—"}% das visitas da semana`}
          icon={<Target className="size-4" />}
        />
        <KpiCard
          label="Ritmo"
          value={t.counted >= t.expected ? "No ritmo" : `−${t.expected - t.counted}`}
          tone={t.counted >= t.expected ? "success" : "danger"}
          sub={`Esperado até ${fmtDate(w.ref).slice(0, 5)}: ${t.expected} · feito: ${t.counted}`}
          icon={<TrendingUp className="size-4" />}
        />
        <KpiCard label="Lojas × marcas atrasadas" value={behind} tone={behind ? "danger" : "success"} sub={`de ${w.rows.length} combinação(ões) com meta`} icon={<TriangleAlert className="size-4" />} />
        <KpiCard label="Promotores com carteira" value={w.promoters.length} sub={`${w.promoters.filter((p) => p.totals.counted >= p.totals.target).length} já fecharam a semana`} icon={<Users className="size-4" />} />
      </div>

      <div className="grid xl:grid-cols-3 gap-6 mt-6">
        <div className="xl:col-span-2 space-y-5">
          {w.promoters.length === 0 ? (
            <div className="bg-surface border border-line rounded-[var(--radius-card)]">
              <EmptyState title="Nenhuma meta cadastrada">Cadastre ao lado quantas visitas por semana cada marca precisa em cada loja.</EmptyState>
            </div>
          ) : null}
          {w.promoters.map((p) => (
            <SectionCard
              key={p.promoterId}
              title={p.promoterName}
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
                      <Td>{r.brandName}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        <span className="tnum font-semibold">
                          {r.done}/{r.perWeek}
                        </span>
                        <Progress value={Math.min(r.done, r.perWeek)} total={r.perWeek} className="w-20 ml-auto mt-1" tone={r.status === "done" ? "success" : r.status === "behind" ? "danger" : "info"} />
                      </Td>
                      <Td>
                        <StatusBadge tone={TARGET_STATUS_TONE[r.status]} size="sm">
                          {TARGET_STATUS_LABEL[r.status]}
                        </StatusBadge>
                      </Td>
                      <Td className="tnum text-[12.5px] text-muted">{r.lastVisit ? fmtDate(r.lastVisit) : "nunca"}</Td>
                      {canEdit ? (
                        <Td align="right">
                          <ActionForm action={deleteTargetAction} hidden={{ id: r.id }} submitLabel="Remover" variant="secondary" />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </SectionCard>
          ))}
        </div>

        {canEdit ? (
          <div className="space-y-5">
            <SectionCard title="Adicionar ou alterar meta" subtitle="Se já existir meta para o mesmo promotor, loja e marca, ela é atualizada." bodyClass="px-5 pb-5">
              <ActionForm action={saveTargetAction} hidden={{}} submitLabel="Salvar meta">
                <select name="promoterId" required className={selectClass} aria-label="Promotor" defaultValue={f.promoter ?? ""}>
                  <option value="" disabled>
                    Promotor
                  </option>
                  {promoters.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.mode === "route" ? " (trabalha por roteiro)" : ""}
                    </option>
                  ))}
                </select>
                <select name="storeId" required className={selectClass} aria-label="Loja" defaultValue={f.store ?? ""}>
                  <option value="" disabled>
                    Loja
                  </option>
                  {options.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select name="brandId" required className={selectClass} aria-label="Marca" defaultValue={f.brand ?? ""}>
                  <option value="" disabled>
                    Marca
                  </option>
                  {options.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <label className="block">
                  <span className="text-[13px] font-semibold text-ink-2">Visitas por semana</span>
                  <input name="perWeek" type="number" min={1} max={14} defaultValue={1} required className={inputClass + " mt-1"} />
                </label>
              </ActionForm>
              <p className="text-[12px] text-muted mt-3">
                O promotor passa a ver a meta no app na próxima vez que abrir com internet. Quem estiver em “{WORK_MODE_LABEL.route}” continua vendo o roteiro: mude a forma de trabalho no cadastro do usuário ou em Configurações.
              </p>
            </SectionCard>
            <SectionCard title="Muitas metas de uma vez" bodyClass="px-5 pb-5">
              <p className="text-[13px] text-ink-2">
                Use{" "}
                <Link href="/painel/cadastros/importar" className="font-semibold text-brand-700 hover:underline">
                  Importar planilha
                </Link>{" "}
                com o tipo <strong>Metas da carteira</strong>: colunas <code>promotor</code> (usuário), <code>loja</code> (código ou nome), <code>marca</code> (código ou nome) e <code>visitas_semana</code>.
              </p>
            </SectionCard>
          </div>
        ) : null}
      </div>
    </>
  );
}
