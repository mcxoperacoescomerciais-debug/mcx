import type { Metadata } from "next";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { geoPermissionList, liveMapStores } from "@/server/map";
import { matchText, parseFilters } from "@/lib/filters";
import { fmtAgo, fmtLongDate, fmtTime, todayIso } from "@/lib/dates";
import { PageHeader, StatusBadge } from "@/components/ui";
import { FilterBar } from "../_components/filter-bar";
import { SectionCard, Table, Td, Th } from "../_components/widgets";
import { LiveMap } from "./live-map";

export const metadata: Metadata = { title: "Mapa operacional" };

const PERMISSION_LABEL = { denied: "Bloqueou a localização", prompt: "Ainda não respondeu ao pedido", unsupported: "Celular sem localização", unknown: "Nunca abriu o app atualizado" } as const;

/** Controle em tempo real: sempre a operação de HOJE. */
export default async function MapPage({ searchParams }: PageProps<"/painel/mapa">) {
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const [{ stores: all, generatedAt }, options, noGeo] = await Promise.all([liveMapStores(scope, f), filterOptions(scope), geoPermissionList(scope, f.promoter)]);
  const stores = f.q ? all.filter((st) => matchText(f.q, st.name, st.chain, st.city, ...st.stops.flatMap((x) => [x.promoterName, ...x.brands.map((b) => b.name)]))) : all;
  const located = stores.filter((st) => st.lat != null);

  return (
    <>
      <PageHeader
        title="Mapa operacional"
        subtitle={
          <span className="first-letter:uppercase inline-block">
            {fmtLongDate(todayIso())} · tempo real · {located.length} loja(s) concluída(s) ou em andamento no mapa · dados de {fmtTime(generatedAt)}
          </span>
        }
      />
      <FilterBar
        fields={["brand", "chain", "promoter", "city", "status", "q"]}
        qPlaceholder="Loja, cidade, promotor ou marca"
        options={{ ...options, statuses: [{ id: "completed", name: "Concluída" }, { id: "in_progress", name: "Em andamento" }] }}
        statusLabel="Concluídas e em andamento"
      />
      <LiveMap stores={located} />

      <SectionCard
        className="mt-6"
        title={`Promotores sem localização permitida (${noGeo.length})`}
        subtitle="Quem não liberou a localização no celular. O aplicativo pede de novo a cada 15 minutos enquanto estiver bloqueada."
        bodyClass="pb-1"
      >
        {noGeo.length ? (
          <Table>
            <thead>
              <tr>
                <Th>Promotor</Th>
                <Th>Situação</Th>
                <Th>Última verificação</Th>
                <Th>Último acesso ao app</Th>
              </tr>
            </thead>
            <tbody>
              {noGeo.map((p) => (
                <tr key={p.id}>
                  <Td className="font-semibold">{p.name}</Td>
                  <Td>
                    <StatusBadge tone={p.permission === "denied" ? "danger" : "warning"} size="sm">
                      {PERMISSION_LABEL[p.permission]}
                    </StatusBadge>
                  </Td>
                  <Td className="text-muted">{p.checkedAt ? fmtAgo(p.checkedAt) : "—"}</Td>
                  <Td className="text-muted">{p.lastSeenAt ? fmtAgo(p.lastSeenAt) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-5 pb-4 text-[13px] text-ok font-medium">Todos os promotores ativos liberaram a localização.</p>
        )}
      </SectionCard>
    </>
  );
}
