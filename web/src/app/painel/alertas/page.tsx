import type { Metadata } from "next";
import Link from "next/link";
import { getScope } from "@/server/auth";
import { getClientSettings } from "@/server/settings";
import { currentAlerts, filterOptions, type CurrentAlert } from "@/server/analytics";
import { parseFilters } from "@/lib/filters";
import { Badge, Card, EmptyState, PageHeader, SeverityBadge } from "@/components/ui";
import { DAMAGE_KIND_LABEL, LOCATION_LABEL, OCCURRENCE_STATUS_LABEL, RUPTURE_KIND_LABEL, type DamageKind, type RuptureKind } from "@/lib/domain";
import { describeDays, formatIsoBr } from "@/lib/validity";
import { FilterBar } from "../_components/filter-bar";
import { OpenOccurrence, STATUS_TONE } from "../_components/occurrence-drawer";

export const metadata: Metadata = { title: "Alertas" };

interface Group {
  id: string;
  title: string;
  hint: string;
  tone: string;
  rows: CurrentAlert[];
  kind: "validity" | "rupture" | "damage";
}

function AlertTable({ group }: { group: Group }) {
  if (!group.rows.length) return <p className="px-5 pb-5 text-[13px] text-muted">Nenhum item nesta faixa.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-y border-line bg-navy-50/50">
            <th className="font-semibold px-5 py-2">Produto</th>
            <th className="font-semibold px-3 py-2">Loja</th>
            {group.kind === "validity" ? (
              <>
                <th className="font-semibold px-3 py-2 text-right">Qtd</th>
                <th className="font-semibold px-3 py-2">Validade</th>
                <th className="font-semibold px-3 py-2">Hoje</th>
                <th className="font-semibold px-3 py-2">Local</th>
              </>
            ) : (
              <>
                <th className="font-semibold px-3 py-2">{group.kind === "rupture" ? "Situação" : "Tipo"}</th>
                <th className="font-semibold px-3 py-2 text-right">Qtd</th>
              </>
            )}
            <th className="font-semibold px-3 py-2">Visita</th>
            <th className="font-semibold px-5 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 hover:bg-navy-50/40">
              <td className="px-5 py-2.5">
                <OpenOccurrence id={r.id} className="font-semibold text-ink hover:underline">
                  {r.productName}
                </OpenOccurrence>
              </td>
              <td className="px-3">
                <Link href={`/painel/lojas/${r.storeId}`} className="hover:underline">
                  {r.storeName}
                  {r.storeCode ? ` · ${r.storeCode}` : ""}
                </Link>
                <div className="text-[12px] text-muted">{r.city}</div>
              </td>
              {group.kind === "validity" ? (
                <>
                  <td className="px-3 text-right tnum">
                    {r.quantity} {r.unit}
                  </td>
                  <td className="px-3 tnum">{formatIsoBr(r.expiryDate)}</td>
                  <td className="px-3">{r.severityNow ? <SeverityBadge severity={r.severityNow} size="sm" /> : null} <span className="text-[12px] text-muted ml-1">{r.daysNow !== null ? describeDays(r.daysNow) : ""}</span></td>
                  <td className="px-3 text-[12.5px]">{LOCATION_LABEL[r.location as keyof typeof LOCATION_LABEL]}</td>
                </>
              ) : (
                <>
                  <td className="px-3">{group.kind === "rupture" ? RUPTURE_KIND_LABEL[r.ruptureKind as RuptureKind] : DAMAGE_KIND_LABEL[r.damageKind as DamageKind]}</td>
                  <td className="px-3 text-right tnum">{r.quantity ?? "—"}</td>
                </>
              )}
              <td className="px-3 tnum text-[12.5px]">
                <Link href={`/painel/visitas/${r.visitId}`} className="hover:underline">
                  {formatIsoBr(r.visitDate)}
                </Link>
                <div className="text-muted">{r.promoterName}</div>
              </td>
              <td className="px-5">
                <Badge tone={STATUS_TONE[r.status]}>{OCCURRENCE_STATUS_LABEL[r.status]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AlertsPage({ searchParams }: PageProps<"/painel/alertas">) {
  const scope = await getScope();
  const settings = await getClientSettings(scope.clientId);
  const filters = parseFilters(await searchParams);
  const [alerts, options] = await Promise.all([currentAlerts(scope, filters, settings), filterOptions(scope)]);
  const b = settings.bands;
  const validity = alerts.filter((a) => a.type === "validity");
  const groups: Group[] = [
    { id: "vencidos", title: "Vencidos", hint: "Validade já passou", tone: "#B42318", kind: "validity", rows: validity.filter((a) => a.severityNow === "expired") },
    { id: "criticos", title: "Críticos", hint: `Vencem em até ${b.critical} dias`, tone: "#E5484D", kind: "validity", rows: validity.filter((a) => a.severityNow === "critical") },
    { id: "urgentes", title: "Urgentes", hint: `${b.critical + 1} a ${b.high} dias`, tone: "#F07C1B", kind: "validity", rows: validity.filter((a) => a.severityNow === "high") },
    { id: "atencao", title: "Atenção", hint: `${b.high + 1} a ${b.attention} dias`, tone: "#E3B008", kind: "validity", rows: validity.filter((a) => a.severityNow === "attention") },
    { id: "rupturas", title: "Rupturas", hint: "Produtos do mix em falta", tone: "#eb6834", kind: "rupture", rows: alerts.filter((a) => a.type === "rupture") },
    { id: "avarias", title: "Avarias", hint: "Produtos danificados", tone: "#1baf7a", kind: "damage", rows: alerts.filter((a) => a.type === "damage") },
  ];

  return (
    <>
      <PageHeader
        title="Alertas"
        subtitle="Situação atual: o que a última visita de cada loja encontrou e ainda não foi tratado. Dias contados a partir de hoje."
      />
      <FilterBar filters={filters} options={options} showPeriod={false} fields={["network", "store", "city", "promoter", "product", "category"]} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {groups.map((g) => (
          <a key={g.id} href={`#${g.id}`} className="block">
            <Card className="p-4 hover:border-line-strong">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: g.tone }} />
                <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{g.title}</span>
              </div>
              <p className="text-[28px] font-semibold tnum mt-1 leading-none">{g.rows.length}</p>
              <p className="text-[12px] text-muted mt-1.5">{g.hint}</p>
            </Card>
          </a>
        ))}
      </div>

      {alerts.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum alerta em aberto">As últimas visitas não registraram itens pendentes de tratamento.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.id} id={g.id} className="scroll-mt-6">
              <div className="flex items-center gap-2 px-5 pt-4 pb-3">
                <span className="size-2.5 rounded-full" style={{ background: g.tone }} />
                <h2 className="text-[15px] font-semibold">{g.title}</h2>
                <span className="text-[13px] text-muted">· {g.rows.length} · {g.hint}</span>
              </div>
              <AlertTable group={g} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
