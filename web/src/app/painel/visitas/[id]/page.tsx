import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { getScope } from "@/server/auth";
import { getClientSettings } from "@/server/settings";
import { getVisitDetail, groupOccurrences, type VisitOccurrence } from "@/server/visits";
import { Badge, buttonClass, Card, PageHeader, SeverityBadge } from "@/components/ui";
import { DAMAGE_KIND_LABEL, OCCURRENCE_STATUS_LABEL, RUPTURE_KIND_LABEL } from "@/lib/domain";
import { describeDays, formatIsoBr } from "@/lib/validity";
import { OpenOccurrence, STATUS_TONE } from "../../_components/occurrence-drawer";
import { SectionCard } from "../../_components/widgets";

export const metadata: Metadata = { title: "Visita" };

const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function Rows({ rows, kind }: { rows: VisitOccurrence[]; kind: "validity" | "rupture" | "damage" }) {
  if (!rows.length) return <p className="px-5 pb-5 text-[13px] text-muted">Nenhuma ocorrência registrada.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
            <th className="font-semibold px-5 py-2">Produto</th>
            {kind === "validity" ? (
              <>
                <th className="font-semibold px-3 py-2 text-right">Qtd</th>
                <th className="font-semibold px-3 py-2">Validade</th>
                <th className="font-semibold px-3 py-2">Dias</th>
                <th className="font-semibold px-3 py-2 text-right">Preço</th>
                <th className="font-semibold px-3 py-2">Classificação</th>
              </>
            ) : (
              <>
                <th className="font-semibold px-3 py-2">{kind === "rupture" ? "Situação" : "Tipo"}</th>
                <th className="font-semibold px-3 py-2 text-right">Qtd</th>
                <th className="font-semibold px-3 py-2">Observação</th>
              </>
            )}
            <th className="font-semibold px-3 py-2">Fotos</th>
            <th className="font-semibold px-5 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
              <td className="px-5 py-2.5">
                <OpenOccurrence id={o.id} className="font-semibold hover:underline">
                  {o.productName}
                </OpenOccurrence>
                {o.lot ? <div className="text-[12px] text-muted">Lote {o.lot}</div> : null}
              </td>
              {kind === "validity" ? (
                <>
                  <td className="px-3 text-right tnum">
                    {o.quantity} {o.unit}
                  </td>
                  <td className="px-3 tnum">{formatIsoBr(o.expiryDate)}</td>
                  <td className="px-3">{o.daysToExpiry !== null ? describeDays(o.daysToExpiry) : "—"}</td>
                  <td className="px-3 text-right tnum">{o.price ? `R$ ${Number(o.price).toFixed(2).replace(".", ",")}` : "—"}</td>
                  <td className="px-3">{o.severity ? <SeverityBadge severity={o.severity} size="sm" /> : null}</td>
                </>
              ) : (
                <>
                  <td className="px-3">{kind === "rupture" ? (o.ruptureKind ? RUPTURE_KIND_LABEL[o.ruptureKind] : "—") : o.damageKind ? DAMAGE_KIND_LABEL[o.damageKind] : "—"}</td>
                  <td className="px-3 text-right tnum">{o.quantity ?? "—"}</td>
                  <td className="px-3 text-[12.5px] text-ink-2">{o.notes ?? "—"}</td>
                </>
              )}
              <td className="px-3">
                <div className="flex gap-1">
                  {o.photos.slice(0, 3).map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.id} src={`/api/photos/${p.id}`} alt="" className="size-9 rounded-md object-cover border border-line" />
                  ))}
                </div>
              </td>
              <td className="px-5">
                <Badge tone={STATUS_TONE[o.status]}>{OCCURRENCE_STATUS_LABEL[o.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function VisitPage({ params }: PageProps<"/painel/visitas/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const visit = await getVisitDetail(scope, id);
  if (!visit) notFound();
  const settings = await getClientSettings(scope.clientId);
  const g = groupOccurrences(visit.occurrences);

  return (
    <>
      <PageHeader
        title={`Visita · ${visit.store.name}${visit.store.code ? ` ${visit.store.code}` : ""}`}
        subtitle={`${formatIsoBr(visit.visitDate)} · ${timeFmt.format(visit.startedAt)}${visit.finishedAt ? `–${timeFmt.format(visit.finishedAt)}` : ""} · ${visit.promoter.name} · ${visit.store.city}`}
        actions={
          <>
            <Link href={`/painel/lojas/${visit.store.id}`} className={buttonClass("ghost")}>
              Ver loja
            </Link>
            <a href={`/api/visits/${visit.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
              <FileText className="size-4" /> Ver PDF
            </a>
            <a href={`/api/visits/${visit.id}/pdf`} className={buttonClass("primary")}>
              <Download className="size-4" /> Baixar PDF
            </a>
          </>
        }
      />
      <Card className="p-4 mb-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        <span>
          Status: <b>{visit.status === "finished" ? "Finalizada" : "Em andamento"}</b>
        </span>
        <span>
          Checklist:{" "}
          {settings.checklist.map((c) => (
            <Badge key={c.key} tone={visit.checklist[c.key] ? "green" : "neutral"} className="mr-1">
              {c.label.replace(/^(Verifiquei|Conferi) (a |o |as |os )?/, "")}
            </Badge>
          ))}
        </span>
      </Card>
      <div className="space-y-4">
        <SectionCard title={`Área de vendas × validade · ${g.salesFloor.length}`}>
          <Rows rows={g.salesFloor} kind="validity" />
        </SectionCard>
        <SectionCard title={`Estoque × validade · ${g.stock.length}`}>
          <Rows rows={g.stock} kind="validity" />
        </SectionCard>
        <SectionCard title={`Rupturas · ${g.ruptures.length}`}>
          <Rows rows={g.ruptures} kind="rupture" />
        </SectionCard>
        <SectionCard title={`Avarias · ${g.damages.length}`}>
          <Rows rows={g.damages} kind="damage" />
        </SectionCard>
        <SectionCard title="Observações gerais">
          <p className="px-5 pb-5 text-[13.5px]">{visit.notes ?? <span className="text-muted">Sem observações.</span>}</p>
        </SectionCard>
      </div>
    </>
  );
}
