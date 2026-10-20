import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canManageTastings, getTaster } from "@/server/tastings";
import { isUuid } from "@/lib/filters";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { brl, CONTACT_STATUS_LABEL, TASTING_STATUS_LABEL, TASTING_STATUS_TONE } from "@/lib/tasting";
import { Badge, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../../_components/widgets";
import { DegTabs } from "../../_components/deg-tabs";
import { TasterForm } from "../../_components/taster-form";

export const metadata: Metadata = { title: "Degustadora" };

export default async function TasterPage({ params }: PageProps<"/painel/degustacoes/degustadoras/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  if (scope.role === "promoter") notFound();
  const d = await getTaster(scope, id);
  if (!d) notFound();
  const t = d.taster;
  const done = d.history.filter((h) => h.status === "completed");
  return (
    <>
      <DegTabs />
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t.name}
            {t.sample ? <Badge>Exemplo</Badge> : null}
          </span>
        }
        subtitle={`${t.city}/${t.state} · ${done.length} degustação(ões) realizada(s)`}
      />
      <div className="grid xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-6">
          <SectionCard title="Eventos" subtitle="Todas as degustações em que ela foi a degustadora selecionada" bodyClass="pb-1">
            {d.history.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Marca · loja</Th>
                    <Th>Situação</Th>
                    <Th align="right">Remuneração</Th>
                    <Th>Pagamento</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.history.map((h) => (
                    <tr key={h.id} className="hover:bg-subtle">
                      <Td className="tnum">
                        <Link href={`/painel/degustacoes/${h.id}`} className="font-semibold hover:underline">
                          {fmtDate(h.date)}
                        </Link>
                      </Td>
                      <Td>
                        {h.brandName}
                        <span className="block text-[11.5px] text-muted">
                          {h.storeName} · {h.city}
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge tone={TASTING_STATUS_TONE[h.status]} size="sm">
                          {TASTING_STATUS_LABEL[h.status]}
                        </StatusBadge>
                      </Td>
                      <Td align="right" className="tnum">{brl(h.feeActual ?? h.fee)}</Td>
                      <Td className="text-[13px]">{h.status === "completed" ? (h.paid === "paid" ? "Pago" : <span className="text-warn font-semibold">Pendente</span>) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState title="Nenhum evento ainda" />
            )}
          </SectionCard>
          {d.contacts.length ? (
            <SectionCard title="Contatos" subtitle="Convites e respostas (inclui as recusas)" bodyClass="pb-2">
              <ul className="divide-y divide-line border-t border-line">
                {d.contacts.map((c) => (
                  <li key={c.id} className="px-5 py-2 text-[13px]">
                    <span className="tnum text-muted">{fmtDateTime(c.at)}</span> · <strong>{CONTACT_STATUS_LABEL[c.status]}</strong> ·{" "}
                    <Link href={`/painel/degustacoes/${c.tastingId}`} className="hover:underline">
                      {c.storeName} ({fmtDate(c.date)})
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
        <div className="xl:col-span-2">
          <SectionCard title="Cadastro" bodyClass="px-5 pb-5">
            {canManageTastings(scope) ? (
              <TasterForm v={{ ...t, status: t.status }} />
            ) : (
              <p className="text-[13.5px] text-ink-2">
                {t.phone ? `+${t.phone}` : "Sem WhatsApp"} · {t.region ?? "—"} · {t.availability ?? "—"}
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
