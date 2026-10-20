import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canManageTastings, tastingFormOptions } from "@/server/tastings";
import { listBatches } from "@/server/tasting-import";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";
import { DegTabs } from "../_components/deg-tabs";
import { ScheduleImport } from "./schedule-import";

export const metadata: Metadata = { title: "Importar cronograma" };

export default async function ImportSchedulePage() {
  const scope = await getScope();
  if (!canManageTastings(scope)) notFound();
  const [opts, batches] = await Promise.all([tastingFormOptions(scope), listBatches(scope)]);
  return (
    <>
      <DegTabs />
      <PageHeader title="Importar cronograma da marca" subtitle="A planilha é lida, você confere e corrige cada linha, e só então as degustações são criadas. Nada incerto é salvo sem conferência." />
      <ScheduleImport brands={opts.brands.map((b) => ({ id: b.id, name: b.name }))} />
      <SectionCard title="Cronogramas recebidos" subtitle="Arquivos originais guardados para consulta" className="mt-6" bodyClass="pb-2">
        {batches.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {batches.map(({ b, brandName, fileName, fileId }) => (
              <li key={b.id} className="px-5 py-2.5 text-[13px] flex flex-wrap gap-x-2">
                <span className="tnum text-muted">{fmtDateTime(b.createdAt)}</span>
                <strong>{brandName ?? "—"}</strong>
                {fileId ? (
                  <a href={`/api/degustacoes/arquivos/${fileId}`} className="text-brand-700 font-semibold hover:underline">
                    {fileName}
                  </a>
                ) : null}
                <span className="text-muted">
                  · {b.rowsRead} linha(s) lida(s) · {b.rowsImported} importada(s)
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-3 text-[13px] text-muted">Nenhum cronograma importado ainda.</p>
        )}
      </SectionCard>
      <p className="text-[12px] text-muted mt-3">
        Cronograma em PDF ou Word: cadastre os eventos em “Nova degustação” e anexe o documento na degustação (tipo “Cronograma da marca”). Colunas reconhecidas na planilha: data, horário (ou início/fim), rede, loja, cidade, UF, produto, ação, materiais, valor, valor da degustadora, pedido, código e observações.
      </p>
    </>
  );
}
