import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ClipboardList, FileDown, ShieldAlert, Store } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { brandExecution } from "@/server/brand-execution";
import { parseFilters, withParams } from "@/lib/filters";
import { fmtDate, fmtTime } from "@/lib/dates";
import { pct } from "@/lib/rules";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE, ISSUE_KIND_LABEL } from "@/lib/domain";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { DailyBars } from "../_components/daily-bars";
import { KpiCard, SectionCard, Table, Td, Th } from "../_components/widgets";

export const metadata: Metadata = { title: "Atendimentos por marca" };

const LIMIT = 200;

export default async function BrandExecutionPage({ searchParams }: PageProps<"/painel/marcas">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const options = await filterOptions(scope);
  const brand = options.brands.find((b) => b.id === f.brand) ?? options.brands[0];
  if (!brand) {
    return (
      <>
        <PageHeader title="Atendimentos por marca" subtitle="Execução de cada marca no período" />
        <EmptyState title="Nenhuma marca disponível no seu acesso" />
      </>
    );
  }
  const r = await brandExecution(scope, { ...f, brand: brand.id });
  const qs = withParams({ brand: brand.id, from: f.from, to: f.to, chain: f.chain, city: f.city, promoter: f.promoter });

  return (
    <>
      <PageHeader
        eyebrow="Atendimentos por marca"
        title={brand.name}
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · previsto pela programação × realizado em loja`}
        actions={
          <>
            <LinkButton variant="secondary" href={`/api/reports/brand${withParams({ brand: brand.id, from: f.from, to: f.to, format: "pdf" })}`} prefetch={false}>
              <FileDown className="size-4" /> PDF
            </LinkButton>
            <LinkButton variant="secondary" href={`/api/reports/brand${withParams({ brand: brand.id, from: f.from, to: f.to, format: "xlsx" })}`} prefetch={false}>
              <FileDown className="size-4" /> Excel
            </LinkButton>
          </>
        }
      />
      <FilterBar fields={["period", "brand", "chain", "city", "promoter"]} options={options} range={{ from: f.from, to: f.to }} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard label="Atendimentos previstos" value={r.planned} sub="Marca prevista na programação" icon={<ClipboardList className="size-4" />} />
        <KpiCard
          label="Atendimentos concluídos"
          value={r.completed}
          tone="success"
          sub={`${pct(r.completed, r.planned) ?? "—"}% do previsto · ${r.attendances.length} registrado(s)`}
          icon={<CheckCircle2 className="size-4" />}
        />
        <KpiCard label="Lojas atendidas" value={r.storesServed} sub="Com atendimento concluído" icon={<Store className="size-4" />} />
        <KpiCard
          label="Pendências"
          value={r.issues.length}
          tone={r.issues.length ? "warning" : "success"}
          sub="Desta marca no período"
          href={`/painel/pendencias${qs}`}
          icon={<ShieldAlert className="size-4" />}
        />
      </div>

      <SectionCard title="Evolução" subtitle="Atendimentos concluídos por dia" className="mt-6" bodyClass="px-5 pb-5">
        <DailyBars data={r.daily} from={f.from} to={f.to} label="Atendimentos concluídos" />
      </SectionCard>

      {r.issues.length ? (
        <SectionCard
          title="Pendências da marca"
          className="mt-6"
          action={
            <Link href={`/painel/pendencias${qs}`} className="text-[13px] font-semibold text-brand-700 inline-flex items-center gap-1">
              Central de pendências <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          <ul className="divide-y divide-line border-t border-line">
            {r.issues.slice(0, 5).map((i) => (
              <li key={i.key}>
                <Link href={i.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-subtle">
                  <Badge tone={i.priority <= 2 ? "danger" : "warning"}>{ISSUE_KIND_LABEL[i.kind]}</Badge>
                  <span className="text-[13px] truncate">
                    {i.storeName} · {i.promoterName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard title="Atendimentos" subtitle="Abra o atendimento para ver fotos, estoque e rupturas" className="mt-6" bodyClass="pb-1">
        {r.attendances.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Loja</Th>
                <Th>Promotor</Th>
                <Th>Horário</Th>
                <Th>Situação</Th>
                <Th align="right">Fotos</Th>
                <Th align="right">Rupturas</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {r.attendances.slice(0, LIMIT).map((a) => (
                <tr key={a.id} className="hover:bg-subtle">
                  <Td className="tnum whitespace-nowrap">{fmtDate(a.date)}</Td>
                  <Td>
                    <span className="font-semibold">{a.storeName}</span>
                    <span className="block text-[11.5px] text-muted">{a.city}</span>
                  </Td>
                  <Td>{a.promoterName}</Td>
                  <Td className="tnum whitespace-nowrap">
                    {fmtTime(a.startedAt)}
                    {a.finishedAt ? ` – ${fmtTime(a.finishedAt)}` : ""}
                  </Td>
                  <Td>
                    <StatusBadge tone={ATTENDANCE_STATUS_TONE[a.status]} size="sm">
                      {ATTENDANCE_STATUS_LABEL[a.status]}
                    </StatusBadge>
                    {a.exceptionItems.length ? <span className="block text-[11px] text-warn mt-0.5">com exceção</span> : null}
                  </Td>
                  <Td align="right">{a.photos}</Td>
                  <Td align="right" className={a.ruptures ? "text-bad font-semibold" : ""}>
                    {a.ruptures || "—"}
                  </Td>
                  <Td align="right">
                    <Link href={`/painel/atendimentos/${a.id}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700 hover:underline">
                      Abrir <ArrowRight className="size-3.5" />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Nenhum atendimento desta marca no período" />
        )}
        {r.attendances.length > LIMIT ? <p className="px-5 py-3 text-[12.5px] text-muted">Mostrando os {LIMIT} mais recentes de {r.attendances.length}. Use o Excel para a lista completa.</p> : null}
      </SectionCard>
    </>
  );
}
