import type { Metadata } from "next";
import { isUuid } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, FileDown, MapPin } from "lucide-react";
import { getScope } from "@/server/auth";
import { getVisitDetail } from "@/server/details";
import { ATTENDANCE_STATUS_LABEL, ATTENDANCE_STATUS_TONE, EXCEPTION_ITEM_LABEL, VISIT_ORIGIN_LABEL, VISIT_STATUS_LABEL, VISIT_STATUS_TONE, withPlacement } from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtDuration, fmtTime } from "@/lib/dates";
import { LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";
import { BeforeAfter, type ViewerPhoto } from "../../_components/photo-viewer";

export const metadata: Metadata = { title: "Visita" };

export default async function VisitPage({ params }: PageProps<"/painel/visitas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  const d = await getVisitDetail(scope, id);
  if (!d) notFound();
  const v = d.visit;
  const brandIds = [...new Set([...d.planned.map((b) => b.id), ...d.attendances.map((x) => x.a.brandId)])];
  const viewer = (p: (typeof d.photos)[number], label: string): ViewerPhoto => ({ id: p.id, kind: p.kind, label: withPlacement(label, p.placement), takenAt: fmtDateTime(p.takenAt), uploaded: Boolean(p.uploadedAt), source: p.source });

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/painel/promotores/${d.promoterId}?date=${v.visitDate}`} target="_blank" className="hover:underline">
            {d.promoterName} · {fmtDate(v.visitDate)}
          </Link>
        }
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {d.store.name}
            <StatusBadge tone={VISIT_STATUS_TONE[v.status]}>{VISIT_STATUS_LABEL[v.status]}</StatusBadge>
            {v.origin === "extra" ? <StatusBadge tone="muted" icon={false}>{VISIT_ORIGIN_LABEL.extra}</StatusBadge> : null}
          </span>
        }
        subtitle={[d.chainName, d.store.address, d.store.city].filter(Boolean).join(" · ")}
        actions={
          <LinkButton variant="secondary" href={`/api/reports/visit/${v.id}`} prefetch={false}>
            <FileDown className="size-4" /> PDF da visita (todas as marcas)
          </LinkButton>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Previsto" value={d.schedule?.plannedStart ?? "Sem horário"} />
        <Stat label="Início da visita" value={fmtTime(v.startedAt)} />
        <Stat label="Encerramento da visita" value={v.finishedAt ? fmtTime(v.finishedAt) : "Em aberto"} />
        <Stat label="Tempo em loja" value={v.finishedAt ? fmtDuration(v.startedAt, v.finishedAt) : "—"} />
        <Stat
          label="Localização"
          value={
            v.geoStatus === "captured" && v.lat !== null ? (
              <a className="text-brand-700 inline-flex items-center gap-1" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lng}#map=17/${v.lat}/${v.lng}`}>
                <MapPin className="size-4" /> Ver no mapa
              </a>
            ) : v.geoStatus === "denied" ? (
              "Não autorizada"
            ) : (
              "Não registrada"
            )
          }
        />
      </div>

      {v.status === "closed_incomplete" ? (
        <div className="flex gap-3 rounded-xl px-4 py-3 text-[13.5px] bg-warn-bg text-warn mb-6">
          <AlertTriangle className="size-5 shrink-0" />
          <div>
            <strong>Encerrada com marca pendente.</strong> Justificativa do promotor: “{v.closeReason}”
          </div>
        </div>
      ) : null}
      {v.origin === "extra" && v.extraReason ? <p className="text-[13.5px] text-ink-2 mb-6">Motivo da visita extraordinária: “{v.extraReason}”</p> : null}

      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted mb-3">Atendimentos por marca ({brandIds.length})</h2>
      <div className="grid lg:grid-cols-2 gap-5">
        {brandIds.map((bid) => {
          const att = d.attendances.find((x) => x.a.brandId === bid);
          const name = att?.brandName ?? d.planned.find((b) => b.id === bid)?.name ?? "Marca";
          if (!att) {
            return (
              <SectionCard key={bid} title={name} action={<StatusBadge tone="neutral">Pendente</StatusBadge>} bodyClass="px-5 pb-5">
                <p className="text-[13.5px] text-muted">Marca prevista sem atendimento iniciado.</p>
              </SectionCard>
            );
          }
          const a = att.a;
          const photos = d.photos.filter((p) => p.attendanceId === a.id);
          const stock = d.stockCounts.filter((x) => x.attendanceId === a.id);
          const ruptures = d.ruptures.filter((x) => x.attendanceId === a.id).length;
          return (
            <SectionCard
              key={bid}
              title={name}
              subtitle={`${fmtTime(a.startedAt)}–${a.finishedAt ? fmtTime(a.finishedAt) : "…"}${a.finishedAt ? ` · ${fmtDuration(a.startedAt, a.finishedAt)}` : ""}${d.planned.some((p) => p.id === bid) ? "" : " · fora da programação"}`}
              action={<StatusBadge tone={ATTENDANCE_STATUS_TONE[a.status]}>{ATTENDANCE_STATUS_LABEL[a.status]}</StatusBadge>}
              bodyClass="px-5 pb-5 space-y-4"
            >
              <BeforeAfter compact before={photos.filter((p) => p.kind === "before").map((p) => viewer(p, `Antes · ${name}`))} after={photos.filter((p) => p.kind === "after").map((p) => viewer(p, `Depois · ${name}`))} />
              <dl className="grid grid-cols-4 gap-2 text-center">
                <Mini label="Estoque informado" value={stock.length} />
                <Mini label="Estoque zero" value={stock.filter((x) => x.state === "zero").length} tone={stock.some((x) => x.state === "zero") ? "bad" : undefined} />
                <Mini label="Não encontrado" value={stock.filter((x) => x.state === "not_found").length} />
                <Mini label="Rupturas" value={ruptures} tone={ruptures ? "bad" : undefined} />
              </dl>
              {a.exceptionItems.length ? <p className="text-[12.5px] text-warn font-medium">Exceção: {a.exceptionItems.map((i) => EXCEPTION_ITEM_LABEL[i]).join(", ")} — “{a.exceptionNote}”</p> : null}
              {a.status === "cancelled" ? <p className="text-[12.5px] text-warn font-medium">Cancelado: “{a.cancelReason}”</p> : null}
              <Link href={`/painel/atendimentos/${a.id}`} target="_blank" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                Abrir atendimento completo <ArrowRight className="size-3.5" />
              </Link>
            </SectionCard>
          );
        })}
      </div>
      {v.notes ? (
        <SectionCard className="mt-6" title="Observações da visita" bodyClass="px-5 pb-5">
          <p className="text-[14px]">“{v.notes}”</p>
        </SectionCard>
      ) : null}
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface border border-line rounded-[var(--radius-card)] px-4 py-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="text-[16px] font-semibold tnum mt-0.5">{value}</p>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className={`rounded-lg py-2 ${tone === "bad" ? "bg-bad-bg text-bad" : "bg-subtle"}`}>
      <dd className="text-[17px] font-semibold tnum leading-none">{value}</dd>
      <dt className="text-[11px] mt-1 leading-tight">{label}</dt>
    </div>
  );
}
