import type { Metadata } from "next";
import { isUuid } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { canSeeBrand, canSeePromoter } from "@/server/scope";
import { RUPTURE_FINAL_STATUSES, RUPTURE_SITUATION_LABEL, RUPTURE_STATUS_LABEL, RUPTURE_STATUS_TONE, RUPTURE_STATUSES, STOCK_STATE_LABEL } from "@/lib/domain";
import { fmtDate, fmtDateTime, todayIso } from "@/lib/dates";
import { PageHeader, StatusBadge, inputClass } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";
import { Gallery } from "../../_components/photo-viewer";
import { ActionForm } from "../../_components/action-form";
import { ruptureStatusAction } from "../../actions";

export const metadata: Metadata = { title: "Ruptura" };

export default async function RupturePage({ params }: PageProps<"/painel/rupturas/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  const db = await getDb();
  const [row] = await db
    .select({
      r: s.ruptures,
      product: s.products,
      brandName: s.brands.name,
      brandId: s.brands.id,
      storeName: s.stores.name,
      city: s.stores.city,
      promoterName: s.users.name,
      promoterId: s.users.id,
      visitDate: s.visits.visitDate,
      visitId: s.visits.id,
    })
    .from(s.ruptures)
    .innerJoin(s.products, eq(s.products.id, s.ruptures.productId))
    .innerJoin(s.attendances, eq(s.attendances.id, s.ruptures.attendanceId))
    .innerJoin(s.brands, eq(s.brands.id, s.attendances.brandId))
    .innerJoin(s.visits, eq(s.visits.id, s.attendances.visitId))
    .innerJoin(s.stores, eq(s.stores.id, s.visits.storeId))
    .innerJoin(s.users, eq(s.users.id, s.visits.promoterId))
    .where(and(eq(s.ruptures.id, id), eq(s.ruptures.agencyId, scope.agencyId), isNull(s.ruptures.deletedAt)));
  if (!row || !canSeeBrand(scope, row.brandId) || !canSeePromoter(scope, row.promoterId)) notFound();
  const r = row.r;
  const [events, photos, stock] = await Promise.all([
    db
      .select({ e: s.ruptureEvents, userName: s.users.name })
      .from(s.ruptureEvents)
      .innerJoin(s.users, eq(s.users.id, s.ruptureEvents.userId))
      .where(eq(s.ruptureEvents.ruptureId, id))
      .orderBy(asc(s.ruptureEvents.createdAt)),
    db.select().from(s.photos).where(and(eq(s.photos.ruptureId, id), isNull(s.photos.deletedAt))),
    db.select().from(s.stockEntries).where(and(eq(s.stockEntries.attendanceId, r.attendanceId), eq(s.stockEntries.productId, r.productId))),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/painel/rupturas" className="hover:underline">Rupturas</Link>}
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {row.product.name}
            <StatusBadge tone={RUPTURE_STATUS_TONE[r.status]}>{RUPTURE_STATUS_LABEL[r.status]}</StatusBadge>
          </span>
        }
        subtitle={`SKU ${row.product.sku} · ${row.brandName} · ${row.storeName} (${row.city}) · ${fmtDate(row.visitDate)}`}
      />
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Registro em campo" bodyClass="px-5 pb-5">
            <dl className="grid sm:grid-cols-3 gap-4 text-[13.5px]">
              <Info label="Situação encontrada" value={RUPTURE_SITUATION_LABEL[r.situation]} />
              <Info label="Estoque conhecido" value={r.knownStock !== null ? String(r.knownStock) : "Não informado"} />
              <Info label="Estoque no levantamento" value={stock[0] ? `${STOCK_STATE_LABEL[stock[0].state]}${stock[0].quantity ? ` (${stock[0].quantity})` : ""}` : "Sem registro"} />
              <Info label="Promotor" value={row.promoterName} />
              <Info label="Registrada em" value={fmtDateTime(r.recordedAt)} />
              <Info label="Origem" value={r.fromStockSuggestion ? "Confirmada a partir do estoque zero/não encontrado" : "Registro direto"} />
            </dl>
            {r.note ? <p className="mt-4 text-[13.5px]">Observação: “{r.note}”</p> : null}
            <div className="mt-4 flex gap-4 text-[13px] font-semibold">
              <Link href={`/painel/atendimentos/${r.attendanceId}`} className="text-brand-700 hover:underline">
                Abrir atendimento da marca
              </Link>
              <Link href={`/painel/visitas/${row.visitId}`} className="text-brand-700 hover:underline">
                Abrir visita
              </Link>
            </div>
          </SectionCard>
          <SectionCard title={`Evidências (${photos.length})`} bodyClass="px-5 pb-5">
            {photos.length ? (
              <Gallery photos={photos.map((p) => ({ id: p.id, kind: p.kind, label: `Ruptura · ${row.product.name}`, takenAt: fmtDateTime(p.takenAt), uploaded: Boolean(p.uploadedAt), source: p.source }))} />
            ) : (
              <p className="text-[13.5px] text-muted">Sem foto de evidência.</p>
            )}
          </SectionCard>
        </div>
        <div className="space-y-6">
          <SectionCard title="Tratamento" subtitle="Visualizar não resolve: registre a ação e o novo status" bodyClass="px-5 pb-5">
            <ActionForm action={ruptureStatusAction} hidden={{ id: r.id }} submitLabel="Atualizar ocorrência">
              <label className="block text-[13px] font-semibold text-ink-2">
                Novo status
                <select name="status" defaultValue={r.status} className={inputClass + " mt-1"}>
                  {RUPTURE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {RUPTURE_STATUS_LABEL[st]}
                      {RUPTURE_FINAL_STATUSES.includes(st) ? " (exige ação)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[13px] font-semibold text-ink-2">
                Ação tomada
                <textarea name="action" rows={3} placeholder="Ex.: comprador da loja fez pedido emergencial" className={inputClass + " h-auto py-2 mt-1"} />
              </label>
              <label className="block text-[13px] font-semibold text-ink-2">
                Data da resolução (se resolvida)
                <input type="date" name="resolvedAt" max={todayIso()} className={inputClass + " mt-1"} />
              </label>
            </ActionForm>
            {r.resolutionAction ? (
              <p className="mt-4 text-[13px] border-l-2 border-ok pl-3">
                {r.resolvedAt ? `Resolvida em ${fmtDate(r.resolvedAt.toISOString().slice(0, 10))}: ` : ""}“{r.resolutionAction}”
              </p>
            ) : null}
          </SectionCard>
          <SectionCard title="Histórico de status" bodyClass="px-5 pb-5">
            <ol className="relative border-l border-line ml-1.5 space-y-3">
              {events.map(({ e, userName }) => (
                <li key={e.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-brand-600" />
                  <p className="text-[13px] font-semibold">
                    {e.fromStatus ? `${RUPTURE_STATUS_LABEL[e.fromStatus]} → ` : ""}
                    {RUPTURE_STATUS_LABEL[e.toStatus]}
                  </p>
                  <p className="text-[12px] text-muted">
                    {fmtDateTime(e.createdAt)} · {userName}
                  </p>
                  {e.action ? <p className="text-[12.5px] text-ink-2">“{e.action}”</p> : null}
                </li>
              ))}
            </ol>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11.5px] text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
