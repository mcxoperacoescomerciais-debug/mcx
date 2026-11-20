import { PageHeader } from "@/components/ui";
import { requireCan } from "@/server/auth";
import { listCategories, listTypes } from "@/server/registry";
import { CategoryRow, NewCategory } from "../forms";

export const metadata = { title: "Categorias" };

export default async function CategoriesPage() {
  await requireCan("category.edit");
  const [categories, types] = await Promise.all([listCategories(), listTypes()]);
  return (
    <>
      <PageHeader title="Categorias e tipos" subtitle="O tipo é a subcategoria usada para medir o tempo médio de cada tarefa. O que for desativado some dos formulários; as demandas antigas continuam com ele." />
      <ul className="mb-6 max-w-2xl space-y-2">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={{ id: c.id, name: c.name, active: c.active }} types={types.filter((ty) => ty.categoryId === c.id).map((ty) => ({ id: ty.id, name: ty.name, active: ty.active }))} />
        ))}
      </ul>
      <section className="card max-w-2xl p-4" aria-labelledby="nova-cat">
        <h2 id="nova-cat" className="mb-3 text-sm font-bold text-ink-2">Nova categoria</h2>
        <NewCategory />
      </section>
    </>
  );
}
