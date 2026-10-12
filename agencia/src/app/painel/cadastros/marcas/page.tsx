import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { requireRole, getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { PageHeader, StatusBadge, inputClass, selectClass } from "@/components/ui";
import { SectionCard, Table, Td, Th } from "../../_components/widgets";
import { ActionForm, Disclosure } from "../../_components/action-form";
import { saveBrandAction } from "../actions";

export const metadata: Metadata = { title: "Marcas" };

type Brand = typeof s.brands.$inferSelect;

export default async function BrandsPage() {
  await requireRole(["admin"]);
  const scope = await getScope();
  const db = await getDb();
  const brands = await db
    .select({
      b: s.brands,
      products: sql<number>`(select count(*)::int from ${s.products} p where p.brand_id = ${s.brands.id} and p.status = 'active')`,
      stores: sql<number>`(select count(*)::int from ${s.storeBrands} sb where sb.brand_id = ${s.brands.id})`,
      promoters: sql<number>`(select count(*)::int from ${s.userBrands} ub join ${s.users} u on u.id = ub.user_id where ub.brand_id = ${s.brands.id} and u.role = 'promoter' and u.status = 'active')`,
    })
    .from(s.brands)
    .where(eq(s.brands.agencyId, scope.agencyId))
    .orderBy(asc(s.brands.name));

  return (
    <>
      <PageHeader title="Marcas" subtitle={`${brands.length} marca(s) · regras de atendimento, fotos mínimas e atividades de cada marca`} />
      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-surface border border-line rounded-[var(--radius-card)] overflow-hidden">
          <Table>
            <thead>
              <tr>
                <Th>Marca</Th>
                <Th align="right">Produtos</Th>
                <Th align="right">Lojas</Th>
                <Th align="right">Promotores</Th>
                <Th>Regras</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {brands.map(({ b, products, stores, promoters }) => (
                <tr key={b.id} className="align-top">
                  <Td>
                    <p className="font-semibold">{b.name}</p>
                    <p className="text-[11.5px] text-muted">{b.code}</p>
                    <div className="mt-2 max-w-md">
                      <Disclosure label="Editar">
                        <BrandForm brand={b} />
                      </Disclosure>
                    </div>
                  </Td>
                  <Td align="right">
                    <Link href={`/painel/cadastros/produtos?brand=${b.id}`} className="hover:underline">
                      {products}
                    </Link>
                  </Td>
                  <Td align="right">{stores}</Td>
                  <Td align="right">{promoters}</Td>
                  <Td className="text-[12.5px] text-ink-2">
                    Antes ≥ {b.minBeforePhotos} · Depois ≥ {b.minAfterPhotos}
                    <br />
                    {b.requireStock ? "Estoque obrigatório" : "Estoque opcional"}
                    <br />
                    {b.allowGallery ? "Permite galeria" : "Só câmera"} · {b.activities.length} atividade(s)
                  </Td>
                  <Td>
                    <StatusBadge tone={b.status === "active" ? "success" : "muted"} size="sm">
                      {b.status === "active" ? "Ativa" : "Inativa"}
                    </StatusBadge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
        <SectionCard title="Nova marca" bodyClass="px-5 pb-5">
          <BrandForm brand={null} />
        </SectionCard>
      </div>
    </>
  );
}

function BrandForm({ brand }: { brand: Brand | null }) {
  return (
    <ActionForm action={saveBrandAction} hidden={{ id: brand?.id ?? "" }} submitLabel={brand ? "Salvar marca" : "Cadastrar marca"} resetOnSuccess={!brand}>
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required defaultValue={brand?.name} placeholder="Nome da marca" className={inputClass} />
        <input name="code" required defaultValue={brand?.code} placeholder="Identificador (ex.: BRAVO)" className={inputClass} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[12px] text-ink-2">
          Fotos do antes (mín.)
          <input type="number" name="minBeforePhotos" min={0} max={10} defaultValue={brand?.minBeforePhotos ?? 1} className={inputClass} />
        </label>
        <label className="text-[12px] text-ink-2">
          Fotos do depois (mín.)
          <input type="number" name="minAfterPhotos" min={0} max={10} defaultValue={brand?.minAfterPhotos ?? 1} className={inputClass} />
        </label>
        <label className="text-[12px] text-ink-2">
          Status
          <select name="status" defaultValue={brand?.status ?? "active"} className={selectClass}>
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-[13px]">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="requireStock" defaultChecked={brand?.requireStock ?? true} /> Estoque obrigatório
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" name="allowGallery" defaultChecked={brand?.allowGallery ?? true} /> Permitir foto da galeria
        </label>
      </div>
      <label className="block text-[12px] text-ink-2">
        Atividades da execução (uma por linha)
        <textarea name="activities" rows={4} defaultValue={brand?.activities.join("\n")} className={inputClass + " h-auto py-2"} />
      </label>
      <input name="notes" defaultValue={brand?.notes ?? ""} placeholder="Observações operacionais" className={inputClass} />
    </ActionForm>
  );
}
