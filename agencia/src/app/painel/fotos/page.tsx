import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { photoReport } from "@/server/analytics";
import { BOOK_MAX_ATTENDANCES } from "@/server/pdf/book-pdf";
import { parseFilters, withParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { Pagination } from "../_components/widgets";
import { Gallery, type ViewerPhoto } from "../_components/photo-viewer";

export const metadata: Metadata = { title: "Relatório fotográfico" };
const PAGE = 24;

/**
 * Relatório fotográfico: só as fotos de antes e depois, conforme o filtro. Daqui
 * sai o BOOK DE ATENDIMENTO (PDF para o cliente) com os mesmos filtros.
 */
export default async function PhotosPage({ searchParams }: PageProps<"/painel/fotos">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const kind = f.kind === "before" || f.kind === "after" ? f.kind : null;
  const [rep, options] = await Promise.all([photoReport(scope, { ...f, status: null, kind }, PAGE), filterOptions(scope)]);
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, kind };
  const photos: ViewerPhoto[] = rep.rows.flatMap((r) =>
    r.photos
      .filter((p) => (kind ? p.kind === kind : p.kind === "before" || p.kind === "after"))
      .map((p) => {
        const when = p.kind === "before" ? "Antes" : "Depois";
        return {
          id: p.id,
          kind: p.kind,
          label: `${when} · ${r.brandName} · ${r.storeName}`,
          takenAt: fmtDateTime(p.takenAt),
          uploaded: Boolean(p.uploadedAt),
          source: p.source,
          caption: `${when} · ${r.storeName} · ${r.brandName} · ${fmtDate(r.date)}`,
        };
      }),
  );

  return (
    <>
      <PageHeader
        title="Relatório fotográfico"
        subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · ${photos.length} foto(s) nesta página · ${rep.total} atendimento(s)`}
        actions={
          <LinkButton href={`/api/reports/book${withParams({ from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter })}`} prefetch={false} target="_blank">
            <BookOpen className="size-4" /> Gerar Book de Atendimento
          </LinkButton>
        }
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "kind"]}
        options={{
          ...options,
          kinds: [
            { id: "before", name: "Só fotos do antes" },
            { id: "after", name: "Só fotos do depois" },
          ],
        }}
        kindLabel="Antes e depois"
      />
      {photos.length ? (
        <>
          <Gallery photos={photos} wall />
          <div className="mt-4 bg-surface border border-line rounded-[var(--radius-card)]">
            <Pagination page={f.page} total={rep.total} pageSize={PAGE} hrefFor={(p) => withParams(keep, { page: p })} />
          </div>
        </>
      ) : (
        <div className="bg-surface border border-line rounded-[var(--radius-card)]">
          <EmptyState title="Nenhuma foto neste filtro" />
        </div>
      )}
      <p className="text-[12px] text-muted mt-4">
        O Book de Atendimento usa os mesmos filtros (período, marca, rede, loja, promotor) e reúne até {BOOK_MAX_ATTENDANCES} atendimentos com fotos de antes e depois.
      </p>
    </>
  );
}
