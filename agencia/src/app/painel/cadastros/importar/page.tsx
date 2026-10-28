import type { Metadata } from "next";
import { requireRole } from "@/server/auth";
import { TEMPLATE_HELP, TEMPLATES, type ImportKind } from "@/server/import";
import { PageHeader } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function ImportPage() {
  await requireRole(["admin"]);
  return (
    <>
      <PageHeader noExport title="Importar planilha" subtitle="Cadastre ou atualize produtos, lojas e promotores em lote, com validação linha a linha e relatório de erros." />
      <div className="grid xl:grid-cols-3 gap-6">
        <SectionCard className="xl:col-span-2" title="Enviar arquivo" bodyClass="px-5 pb-5">
          <ImportForm />
        </SectionCard>
        <SectionCard title="Colunas esperadas" bodyClass="px-5 pb-5 space-y-4">
          {(Object.keys(TEMPLATES) as ImportKind[]).map((k) => (
            <div key={k}>
              <p className="font-semibold text-[13.5px] capitalize">{k}</p>
              <p className="text-[12.5px] font-mono text-ink-2 break-words">{TEMPLATES[k].join(" · ")}</p>
              <p className="text-[12.5px] text-muted mt-1">{TEMPLATE_HELP[k]}</p>
            </div>
          ))}
          <p className="text-[12px] text-muted">Cabeçalhos podem ter acento ou maiúsculas (“Código” = “codigo”). Primeira linha = cabeçalho.</p>
        </SectionCard>
      </div>
    </>
  );
}
