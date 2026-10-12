import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, sql } from "drizzle-orm";
import { getScope, requireRole } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { PAGE_SIZE, parseFilters, withParams } from "@/lib/filters";
import { UNIT_LABEL, UNITS } from "@/lib/domain";
import { PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { FilterBar } from "../../_components/filter-bar";
import { Pagination, SectionCard, Table, Td, Th } from "../../_components/widgets";
import { ActionForm, Disclosure } from "../../_components/action-form";
import { saveProductAction } from "../actions";

export const metadata: Metadata = { title: "Produtos" };
type Product = typeof s.products.$inferSelect;

export default async function ProductsAdminPage({ searchParams }: PageProps<"/painel/cadastros/produtos">) {
  await requireRole(["admin"]);
  const scope = await getScope();
  const f = parseFilters(await searchParams);
  const db = await getDb();
  const brands = await db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(eq(s.brands.agencyId, scope.agencyId)).orderBy(asc(s.brands.name));
  const q = f.q ? `%${f.q.toLowerCase()}%` : null;
  const rows = await db
    .select({ p: s.products, brandName: s.brands.name, total: sql<number>`count(*) over()::int` })
    .from(s.products)
    .innerJoin(s.brands, eq(s.brands.id, s.products.brandId))
    .where(
      and(
        eq(s.products.agencyId, scope.agencyId),
        f.brand ? eq(s.products.brandId, f.brand) : undefined,
        f.status ? eq(s.products.status, f.status as "active" | "inactive") : undefined,
        q ? sql`(lower(${s.products.name}) like ${q} or lower(${s.products.sku}) like ${q} or coalesce(${s.products.ean}, '') like ${q} or lower(coalesce(${s.products.category}, '')) like ${q})` : undefined,
      ),
    )
    .orderBy(asc(s.brands.name), asc(s.products.sortOrder), asc(s.products.name))
    .limit(PAGE_SIZE)
    .offset((f.page - 1) * PAGE_SIZE);
  const total = rows[0]?.total ?? 0;

  return (
    <>
      <PageHeader title="Produtos" subtitle={`${total} produto(s) · nomes com grafia diferente do mesmo produto são bloqueados como duplicados`} actions={<Link href="/painel/cadastros/importar" className="text-[13px] font-semibold text-brand-700">Importar planilha de produtos →</Link>} />
      <FilterBar fields={["brand", "status", "q"]} options={{ brands, statuses: [{ id: "active", name: "Ativos" }, { id: "inactive", name: "Inativos" }] }} qPlaceholder="Nome, SKU, EAN ou categoria" />
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th>Marca</Th>
                <Th>SKU / EAN</Th>
                <Th>Categoria</Th>
                <Th>Unidade</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, brandName }) => (
                <tr key={p.id} className="align-top">
                  <Td>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-[11.5px] text-muted">{[p.variant, p.package].filter(Boolean).join(" · ")}</p>
                    <div className="mt-1.5 max-w-md">
                      <Disclosure label="Editar">
                        <ProductForm product={p} brands={brands} />
                      </Disclosure>
                    </div>
                  </Td>
                  <Td>{brandName}</Td>
                  <Td className="tnum text-[12.5px]">
                    {p.sku}
                    {p.ean ? <span className="block text-muted">{p.ean}</span> : null}
                  </Td>
                  <Td>{p.category ?? "—"}</Td>
                  <Td>{UNIT_LABEL[p.unit]}</Td>
                  <Td>
                    <StatusBadge tone={p.status === "active" ? "success" : "muted"} size="sm">
                      {p.status === "active" ? "Ativo" : "Inativo"}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={f.page} total={total} pageSize={PAGE_SIZE} hrefFor={(pg) => withParams({ brand: f.brand, status: f.status, q: f.q || null }, { page: pg })} />
        </div>
        <SectionCard title="Novo produto" bodyClass="px-5 pb-5">
          <ProductForm product={null} brands={brands} defaultBrand={f.brand} />
        </SectionCard>
      </div>
    </>
  );
}

function ProductForm({ product, brands, defaultBrand }: { product: Product | null; brands: { id: string; name: string }[]; defaultBrand?: string | null }) {
  return (
    <ActionForm action={saveProductAction} hidden={{ id: product?.id ?? "" }} submitLabel={product ? "Salvar produto" : "Cadastrar produto"} resetOnSuccess={!product}>
      <select name="brandId" required defaultValue={product?.brandId ?? defaultBrand ?? ""} className={selectClass} aria-label="Marca">
        <option value="">Marca</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <input name="name" required defaultValue={product?.name} placeholder="Nome (ex.: Café Tradicional 500 g)" className={inputClass} />
      <div className="grid grid-cols-2 gap-2">
        <input name="sku" required defaultValue={product?.sku} placeholder="SKU / código" className={inputClass} />
        <input name="ean" defaultValue={product?.ean ?? ""} placeholder="EAN (opcional)" inputMode="numeric" className={inputClass} />
        <input name="category" defaultValue={product?.category ?? ""} placeholder="Categoria" className={inputClass} />
        <input name="variant" defaultValue={product?.variant ?? ""} placeholder="Variante / sabor" className={inputClass} />
        <input name="package" defaultValue={product?.package ?? ""} placeholder="Embalagem / gramatura" className={inputClass} />
        <select name="unit" defaultValue={product?.unit ?? "un"} className={selectClass} aria-label="Unidade de medida">
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </div>
      <select name="status" defaultValue={product?.status ?? "active"} className={selectClass} aria-label="Status">
        <option value="active">Ativo</option>
        <option value="inactive">Inativo</option>
      </select>
    </ActionForm>
  );
}
