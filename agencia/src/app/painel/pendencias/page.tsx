import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { getScope } from "@/server/auth";
import { listIssues } from "@/server/issues";
import { filterOptions } from "@/server/operations";
import { parseFilters } from "@/lib/filters";
import { ISSUE_KIND_LABEL, ISSUE_KINDS, ISSUE_REVIEW_LABEL, type IssueKind } from "@/lib/domain";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, StatusBadge, inputClass } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { ActionForm, Disclosure } from "../_components/action-form";
import { reviewIssueAction } from "../actions";

export const metadata: Metadata = { title: "Central de pendências" };

export default async function IssuesPage({ searchParams }: PageProps<"/painel/pendencias">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 14);
  const view = f.status ?? "open";
  const [all, options] = await Promise.all([listIssues(scope, f, { includeConcluded: view === "concluded" || view === "all" }), filterOptions(scope)]);
  const issues = all
    .filter((i) => !f.kind || i.kind === f.kind)
    .filter((i) => (view === "open" ? !i.review : view === "analyzed" ? i.review?.status === "analyzed" : view === "concluded" ? i.review?.status === "concluded" : view === "pending" ? i.review?.status !== "concluded" : true));
  const counts = new Map<IssueKind, number>();
  for (const i of all) if (i.review?.status !== "concluded") counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Central de pendências"
        subtitle={`O que exige ação, ordenado pela prioridade definida em Configurações · ${fmtDate(f.from)} a ${fmtDate(f.to)}`}
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "promoter", "store", "status", "kind"]}
        options={{
          ...options,
          statuses: [
            { id: "open", name: "Não analisadas" },
            { id: "pending", name: "Abertas (todas)" },
            { id: "analyzed", name: "Analisadas" },
            { id: "concluded", name: "Concluídas" },
            { id: "all", name: "Todas" },
          ],
          kinds: ISSUE_KINDS.map((k) => ({ id: k, name: ISSUE_KIND_LABEL[k] })),
        }}
        statusLabel="Não analisadas"
      />

      <div className="flex flex-wrap gap-2 mb-5">
        {ISSUE_KINDS.filter((k) => counts.get(k)).map((k) => (
          <Link key={k} href={`?${new URLSearchParams({ from: f.from, to: f.to, kind: k, status: "pending" })}`} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] hover:border-brand-200">
            {ISSUE_KIND_LABEL[k]} <strong className="tnum">{counts.get(k)}</strong>
          </Link>
        ))}
      </div>

      {issues.length === 0 ? (
        <div className="bg-surface border border-line rounded-[var(--radius-card)]">
          <EmptyState icon={<CheckCircle2 className="size-9 text-ok" />} title="Nenhuma pendência neste filtro">
            Altere o período ou o filtro de status para ver pendências analisadas e concluídas.
          </EmptyState>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {issues.map((i) => (
            <li key={i.key} className="bg-surface border border-line rounded-[var(--radius-card)] p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Badge tone={i.priority <= 2 ? "danger" : i.priority <= 4 ? "warning" : "neutral"} className="mt-0.5">
                  P{i.priority} · {ISSUE_KIND_LABEL[i.kind]}
                </Badge>
                <div className="flex-1 min-w-[240px]">
                  <Link href={i.href} className="font-semibold text-[14.5px] hover:underline inline-flex items-center gap-1">
                    {i.title} <ArrowUpRight className="size-3.5 text-muted" />
                  </Link>
                  <p className="text-[13px] text-ink-2 mt-0.5">{i.detail}</p>
                  <p className="text-[12.5px] text-muted mt-1">
                    {i.storeName}
                    {i.brandName ? ` · ${i.brandName}` : ""} · {i.promoterName} · {fmtDate(i.date)}
                    {i.at ? ` ${fmtDateTime(i.at).slice(11)}` : ""}
                  </p>
                </div>
                <StatusBadge tone={i.review?.status === "concluded" ? "success" : i.review ? "info" : "neutral"} size="sm">
                  {ISSUE_REVIEW_LABEL[i.review?.status ?? "open"]}
                </StatusBadge>
              </div>
              {i.review ? (
                <p className="text-[12.5px] text-ink-2 mt-2 ml-1 border-l-2 border-brand-200 pl-3">
                  {i.review.userName} em {fmtDateTime(i.review.at)}: “{i.review.action}”
                </p>
              ) : null}
              {i.review?.status !== "concluded" ? (
                <div className="mt-3">
                  <Disclosure label={i.review ? "Atualizar acompanhamento" : "Analisar / registrar ação"}>
                    <ActionForm action={reviewIssueAction} hidden={{ key: i.key }} submitLabel="Salvar">
                      <div className="flex flex-wrap gap-2">
                        <select name="status" defaultValue="analyzed" className={inputClass + " w-auto"} aria-label="Situação">
                          <option value="analyzed">Analisada — continuo acompanhando</option>
                          <option value="concluded">Concluir acompanhamento</option>
                        </select>
                        <input name="action" required minLength={5} placeholder="Ação tomada (ex.: liguei para o promotor)" className={inputClass + " flex-1 min-w-[240px]"} />
                      </div>
                      <p className="text-[12px] text-muted">Analisar não resolve a pendência: ela some sozinha quando a causa for corrigida (foto enviada, correção feita…).</p>
                    </ActionForm>
                  </Disclosure>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
