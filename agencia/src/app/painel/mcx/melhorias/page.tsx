import type { Metadata } from "next";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { requirePlatform } from "@/server/auth";
import { listImprovements } from "@/server/improvements";
import { fmtAgo } from "@/lib/dates";
import { ESFORCO_LABEL, FAZ_SENTIDO_LABEL, IMPACTO_LABEL, IMPROVEMENT_STATUS_LABEL, IMPROVEMENT_STATUS_TONE, type ImprovementStatus } from "@/lib/improvements";
import { EmptyState, PageHeader, StatusBadge, buttonClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";

export const metadata: Metadata = { title: "Sugestões de melhorias" };

const FILTERS: (ImprovementStatus | null)[] = [null, "new", "reviewing", "approved", "declined", "done"];

/** Todas as sugestões de melhoria, de todas as agências, com a análise do Claude. */
export default async function McxImprovementsPage({ searchParams }: PageProps<"/painel/mcx/melhorias">) {
  const user = await requirePlatform();
  const sp = await searchParams;
  const status = FILTERS.find((f) => f && f === sp.status) ?? null;
  const rows = await listImprovements(user, status);

  return (
    <>
      <PageHeader
        eyebrow="MCX · plataforma"
        title="Sugestões de melhorias"
        subtitle="Sugestões enviadas por promotores, agências e equipe MCX. Cada uma chega com a análise do Claude; a decisão é da MCX."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link key={f ?? "all"} href={f ? `/painel/mcx/melhorias?status=${f}` : "/painel/mcx/melhorias"} className={buttonClass(f === status ? "primary" : "secondary", "sm")}>
            {f ? IMPROVEMENT_STATUS_LABEL[f] : "Todas"}
          </Link>
        ))}
      </div>
      <SectionCard title={`${rows.length} sugestão(ões)`} bodyClass="pb-1">
        {!rows.length ? (
          <EmptyState icon={<Lightbulb className="size-8" />} title="Nenhuma sugestão aqui">
            Todos os usuários podem sugerir pelo item “Sugerir melhoria” no menu (no app do promotor, em Perfil).
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sugestão</Th>
                <Th>Quem pediu</Th>
                <Th>Análise</Th>
                <Th>Situação</Th>
                <Th>Recebida</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ request: r, agencyName }) => (
                <tr key={r.id}>
                  <Td>
                    <Link href={`/painel/mcx/melhorias/${r.id}`} className="font-semibold text-ink hover:underline">
                      {r.title}
                    </Link>
                  </Td>
                  <Td className="text-[12.5px]">
                    {r.userName}
                    <span className="block text-muted">
                      {r.userRole} · {agencyName}
                    </span>
                  </Td>
                  <Td className="text-[12.5px]">
                    {r.analysis ? (
                      <>
                        <span className="font-semibold">{FAZ_SENTIDO_LABEL[r.analysis.fazSentido]}</span>
                        <span className="block text-muted">
                          {IMPACTO_LABEL[r.analysis.impacto]} · {ESFORCO_LABEL[r.analysis.esforco]}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">{r.analysisStatus === "pending" ? "Analisando…" : "Sem análise"}</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge tone={IMPROVEMENT_STATUS_TONE[r.status]} size="sm">
                      {IMPROVEMENT_STATUS_LABEL[r.status]}
                    </StatusBadge>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px] text-muted">{fmtAgo(r.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </SectionCard>
    </>
  );
}
