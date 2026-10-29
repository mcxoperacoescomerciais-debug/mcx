import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CalendarDays, FileSpreadsheet, FileText, Store, Tags } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { addDays, todayIso } from "@/lib/dates";
import { PageHeader, buttonClass, inputClass, selectClass } from "@/components/ui";
import { RouteForm } from "../_components/route-form";

export const metadata: Metadata = { title: "Relatórios e exportação" };

export default async function ReportsPage() {
  const scope = await getScope();
  const o = await filterOptions(scope);
  const today = todayIso();
  const monthAgo = addDays(today, -29);
  const weekAgo = addDays(today, -6);
  const brandSelect = (required = false) => (
    <Labeled label="Marca">
      <select name="brand" required={required} className={selectClass} defaultValue="">
        <option value="">{required ? "Escolha a marca" : "Todas as marcas"}</option>
        {o.brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </Labeled>
  );
  const period = (from: string) => (
    <>
      <Labeled label="De">
        <input type="date" name="from" defaultValue={from} max={today} className={inputClass} required />
      </Labeled>
      <Labeled label="Até">
        <input type="date" name="to" defaultValue={today} max={today} className={inputClass} required />
      </Labeled>
    </>
  );

  return (
    <>
      <PageHeader
        title="Relatórios e exportação"
        subtitle="Gerados na hora a partir dos registros armazenados, respeitando suas permissões. Toda exportação fica registrada na auditoria."
        noExport
      />
      <div className="grid lg:grid-cols-2 gap-6">
        <ReportCard icon={<CalendarDays className="size-5" />} title="Relatório diário da operação" text="Lojas programadas, visitas realizadas, atendimentos por marca, promotores, pendências, rupturas, estoque zero e ocorrências do dia.">
          <form action="/api/reports/daily" method="get" className="grid sm:grid-cols-2 gap-3">
            <Labeled label="Data">
              <input type="date" name="date" defaultValue={today} max={today} className={inputClass} required />
            </Labeled>
            {brandSelect()}
            <Labeled label="Promotor">
              <select name="promoter" className={selectClass} defaultValue="">
                <option value="">Todos</option>
                {o.promoters.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Rede">
              <select name="chain" className={selectClass} defaultValue="">
                <option value="">Todas</option>
                {o.chains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Labeled>
            <Buttons />
          </form>
        </ReportCard>

        <ReportCard icon={<Tags className="size-5" />} title="Relatório por marca" text="Uma marca em um período, com dados agrupados por loja e por produto (último levantamento de estoque em cada loja) e todas as rupturas.">
          <form action="/api/reports/brand" method="get" className="grid sm:grid-cols-2 gap-3">
            {brandSelect(true)}
            <span className="hidden sm:block" />
            {period(monthAgo)}
            <Buttons />
          </form>
        </ReportCard>

        <ReportCard icon={<Store className="size-5" />} title="Relatório por loja" text="Todas as marcas atendidas na loja, cada uma com seus horários, fotos do antes e depois, estoque, rupturas e pendências — sem misturar marcas.">
          <RouteForm kind="store" className="grid sm:grid-cols-2 gap-3">
            <Labeled label="Loja">
              <select name="id" required className={selectClass} defaultValue="">
                <option value="">Escolha a loja</option>
                {o.stores.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} — {st.city}
                  </option>
                ))}
              </select>
            </Labeled>
            {brandSelect()}
            {period(weekAgo)}
            <div className="sm:col-span-2 pt-1">
              <button type="submit" className={buttonClass("primary")}>
                <FileText className="size-4" /> Gerar PDF da loja
              </button>
            </div>
          </RouteForm>
        </ReportCard>

        <ReportCard icon={<FileText className="size-5" />} title="Relatório de atendimento (PDF)" text="Gerado a partir da página de cada atendimento ou visita: botão “PDF do atendimento” / “PDF da visita”. Inclui identificação da agência, horários, fotos do antes e depois, estoque, rupturas, observações, pendências e exceções.">
          <p className="text-[13px] text-muted">Abra pelo Painel do dia, Lojas, Promotores ou Relatório fotográfico.</p>
        </ReportCard>

        <ReportCard className="lg:col-span-2" icon={<FileSpreadsheet className="size-5" />} title="Exportação de dados (Excel / CSV)" text="Dados tabulares conforme os filtros e as suas permissões. CSV usa “;” como separador (padrão do Excel em português).">
          <RouteForm kind="export" className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <Labeled label="Conjunto de dados">
              <select name="dataset" className={selectClass} defaultValue="attendances" required>
                <option value="attendances">Atendimentos por marca</option>
                <option value="stock">Estoque informado</option>
                <option value="ruptures">Rupturas</option>
              </select>
            </Labeled>
            {brandSelect()}
            {period(weekAgo)}
            <Labeled label="Formato">
              <select name="format" className={selectClass} defaultValue="xlsx">
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV</option>
              </select>
            </Labeled>
            <button type="submit" className={buttonClass("primary", "md", "w-full")}>
              <FileSpreadsheet className="size-4" /> Exportar
            </button>
          </RouteForm>
        </ReportCard>
      </div>
    </>
  );
}

function ReportCard({ icon, title, text, children, className }: { icon: ReactNode; title: string; text: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-surface border border-line rounded-[var(--radius-card)] p-5 ${className ?? ""}`}>
      <div className="flex gap-3 mb-4">
        <span className="size-10 rounded-xl bg-brand-50 text-brand-800 grid place-items-center shrink-0">{icon}</span>
        <div>
          <h2 className="font-semibold text-[15px]">{title}</h2>
          <p className="text-[13px] text-muted mt-0.5">{text}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Buttons() {
  return (
    <div className="sm:col-span-2 flex gap-2 pt-1">
      <button type="submit" name="format" value="pdf" className={buttonClass("primary")}>
        <FileText className="size-4" /> Gerar PDF
      </button>
      <button type="submit" name="format" value="xlsx" className={buttonClass("secondary")}>
        <FileSpreadsheet className="size-4" /> Gerar Excel
      </button>
    </div>
  );
}

