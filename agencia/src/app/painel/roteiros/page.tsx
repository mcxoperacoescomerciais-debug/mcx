import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { filterOptions } from "@/server/operations";
import { listRoutes } from "@/server/schedules";
import { EmptyState, PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { SectionCard } from "../_components/widgets";
import { FilterBar } from "../_components/filter-bar";
import { matchText } from "@/lib/filters";
import { ActionForm, Disclosure } from "../_components/action-form";
import { saveRouteAction } from "../programacao/actions";

export const metadata: Metadata = { title: "Roteiros" };
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

type Options = Awaited<ReturnType<typeof filterOptions>>;
type RouteRow = Awaited<ReturnType<typeof listRoutes>>[number];

export default async function RoutesPage({ searchParams }: PageProps<"/painel/roteiros">) {
  const scope = await getScope();
  if (scope.brandIds !== null) notFound();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [allRoutes, options] = await Promise.all([listRoutes(scope), filterOptions(scope)]);
  const routes = q ? allRoutes.filter((r) => matchText(q, r.r.name, r.r.region, r.promoterName, ...r.stops.flatMap((st) => [st.storeName, st.city]))) : allRoutes;
  return (
    <>
      <PageHeader title="Roteiros" subtitle="Modelos reutilizáveis (lojas em ordem + dias da semana) que geram a programação diária. Freelancers podem trabalhar só com programação avulsa." />
      <FilterBar fields={["q"]} options={{}} qPlaceholder="Roteiro, promotor, região, loja ou cidade" />
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          {routes.length === 0 ? (
            <div className="bg-surface border border-line rounded-[var(--radius-card)]">
              <EmptyState title={q ? "Nenhum roteiro encontrado" : "Nenhum roteiro cadastrado"} />
            </div>
          ) : null}
          {routes.map((r) => (
            <SectionCard
              key={r.r.id}
              title={r.r.name}
              subtitle={`${r.promoterName ?? "Sem promotor"} · ${r.r.region ?? "sem região"} · ${r.r.weekdays.map((d) => DAYS[d]).join(", ")}`}
              action={<StatusBadge tone={r.r.status === "active" ? "success" : "muted"} size="sm">{r.r.status === "active" ? "Ativo" : "Inativo"}</StatusBadge>}
              bodyClass="px-5 pb-5"
            >
              <ol className="text-[13px] space-y-1 mb-3" data-export-list data-export-title="Roteiros" data-export-columns="Roteiro|Promotor|Região|Dias|Ordem|Horário|Loja|Cidade|Marcas|Situação">
                {r.stops.map((st, i) => (
                  <li key={st.stop.id} data-export-row>
                    <span hidden>
                      <span data-export-cell>{r.r.name}</span>
                      <span data-export-cell>{r.promoterName ?? "Sem promotor"}</span>
                      <span data-export-cell>{r.r.region ?? ""}</span>
                      <span data-export-cell>{r.r.weekdays.map((d) => DAYS[d]).join(", ")}</span>
                      <span data-export-cell>{i + 1}</span>
                      <span data-export-cell>{st.stop.plannedStart ?? ""}</span>
                      <span data-export-cell>{st.storeName}</span>
                      <span data-export-cell>{st.city}</span>
                      <span data-export-cell>{st.stop.brandIds.length}</span>
                      <span data-export-cell>{r.r.status === "active" ? "Ativo" : "Inativo"}</span>
                    </span>
                    <span className="tnum text-muted mr-2">{i + 1}.</span>
                    {st.stop.plannedStart ? <span className="tnum mr-2">{st.stop.plannedStart}</span> : null}
                    {st.storeName} <span className="text-muted">· {st.city} · {st.stop.brandIds.length} marca(s)</span>
                  </li>
                ))}
              </ol>
              <Disclosure label="Editar roteiro">
                <RouteForm options={options} route={r} />
              </Disclosure>
            </SectionCard>
          ))}
        </div>
        <SectionCard title="Novo roteiro" bodyClass="px-5 pb-5">
          <RouteForm options={options} route={null} />
        </SectionCard>
      </div>
    </>
  );
}

function RouteForm({ options, route }: { options: Options; route: RouteRow | null }) {
  const stops = [...(route?.stops.map((x) => ({ storeId: x.stop.storeId, time: x.stop.plannedStart ?? "" })) ?? []), ...Array.from({ length: 4 }, () => ({ storeId: "", time: "" }))];
  return (
    <ActionForm action={saveRouteAction} hidden={{ id: route?.r.id ?? "" }} submitLabel={route ? "Salvar alterações" : "Criar roteiro"} resetOnSuccess={!route}>
      <input name="name" required defaultValue={route?.r.name} placeholder="Nome do roteiro" className={inputClass} />
      <div className="grid grid-cols-2 gap-2">
        <input name="region" defaultValue={route?.r.region ?? ""} placeholder="Região" className={inputClass} />
        <select name="promoterId" defaultValue={route?.r.promoterId ?? ""} className={selectClass} aria-label="Promotor">
          <option value="">Promotor</option>
          {options.promoters.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="flex flex-wrap gap-3 text-[13px]">
        <legend className="text-[12.5px] font-semibold text-ink-2 mb-1">Dias da semana</legend>
        {DAYS.map((d, i) => (
          <label key={d} className="inline-flex items-center gap-1">
            <input type="checkbox" name="weekdays" value={i} defaultChecked={route ? route.r.weekdays.includes(i) : i >= 1 && i <= 5} /> {d}
          </label>
        ))}
      </fieldset>
      <div className="space-y-1.5">
        <p className="text-[12.5px] font-semibold text-ink-2">Lojas em ordem (linhas vazias são ignoradas)</p>
        {stops.map((st, i) => (
          <div key={i} className="grid grid-cols-[1fr_96px] gap-2">
            <select name="stopStore" defaultValue={st.storeId} className={selectClass} aria-label={`Loja ${i + 1}`}>
              <option value="">—</option>
              {options.stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.city}
                </option>
              ))}
            </select>
            <input type="time" name="stopTime" defaultValue={st.time} className={inputClass} aria-label={`Horário ${i + 1}`} />
          </div>
        ))}
      </div>
      {route ? (
        <>
          <select name="status" defaultValue={route.r.status} className={selectClass} aria-label="Situação">
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
          <input name="reason" required minLength={5} placeholder="Justificativa da alteração (obrigatória)" className={inputClass} />
        </>
      ) : null}
      <p className="text-[12px] text-muted">As marcas de cada loja são as autorizadas ao promotor naquela loja.</p>
    </ActionForm>
  );
}
