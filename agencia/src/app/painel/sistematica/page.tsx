import type { Metadata } from "next";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { systematicList } from "@/server/monthly-report";
import { parseFilters } from "@/lib/filters";
import { fmtDate, todayIso } from "@/lib/dates";
import { EmptyState, PageHeader, inputClass } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { SectionCard, Table, Td, Th } from "../_components/widgets";
import { ActionForm } from "../_components/action-form";
import { saveMonthlyParamsAction } from "./actions";
import { MonthlyReportForm } from "./monthly-form";

export const metadata: Metadata = { title: "Sistemática" };

const DAYS = ["Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Sistemática: quem atende cada loja × marca, em que dias e quantas visitas no
 * mês (vem das atribuições no cadastro do promotor), e o relatório mensal de
 * atendimentos por marca no formato que a Etros entrega às indústrias.
 */
export default async function SystematicPage({ searchParams }: PageProps<"/painel/sistematica">) {
  const scope = await getScope();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayIso().slice(0, 7);
  const [rows, options] = await Promise.all([systematicList(scope, f, month), filterOptions(scope)]);
  const value = scope.settings.visitValue;
  const assigned = rows.filter((r) => r.promoter !== "OPEN");
  const visits = assigned.reduce((n, r) => n + (r.monthly ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Sistemática"
        subtitle={`Quem atende cada loja e marca, em que dias e quantas visitas no mês · ${assigned.length} atendimento(s) com promotor · ${rows.length - assigned.length} sem promotor (OPEN) · ${visits} visita(s) no mês`}
      />

      <SectionCard
        title="Relatório mensal de atendimentos"
        subtitle="Planilha no formato entregue à indústria (uma marca, várias ou todas — nenhuma marcada = todas): uma aba por semana (visitas previstas, realizadas e feriados por PDV), acumulado do mês com % e valor, sistemática e resumo por estabelecimento."
        bodyClass="px-5 pb-5"
        className="mb-6"
      >
        <MonthlyReportForm brands={options.brands} chains={options.chains} promoters={options.promoters} month={month} brand={typeof f.brand === "string" ? f.brand : ""} />
        <p className="mt-3 text-[12px] text-muted">
          Valor por visita válida: <strong>{value === null ? "não informado (valores saem zerados)" : brl(value)}</strong> · Feriados cadastrados: <strong>{scope.settings.holidays.length}</strong>
          {scope.role === "admin" ? " — ajuste em “Parâmetros do relatório” no fim da página." : "."}
        </p>
      </SectionCard>

      <FilterBar fields={["brand", "chain", "promoter", "city"]} options={options} />

      {rows.length ? (
        <SectionCard title={`Sistemática · ${month.slice(5, 7)}/${month.slice(0, 4)}`} subtitle="Dias fixos e visitas vêm das atribuições no cadastro do promotor (quadro da semana). OPEN = loja com a marca e sem promotor atribuído." bodyClass="pb-2">
          <Table>
            <thead>
              <tr>
                <Th>Promotor</Th>
                <Th>Indústria</Th>
                <Th>Rede</Th>
                <Th>Loja</Th>
                <Th>Estado</Th>
                <Th>Cidade</Th>
                <Th>Setor</Th>
                {DAYS.map((d) => (
                  <Th key={d} align="center">
                    {d}
                  </Th>
                ))}
                <Th align="right">Visitas semanais</Th>
                <Th align="right">Visitas mensais</Th>
                <Th align="right">VF por visita</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.promoter === "OPEN" ? "bg-warn-bg/40" : undefined}>
                  <Td className={r.promoter === "OPEN" ? "font-semibold text-warn" : "font-semibold"}>{r.promoter}</Td>
                  <Td>{r.brand}</Td>
                  <Td>{r.chain}</Td>
                  <Td>{r.pdv}</Td>
                  <Td>{r.state}</Td>
                  <Td>{r.city}</Td>
                  <Td className="text-[12px]">{r.sector}</Td>
                  {r.days.map((on, d) => (
                    <Td key={d} align="center" className="font-bold">
                      {on ? "X" : ""}
                    </Td>
                  ))}
                  <Td align="right">{r.weekly ?? (r.noFixedDay ? "—" : "")}</Td>
                  <Td align="right">{r.monthly ?? ""}</Td>
                  <Td align="right">{value === null ? "" : brl(value)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      ) : (
        <div className="bg-surface border border-line rounded-[var(--radius-card)]">
          <EmptyState title="Nenhuma loja × marca neste filtro">As atribuições são feitas no cadastro de cada promotor (quadro da semana).</EmptyState>
        </div>
      )}

      {scope.role === "admin" ? (
        <SectionCard title="Parâmetros do relatório" subtitle="Usados no relatório mensal e na coluna VF por visita." bodyClass="px-5 pb-5" className="mt-6">
          <ActionForm action={saveMonthlyParamsAction} hidden={{}} submitLabel="Salvar parâmetros" resetOnSuccess={false}>
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <label className="text-[12.5px] font-semibold text-ink-2">
                Valor por visita válida (R$)
                <input name="visitValue" defaultValue={value === null ? "" : String(value).replace(".", ",")} placeholder="ex.: 28,00" className={inputClass + " mt-1"} />
              </label>
              <label className="text-[12.5px] font-semibold text-ink-2">
                Feriados (dd/mm/aaaa, um por linha) — visita prevista não feita em feriado conta como válida
                <textarea name="holidays" rows={4} defaultValue={scope.settings.holidays.map((d) => fmtDate(d)).join("\n")} placeholder={"12/10/2026\n02/11/2026"} className={inputClass + " mt-1 h-auto py-2"} />
              </label>
            </div>
          </ActionForm>
        </SectionCard>
      ) : null}
    </>
  );
}
