import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { photoReport } from "@/server/analytics";
import { parseFilters, withParams } from "@/lib/filters";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE } from "@/lib/domain";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { Pagination } from "../_components/widgets";
import { BeforeAfter, type ViewerPhoto } from "../_components/photo-viewer";

export const metadata: Metadata = { title: "Relatório fotográfico" };
const PAGE = 24;

export default async function PhotosPage({ searchParams }: PageProps<"/painel/fotos">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams, 7);
  const [rep, options] = await Promise.all([photoReport(scope, f, PAGE), filterOptions(scope)]);
  const keep = { from: f.from, to: f.to, brand: f.brand, chain: f.chain, store: f.store, promoter: f.promoter, status: f.status, kind: f.kind };
  const v = (p: (typeof rep.rows)[number]["photos"][number], label: string): ViewerPhoto => ({ id: p.id, kind: p.kind, label, takenAt: fmtDateTime(p.takenAt), uploaded: Boolean(p.uploadedAt), source: p.source });

  return (
    <>
      <PageHeader title="Relatório fotográfico" subtitle={`${fmtDate(f.from)} a ${fmtDate(f.to)} · antes e depois de cada atendimento · ${rep.total} atendimento(s)`} />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "brand", "chain", "store", "promoter", "status", "kind"]}
        options={{
          ...options,
          statuses: [
            { id: "incomplete", name: "Fotos incompletas" },
            { id: "completed", name: ATTENDANCE_STATUS_LABEL.completed },
            { id: "correction_requested", name: ATTENDANCE_STATUS_LABEL.correction_requested },
            { id: "cancelled", name: ATTENDANCE_STATUS_LABEL.cancelled },
          ],
          kinds: [
            { id: "before", name: "Com foto do antes" },
            { id: "after", name: "Com foto do depois" },
            { id: "rupture", name: "Com evidência de ruptura" },
            { id: "occurrence", name: "Com foto de ocorrência" },
          ],
        }}
        statusLabel="Todos os atendimentos"
        kindLabel="Todos os tipos de foto"
      />
      {rep.rows.length ? (
        <>
          <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-5">
            {rep.rows.map((r) => {
              const label = `${r.brandName} · ${r.storeName}`;
              const extra = r.photos.filter((p) => p.kind !== "before" && p.kind !== "after").length;
              return (
                <article key={r.id} className="bg-surface border border-line rounded-[var(--radius-card)] p-4">
                  <header className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[14.5px] truncate">{r.brandName}</p>
                      <p className="text-[12.5px] text-muted truncate">
                        {r.storeName} · {r.promoterName} · {fmtDate(r.date)}
                      </p>
                    </div>
                    <StatusBadge tone={ATTENDANCE_STATUS_TONE[r.status]} size="sm">
                      {ATTENDANCE_STATUS_LABEL[r.status]}
                    </StatusBadge>
                  </header>
                  <BeforeAfter compact before={r.photos.filter((p) => p.kind === "before").map((p) => v(p, `Antes · ${label}`))} after={r.photos.filter((p) => p.kind === "after").map((p) => v(p, `Depois · ${label}`))} />
                  <div className="flex items-center justify-between mt-3 text-[12.5px]">
                    <span className="text-muted">{extra ? `+${extra} foto(s) de ruptura/ocorrência` : ""}</span>
                    <Link href={`/painel/atendimentos/${r.id}`} className="font-semibold text-brand-700 inline-flex items-center gap-1">
                      Atendimento completo <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="mt-4 bg-surface border border-line rounded-[var(--radius-card)]">
            <Pagination page={f.page} total={rep.total} pageSize={PAGE} hrefFor={(p) => withParams(keep, { page: p })} />
          </div>
        </>
      ) : (
        <div className="bg-surface border border-line rounded-[var(--radius-card)]">
          <EmptyState title="Nenhum atendimento com fotos neste filtro" />
        </div>
      )}
    </>
  );
}
