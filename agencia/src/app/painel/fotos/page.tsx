import type { Metadata } from "next";
import { BookOpen, Presentation } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { photoReport } from "@/server/analytics";
import { BOOK_MAX_ATTENDANCES } from "@/server/pdf/book-pdf";
import { parseFilters, withParams } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { withPlacement } from "@/lib/domain";
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
  const [rep, options] = await Promise.all([photoReport(scope, { ...f, status: null, kind }, f.pageSize > PAGE ? f.pageSize : PAGE), filterOptions(scope)]);
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, kind, q: f.q || null };
  const photos: ViewerPhoto[] = rep.rows.flatMap((r) =>
    r.photos
      .filter((p) => (kind ? p.kind === kind : p.kind === "before" || p.kind === "after"))
      .map((p) => {
        const when = withPlacement(p.kind === "before" ? "Antes" : "Depois", p.placement);
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
          <>
            <LinkButton href={`/api/reports/book${withParams({ from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter })}`} prefetch={false} target="_blank">
              <BookOpen className="size-4" /> Book em PDF
            </LinkButton>
            <LinkButton variant="secondary" href={`/api/reports/book${withParams({ from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, format: "pptx" })}`} prefetch={false}>
              <Presentation className="size-4" /> Book em PowerPoint
            </LinkButton>
          </>
        }
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "kind", "q"]}
        qPlaceholder="Loja, marca, promotor ou cidade"
        options={{
          ...options,
          kinds: [
            { id: "before", name: "Só fotos do antes" },
            { id: "after", name: "Só fotos do depois" },
          ],
        }}
        kindLabel="Antes e depois"
      />
      {/* Exportar Excel: um registro por atendimento fotografado (a galeria não é tabela). */}
      <table hidden data-export-title="Atendimentos fotografados">
        <thead>
          <tr>
            <th>Data</th>
            <th>Loja</th>
            <th>Rede</th>
            <th>Marca</th>
            <th>Promotor</th>
            <th>Fotos do antes</th>
            <th>Fotos do depois</th>
            <th>Fotos não enviadas</th>
          </tr>
        </thead>
        <tbody>
          {rep.rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.date)}</td>
              <td>{r.storeName}</td>
              <td>{r.chainName ?? ""}</td>
              <td>{r.brandName}</td>
              <td>{r.promoterName}</td>
              <td>{r.photos.filter((p) => p.kind === "before").length}</td>
              <td>{r.photos.filter((p) => p.kind === "after").length}</td>
              <td>{r.photos.filter((p) => !p.uploadedAt).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
