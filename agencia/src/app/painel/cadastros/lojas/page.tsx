import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { parseFilters, withParams } from "@/lib/filters";
import { PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { FilterBar } from "../../_components/filter-bar";
import { KpiCard, Pagination, SectionCard, Table, Td, Th } from "../../_components/widgets";
import { ActionForm, Disclosure } from "../../_components/action-form";
import { saveChainAction } from "../actions";
import { StoreForm } from "./store-form";
import { filterIn, sqlList } from "@/server/filter-sql";

export const metadata: Metadata = { title: "Redes e lojas" };

const POSITION_KEYS = ["exato", "aproximado", "checkin", "sem"] as const;
type PositionKey = (typeof POSITION_KEYS)[number];
const POSITION_LABEL: Record<PositionKey, string> = { exato: "endereço exato", aproximado: "endereço aproximado", checkin: "posição pelo 1º check-in", sem: "lojas ainda sem posição" };

function positionWhere(k: PositionKey) {
  if (k === "sem") return sql`${s.stores.lat} is null`;
  if (k === "checkin") return sql`${s.stores.lat} is not null and ${s.stores.geoSource} = 'checkin'`;
  if (k === "aproximado") return sql`${s.stores.lat} is not null and ${s.stores.geoSource} = 'address_approx'`;
  return sql`${s.stores.lat} is not null and (${s.stores.geoSource} is null or ${s.stores.geoSource} in ('address', 'manual'))`;
}

export default async function StoresAdminPage({ searchParams }: PageProps<"/painel/cadastros/lojas">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const posicao = typeof sp.posicao === "string" && POSITION_KEYS.includes(sp.posicao as PositionKey) ? (sp.posicao as PositionKey) : null;
  const db = await getDb();
  const q = f.q ? `%${f.q.toLowerCase()}%` : null;
  const [chains, brands] = await Promise.all([
    db
      .select({ id: s.chains.id, name: s.chains.name, status: s.chains.status, stores: sql<number>`(select count(*)::int from ${s.stores} st where st.chain_id = ${s.chains.id})` })
      .from(s.chains)
      .where(eq(s.chains.agencyId, scope.agencyId))
      .orderBy(asc(s.chains.name)),
    db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(eq(s.brands.agencyId, scope.agencyId)).orderBy(asc(s.brands.name)),
  ]);
  const stores = await db
    .select({
      st: s.stores,
      chainName: s.chains.name,
      brands: sql<string>`(select string_agg(b.name, ', ' order by b.name) from ${s.storeBrands} sb join ${s.brands} b on b.id = sb.brand_id where sb.store_id = ${s.stores.id})`,
      promoters: sql<number>`(select count(*)::int from ${s.userStores} us where us.store_id = ${s.stores.id})`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(s.stores)
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(
      and(
        eq(s.stores.agencyId, scope.agencyId),
        f.chain ? filterIn(s.stores.chainId, f.chain) : undefined,
        f.city ? filterIn(s.stores.city, f.city) : undefined,
        f.status ? eq(s.stores.status, f.status as "active" | "inactive") : undefined,
        f.brand ? sql`exists (select 1 from ${s.storeBrands} sb where sb.store_id = ${s.stores.id} and sb.brand_id in ${sqlList(f.brand)})` : undefined,
        posicao ? positionWhere(posicao) : undefined,
        q ? sql`(lower(${s.stores.name}) like ${q} or lower(coalesce(${s.stores.code}, '')) like ${q} or lower(${s.stores.city}) like ${q} or coalesce(${s.stores.cnpj}, '') like ${q})` : undefined,
      ),
    )
    .orderBy(asc(s.stores.name))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  const total = stores[0]?.total ?? 0;
  const [pos] = await db
    .select({
      address: sql<number>`count(*) filter (where ${s.stores.lat} is not null and ${s.stores.geoSource} in ('address', 'manual'))::int`,
      approx: sql<number>`count(*) filter (where ${s.stores.lat} is not null and ${s.stores.geoSource} = 'address_approx')::int`,
      checkin: sql<number>`count(*) filter (where ${s.stores.lat} is not null and ${s.stores.geoSource} = 'checkin')::int`,
      none: sql<number>`count(*) filter (where ${s.stores.lat} is null)::int`,
      other: sql<number>`count(*) filter (where ${s.stores.lat} is not null and ${s.stores.geoSource} is null)::int`,
    })
    .from(s.stores)
    .where(and(eq(s.stores.agencyId, scope.agencyId), eq(s.stores.status, "active")));
  const posHref = (k: PositionKey) => withParams({ q: f.q || null, chain: f.chain, city: f.city, brand: f.brand, status: f.status }, { posicao: posicao === k ? null : k });
  const cities = await db.selectDistinct({ city: s.stores.city }).from(s.stores).where(eq(s.stores.agencyId, scope.agencyId)).orderBy(asc(s.stores.city));

  return (
    <>
      <PageHeader title="Redes e lojas" subtitle={`${total} loja(s) neste filtro · uma loja pode atender várias marcas`} actions={<Link href="/painel/cadastros/importar" className="text-[13px] font-semibold text-brand-700">Importar planilha de lojas →</Link>} />
      <FilterBar
        fields={["brand", "chain", "city", "status", "q"]}
        options={{ brands, chains, cities: cities.map((c) => c.city), statuses: [{ id: "active", name: "Ativas" }, { id: "inactive", name: "Inativas" }] }}
        qPlaceholder="Nome, código, cidade ou CNPJ"
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Endereço exato" value={pos.address + pos.other} sub="posição pelo endereço ou ajustada à mão" tone="success" href={posHref("exato")} />
        <KpiCard label="Endereço aproximado" value={pos.approx} sub="só a rua; o 1º check-in corrige" tone="info" href={posHref("aproximado")} />
        <KpiCard label="Pelo 1º check-in" value={pos.checkin} sub="posição do GPS do promotor na 1ª visita" tone="success" href={posHref("checkin")} />
        <KpiCard label="Ainda sem posição" value={pos.none} sub="fica no local do 1º check-in com GPS bom" tone={pos.none ? "warning" : "neutral"} href={posHref("sem")} />
      </div>
      {posicao ? (
        <p className="text-[13px] text-ink-2 -mt-3 mb-4">
          Mostrando: <strong>{POSITION_LABEL[posicao]}</strong> ·{" "}
          <Link href={posHref(posicao)} className="text-brand-700 font-semibold">
            ver todas
          </Link>
        </p>
      ) : null}
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Loja</Th>
                <Th>Rede</Th>
                <Th>Cidade</Th>
                <Th>Posição</Th>
                <Th>Marcas autorizadas</Th>
                <Th align="right">Promotores</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {stores.map(({ st, chainName, brands: b, promoters }) => (
                <tr key={st.id} className="hover:bg-subtle">
                  <Td>
                    <Link href={`/painel/cadastros/lojas/${st.id}`} className="font-semibold hover:underline">
                      {st.name}
                    </Link>
                    {st.code ? <span className="block text-[11.5px] text-muted">cód. {st.code}</span> : null}
                  </Td>
                  <Td>{chainName ?? "—"}</Td>
                  <Td>
                    {st.city}/{st.state}
                  </Td>
                  <Td className="text-[12.5px] text-ink-2">{st.lat == null ? <span className="text-warn">sem posição</span> : st.geoSource === "checkin" ? "1º check-in" : st.geoSource === "address_approx" ? "aproximada" : "exata"}</Td>
                  <Td className="text-[12.5px] text-ink-2 max-w-[260px]">{b ?? "—"}</Td>
                  <Td align="right">{promoters}</Td>
                  <Td>
                    <StatusBadge tone={st.status === "active" ? "success" : "muted"} size="sm">
                      {st.status === "active" ? "Ativa" : "Inativa"}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} total={total} pageSize={f.pageSize} hrefFor={(p) => withParams({ q: f.q || null, chain: f.chain, city: f.city, brand: f.brand, status: f.status, posicao }, { page: p })} />
        </div>
        <div className="space-y-6">
          <SectionCard title="Nova loja" bodyClass="px-5 pb-5">
            <StoreForm store={null} brandIds={[]} chains={chains} brands={brands} />
          </SectionCard>
          <SectionCard title="Redes / bandeiras" bodyClass="px-5 pb-5 space-y-3">
            <ul className="text-[13px] space-y-2">
              {chains.map((c) => (
                <li key={c.id}>
                  <Disclosure label={`${c.name} · ${c.stores} loja(s)${c.status === "inactive" ? " · inativa" : ""}`}>
                    <ActionForm action={saveChainAction} hidden={{ id: c.id }} submitLabel="Salvar" resetOnSuccess={false}>
                      <input name="name" defaultValue={c.name} className={inputClass} required />
                      <select name="status" defaultValue={c.status} className={selectClass}>
                        <option value="active">Ativa</option>
                        <option value="inactive">Inativa</option>
                      </select>
                    </ActionForm>
                  </Disclosure>
                </li>
              ))}
            </ul>
            <ActionForm action={saveChainAction} hidden={{ id: "" }} submitLabel="Adicionar rede" variant="secondary">
              <input name="name" required placeholder="Nome da rede" className={inputClass} />
            </ActionForm>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
