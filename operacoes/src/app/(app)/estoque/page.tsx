import Link from "next/link";
import { InventoryDayForm } from "@/components/stock/forms";
import { PageHeader } from "@/components/ui";
import { can } from "@/lib/permissions";
import { requireCan } from "@/server/auth";
import { inventoryDay, stockOverview } from "@/server/stock";

export const metadata = { title: "Estoque" };

export default async function StockPage() {
  const user = await requireCan("stock.view");
  const [clients, day] = await Promise.all([stockOverview(user), inventoryDay()]);
  const manage = can(user.role, "stock.manage");
  return (
    <>
      <PageHeader title="Estoque dos clientes" subtitle="Materiais que a MCX guarda para cada contratante. O saldo vem sempre das movimentações." />
      <ul className="mb-6 grid gap-3 sm:grid-cols-2">
        {clients.map((c) => (
          <li key={c.id}>
            <Link href={`/estoque/${c.id}`} className="card block h-full px-4 py-3 hover:border-brand-500">
              <p className="font-semibold text-ink">{c.name}</p>
              <p className="mt-0.5 text-xs text-muted">{c.items === 0 ? "Nenhum item cadastrado" : `${c.items} ${c.items === 1 ? "item" : "itens"}`}</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
                {c.low > 0 && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-bad">{c.low} abaixo do mínimo</span>}
                {c.expiring > 0 && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-warn">{c.expiring} com validade próxima</span>}
                {c.overdue > 0 && <span className="rounded-full bg-bad-bg px-2 py-0.5 text-bad">{c.overdue} {c.overdue === 1 ? "equipamento atrasado" : "equipamentos atrasados"}</span>}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {manage && (
        <section className="card max-w-xl p-4" aria-labelledby="st-inv">
          <h2 id="st-inv" className="mb-1 text-sm font-bold text-ink-2">Contagem mensal</h2>
          <p className="mb-3 text-xs text-muted">Nesse dia, o sistema abre uma demanda de inventário por contratante, com um item de checklist para cada material.</p>
          <InventoryDayForm day={day} />
        </section>
      )}
    </>
  );
}
