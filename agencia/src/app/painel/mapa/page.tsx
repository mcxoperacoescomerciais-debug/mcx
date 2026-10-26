import type { Metadata } from "next";
import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { mapData, suggestedStoreLocations } from "@/server/map";
import { matchText, parseDayRange } from "@/lib/filters";
import { fmtDate, fmtLongDate, fmtTime, todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { SectionCard, Table, Td, Th } from "../_components/widgets";
import { ActionForm } from "../_components/action-form";
import { MAP_STATUS_LABEL, OperationsMap } from "./operations-map";
import { LiveMap } from "./live-map";
import { applyVisitLocationAction } from "./actions";
import type { MapStatus } from "@/server/map";

export const metadata: Metadata = { title: "Mapa operacional" };

export default async function MapPage({ searchParams }: PageProps<"/painel/mapa">) {
  const scope = await getScope();
  const sp = await searchParams;
  const f = parseDayRange(sp);
  const [{ stores: all, generatedAt }, options] = await Promise.all([mapData(scope, f), filterOptions(scope)]);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const stores = q ? all.filter((st) => matchText(q, st.name, st.chain, st.city, ...st.stops.flatMap((x) => [x.promoterName, ...x.brands.map((b) => b.name)]))) : all;
  const located = stores.filter((st) => st.lat != null);
  const missing = stores.filter((st) => st.lat == null);
  const suggestions = scope.role === "admin" ? await suggestedStoreLocations(scope, missing.map((m) => m.id)) : new Map();

  return (
    <>
      <PageHeader
        title="Mapa operacional"
        subtitle={
          <span className="first-letter:uppercase inline-block">
            {f.from === f.to ? fmtLongDate(f.from) : `${fmtDate(f.from)} a ${fmtDate(f.to)} (pior situação de cada loja no período)`} · {located.length} loja(s) no mapa{missing.length ? ` · ${missing.length} sem localização` : ""} · dados de {fmtTime(generatedAt)}
          </span>
        }
      />
      <FilterBar
        range={{ from: f.from, to: f.to }}
        fields={["period", "city", "chain", "brand", "promoter", "status", "q"]}
        qPlaceholder="Loja, cidade, promotor ou marca"
        options={{ ...options, statuses: (Object.keys(MAP_STATUS_LABEL) as MapStatus[]).map((id) => ({ id, name: MAP_STATUS_LABEL[id] })) }}
        statusLabel="Todas as situações"
      />
      {/* Hoje: acompanhamento ao vivo (promotores agora + avisos). Outros dias: só a situação das lojas. */}
      {f.from === todayIso() && f.to === todayIso() ? <LiveMap stores={located} /> : <OperationsMap stores={located} />}

      {missing.length ? (
        <SectionCard
          title="Lojas sem localização no mapa"
          subtitle="Sem coordenadas válidas no cadastro — não são posicionadas por aproximação. Informe a localização em Cadastros › Redes e lojas."
          className="mt-6"
          bodyClass="pb-1"
        >
          <Table>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th>Cidade</Th>
                <Th>Situação no dia</Th>
                <Th>Localização registrada em visita</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {missing.map((st) => {
                const sug = suggestions.get(st.id);
                return (
                  <tr key={st.id}>
                    <Td>
                      <span className="font-semibold">{st.name}</span>
                      {st.chain ? <span className="block text-[11.5px] text-muted">{st.chain}</span> : null}
                    </Td>
                    <Td>{st.city}</Td>
                    <Td>{MAP_STATUS_LABEL[st.status]}</Td>
                    <Td className="text-muted text-[12.5px]">
                      {sug ? `${sug.lat.toFixed(5)}, ${sug.lng.toFixed(5)} · visita de ${fmtDate(sug.date)}${sug.accuracyM ? ` · precisão ${Math.round(sug.accuracyM)} m` : ""}` : "—"}
                    </Td>
                    <Td align="right">
                      {scope.role === "admin" ? (
                        sug ? (
                          <ActionForm action={applyVisitLocationAction} hidden={{ storeId: st.id }} submitLabel="Usar esta localização" variant="secondary" />
                        ) : (
                          <Link href={`/painel/cadastros/lojas/${st.id}`} className="text-[13px] font-semibold text-brand-700 hover:underline">
                            Informar no cadastro
                          </Link>
                        )
                      ) : (
                        <MapPinOff className="size-4 text-muted inline" aria-label="Sem localização" />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </SectionCard>
      ) : null}
    </>
  );
}
