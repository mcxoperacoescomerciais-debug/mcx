import type { Metadata } from "next";
import { isUuid } from "@/lib/filters";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { PageHeader } from "@/components/ui";
import { SectionCard } from "../../../_components/widgets";
import { ActionForm } from "../../../_components/action-form";
import { storeProductsAction } from "../../actions";
import { StoreForm } from "../store-form";

export const metadata: Metadata = { title: "Cadastro da loja" };

export default async function StoreAdminPage({ params }: PageProps<"/painel/cadastros/lojas/[id]">) {
  await requireRole(["admin"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  const db = await getDb();
  const [store] = await db.select().from(s.stores).where(and(eq(s.stores.id, id), eq(s.stores.agencyId, scope.agencyId)));
  if (!store) notFound();
  const [chains, brands, storeBrands, products, tracked, promoters] = await Promise.all([
    db.select({ id: s.chains.id, name: s.chains.name }).from(s.chains).where(eq(s.chains.agencyId, scope.agencyId)).orderBy(asc(s.chains.name)),
    db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(eq(s.brands.agencyId, scope.agencyId)).orderBy(asc(s.brands.name)),
    db.select().from(s.storeBrands).where(eq(s.storeBrands.storeId, id)),
    db.select().from(s.products).where(and(eq(s.products.agencyId, scope.agencyId), eq(s.products.status, "active"))).orderBy(asc(s.products.sortOrder), asc(s.products.name)),
    db.select().from(s.storeProducts).where(eq(s.storeProducts.storeId, id)),
    db
      .select({ id: s.users.id, name: s.users.name })
      .from(s.userStores)
      .innerJoin(s.users, eq(s.users.id, s.userStores.userId))
      .where(eq(s.userStores.storeId, id)),
  ]);
  const brandIds = storeBrands.map((b) => b.brandId);
  const trackedSet = new Set(tracked.map((t) => t.productId));

  return (
    <>
      <PageHeader eyebrow={<Link href="/painel/cadastros/lojas" className="hover:underline">Redes e lojas</Link>} title={store.name} subtitle={`${store.city}/${store.state}${store.code ? ` · cód. ${store.code}` : ""}`} actions={<Link href={`/painel/lojas/${store.id}`} className="text-[13px] font-semibold text-brand-700">Ver operação da loja →</Link>} />
      <div className="grid xl:grid-cols-2 gap-6">
        <SectionCard title="Dados da loja" bodyClass="px-5 pb-5">
          <StoreForm store={store} brandIds={brandIds} chains={chains} brands={brands} />
          <p className="text-[12.5px] text-muted mt-4">
            Promotores autorizados ({promoters.length}): {promoters.map((p) => p.name).join(", ") || "nenhum"} — ajuste em Cadastros › Usuários.
          </p>
        </SectionCard>
        <SectionCard title="Produtos acompanhados nesta loja" subtitle="Sem seleção = todos os produtos ativos da marca. Marque só os que a loja trabalha para reduzir o formulário do promotor." bodyClass="px-5 pb-5 space-y-5">
          {brands
            .filter((b) => brandIds.includes(b.id))
            .map((b) => {
              const list = products.filter((p) => p.brandId === b.id);
              const custom = list.some((p) => trackedSet.has(p.id));
              return (
                <div key={b.id} className="rounded-xl border border-line p-4">
                  <p className="font-semibold text-[14px] mb-2">
                    {b.name} <span className="text-[12px] text-muted font-normal">· {custom ? `${list.filter((p) => trackedSet.has(p.id)).length} de ${list.length} selecionados` : `todos os ${list.length} produtos`}</span>
                  </p>
                  <ActionForm action={storeProductsAction} hidden={{ storeId: id, brandId: b.id }} submitLabel="Salvar seleção" variant="secondary" resetOnSuccess={false}>
                    <div className="grid sm:grid-cols-2 gap-1.5 text-[12.5px] max-h-60 overflow-y-auto">
                      {list.map((p) => (
                        <label key={p.id} className="inline-flex items-start gap-1.5">
                          <input type="checkbox" name="productIds" value={p.id} defaultChecked={!custom || trackedSet.has(p.id)} className="mt-0.5" /> {p.name}
                        </label>
                      ))}
                    </div>
                  </ActionForm>
                </div>
              );
            })}
          {!brandIds.length ? <p className="text-[13px] text-muted">Autorize marcas na loja para escolher os produtos.</p> : null}
        </SectionCard>
      </div>
    </>
  );
}
