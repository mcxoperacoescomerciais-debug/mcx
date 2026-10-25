import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { Handshake } from "lucide-react";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { withParams } from "@/lib/filters";
import { EmptyState, PageHeader, buttonClass, inputClass, selectClass } from "@/components/ui";
import { SectionCard } from "../../_components/widgets";

export const metadata: Metadata = { title: "Atendimentos via parceiros" };

const PERIOD_LABEL = { week: "semana", fortnight: "quinzena", month: "mês" } as const;

/** Loja × marca atendida por parceiro, com o promotor (quando atribuído) e o parceiro em destaque. */
export default async function PartnersPage({ searchParams }: PageProps<"/painel/cadastros/parceiros">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const sp = await searchParams;
  const partnerId = typeof sp.parceiro === "string" && sp.parceiro ? sp.parceiro : null;
  const q = typeof sp.q === "string" && sp.q.trim() ? sp.q.trim() : "";
  const like = q ? `%${q.toLowerCase()}%` : null;
  const db = await getDb();

  const partners = await db
    .select({
      id: s.partners.id,
      name: s.partners.name,
      contactName: s.partners.contactName,
      phone: s.partners.phone,
      links: sql<number>`(select count(*)::int from ${s.storeBrands} sb where sb.partner_id = ${s.partners.id})`,
    })
    .from(s.partners)
    .where(eq(s.partners.agencyId, scope.agencyId))
    .orderBy(asc(s.partners.name));

  const rows = await db
    .select({
      storeId: s.stores.id,
      store: s.stores.name,
      city: s.stores.city,
      chain: s.chains.name,
      brand: s.brands.name,
      partner: s.partners.name,
      contactName: s.partners.contactName,
      phone: s.partners.phone,
      times: s.storeBrands.visitsPerPeriod,
      period: s.storeBrands.period,
      promoters: sql<string | null>`(select string_agg(u.name, ', ' order by u.name) from ${s.visitTargets} vt join ${s.users} u on u.id = vt.promoter_id where vt.store_id = ${s.storeBrands.storeId} and vt.brand_id = ${s.storeBrands.brandId} and u.status = 'active')`,
    })
    .from(s.storeBrands)
    .innerJoin(s.partners, eq(s.partners.id, s.storeBrands.partnerId))
    .innerJoin(s.stores, eq(s.stores.id, s.storeBrands.storeId))
    .innerJoin(s.brands, eq(s.brands.id, s.storeBrands.brandId))
    .leftJoin(s.chains, eq(s.chains.id, s.stores.chainId))
    .where(
      and(
        eq(s.stores.agencyId, scope.agencyId),
        isNotNull(s.storeBrands.partnerId),
        partnerId ? eq(s.storeBrands.partnerId, partnerId) : undefined,
        like ? sql`(lower(${s.stores.name}) like ${like} or lower(${s.stores.city}) like ${like} or lower(${s.brands.name}) like ${like})` : undefined,
      ),
    )
    .orderBy(asc(s.partners.name), asc(s.stores.name), asc(s.brands.name));
  const withoutPromoter = rows.filter((r) => !r.promoters).length;

  return (
    <>
      <PageHeader
        title="Atendimentos via parceiros"
        subtitle={`${rows.length} loja(s) × marca neste filtro · ${withoutPromoter} sem promotor atribuído`}
        actions={
          <Link href="/painel/cadastros/importar" className="text-[13px] font-semibold text-brand-700">
            Importar planilha de parceiros →
          </Link>
        }
      />

      {partners.length ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
          {partners.map((p) => (
            <Link
              key={p.id}
              href={`/painel/cadastros/parceiros${withParams({ parceiro: partnerId === p.id ? null : p.id, q: q || null })}`}
              className={`rounded-[var(--radius-card)] border px-4 py-3 flex items-center gap-3 hover:bg-subtle ${partnerId === p.id ? "border-brand-600 bg-brand-50" : "border-line bg-surface"}`}
            >
              <span className="size-9 rounded-lg bg-brand-50 text-brand-800 grid place-items-center shrink-0">
                <Handshake className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold truncate">{p.name}</span>
                <span className="block text-[12px] text-muted truncate">
                  {p.contactName && p.contactName !== p.name ? `${p.contactName} · ` : p.contactName ? "responsável · " : ""}
                  {p.phone ?? "sem telefone"}
                </span>
              </span>
              <span className="text-[18px] font-bold tnum">{p.links}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <SectionCard
        title="Loja, marca, promotor e parceiro"
        action={
          <form className="flex flex-wrap gap-2" action="/painel/cadastros/parceiros">
            <select name="parceiro" defaultValue={partnerId ?? ""} className={selectClass + " w-48"} aria-label="Parceiro">
              <option value="">Todos os parceiros</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input name="q" defaultValue={q} placeholder="Loja, cidade ou marca" className={inputClass + " w-48"} aria-label="Buscar" />
            <button type="submit" className={buttonClass("secondary")}>
              Filtrar
            </button>
          </form>
        }
      >
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted text-left border-y border-line">
                  <th className="font-semibold px-5 py-2">Parceiro</th>
                  <th className="font-semibold px-2 py-2">Loja</th>
                  <th className="font-semibold px-2 py-2">Marca</th>
                  <th className="font-semibold px-2 py-2">Promotor</th>
                  <th className="font-semibold px-5 py-2">Frequência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={`${r.storeId}-${r.brand}`} className="align-top">
                    <td className="px-5 py-2.5">
                      <span className="inline-block rounded-md bg-brand-50 text-brand-800 px-2 py-0.5 font-bold">{r.partner}</span>
                      {r.contactName && r.contactName !== r.partner ? <span className="block text-[12px] text-muted mt-0.5">{r.contactName}</span> : null}
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/painel/cadastros/lojas/${r.storeId}`} className="font-semibold hover:underline">
                        {r.store}
                      </Link>
                      <span className="block text-[12px] text-muted">
                        {r.chain ? `${r.chain} · ` : ""}
                        {r.city}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">{r.brand}</td>
                    <td className="px-2 py-2.5">{r.promoters ?? <span className="text-warn font-semibold">Sem promotor</span>}</td>
                    <td className="px-5 py-2.5 tnum whitespace-nowrap">{r.times && r.period ? `${r.times}× por ${PERIOD_LABEL[r.period]}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhum atendimento via parceiro">Importe a planilha em Importar planilha › Atendimentos via parceiros.</EmptyState>
        )}
      </SectionCard>
    </>
  );
}
