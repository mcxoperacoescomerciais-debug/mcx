import Link from "next/link";
import { notFound } from "next/navigation";
import { AddUnit, ItemForm, MovementForm, PendingCount, UnitRow } from "@/components/stock/forms";
import { PageHeader } from "@/components/ui";
import { formatBr } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { MOVEMENT_LABEL, STOCK_CATEGORY_LABEL } from "@/lib/stock";
import { requireCan } from "@/server/auth";
import { clientStock } from "@/server/stock";

export const metadata = { title: "Estoque do contratante" };

export default async function ClientStockPage({ params }: { params: Promise<{ clientId: string }> }) {
  const user = await requireCan("stock.view");
  const { clientId } = await params;
  const data = await clientStock(user, clientId);
  if (!data) notFound();
  const manage = can(user.role, "stock.manage");
  const materials = data.items.filter((i) => i.category !== "equipment" && i.active);
  const equipment = data.items.filter((i) => i.category === "equipment" && i.active);
  const inactive = data.items.filter((i) => !i.active);
  const low = materials.filter((i) => i.low);
  const expiring = materials.filter((i) => i.expiring.length);
  const overdue = equipment.flatMap((i) => i.units.filter((u) => u.status === "in_use" && u.dueBack && u.dueBack < data.today).map((u) => ({ ...u, item: i.name })));

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/estoque" className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Estoque</Link>
      </p>
      <PageHeader title={`Estoque — ${data.client.name}`} subtitle={`${materials.length} ${materials.length === 1 ? "material" : "materiais"} e ${equipment.length} ${equipment.length === 1 ? "equipamento" : "equipamentos"}.`}>
        {manage && <Link href={`/estoque/${data.client.id}/relatorio`} className="btn-ghost">Relatório mensal</Link>}
      </PageHeader>

      {(low.length > 0 || expiring.length > 0 || overdue.length > 0) && (
        <section className="card mb-5 space-y-1 border-l-4 border-l-bad p-4 text-sm" aria-label="Alertas">
          {low.map((i) => (
            <p key={`l-${i.id}`} className="text-bad"><strong>Abaixo do mínimo:</strong> {i.name} — {i.balance} {i.unit} (mínimo {i.minQuantity})</p>
          ))}
          {expiring.flatMap((i) => i.expiring.map((l) => (
            <p key={`e-${i.id}-${l.lot}-${l.expiresOn}`} className="text-warn"><strong>{l.expiresOn && l.expiresOn < data.today ? "Vencido" : "Validade próxima"}:</strong> {i.name} — {l.quantity} {i.unit}{l.lot ? `, lote ${l.lot}` : ""}, {formatBr(l.expiresOn)}</p>
          )))}
          {overdue.map((u) => (
            <p key={`o-${u.id}`} className="text-bad"><strong>Devolução atrasada:</strong> {u.label} — com {u.holder} desde {formatBr(u.dueBack)}</p>
          ))}
        </section>
      )}

      {data.counts.length > 0 && manage && (
        <section className="card mb-5 p-4" aria-labelledby="cs-counts">
          <h2 id="cs-counts" className="mb-3 text-sm font-bold text-ink-2">Contagens aguardando aprovação</h2>
          <ul className="space-y-2">
            {data.counts.map((c) => <PendingCount key={c.id} count={{ id: c.id, itemName: c.itemName, unit: c.unit, counted: c.counted, balanceAtCount: c.balanceAtCount, note: c.note, userName: c.userName }} />)}
          </ul>
        </section>
      )}

      <section className="mb-5" aria-labelledby="cs-items">
        <h2 id="cs-items" className="mb-2 text-sm font-bold text-ink-2">Saldo por item</h2>
        {materials.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-muted">Nenhum material cadastrado. {manage ? "Cadastre o primeiro abaixo." : "O gestor cadastra os itens."}</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 font-semibold">Categoria</th>
                  <th className="px-2 py-2 text-right font-semibold">Saldo</th>
                  <th className="px-2 py-2 text-right font-semibold">Mínimo</th>
                  <th className="px-4 py-2 font-semibold">Validade mais próxima</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <Link href={`/estoque/item/${i.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">{i.name}</Link>
                      {i.brand && <span className="ml-1 text-xs text-muted">({i.brand})</span>}
                      {i.location && <span className="block text-xs text-muted">{i.location}</span>}
                    </td>
                    <td className="px-2 py-2 text-ink-2">{STOCK_CATEGORY_LABEL[i.category]}</td>
                    <td className={i.low ? "px-2 py-2 text-right font-bold text-bad" : "px-2 py-2 text-right font-bold text-ink"}>{i.balance} {i.unit}</td>
                    <td className="px-2 py-2 text-right text-ink-2">{i.minQuantity || "—"}</td>
                    <td className={i.expiring.length ? "px-4 py-2 font-semibold text-warn" : "px-4 py-2 text-ink-2"}>{i.tracksExpiry ? formatBr(i.nextExpiry) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {materials.length > 0 && (
        <section className="card mb-5 p-4" aria-labelledby="cs-move">
          <h2 id="cs-move" className="mb-3 text-sm font-bold text-ink-2">Registrar movimentação</h2>
          <MovementForm today={data.today} canManage={manage} items={materials.map((i) => ({ id: i.id, name: i.name, unit: i.unit, balance: i.balance, tracksExpiry: i.tracksExpiry, lots: i.lots }))} />
        </section>
      )}

      {equipment.length > 0 && (
        <section className="mb-5" aria-labelledby="cs-eq">
          <h2 id="cs-eq" className="mb-2 text-sm font-bold text-ink-2">Equipamentos</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {equipment.map((i) => (
              <div key={i.id} className="card space-y-3 p-4">
                <p className="font-semibold text-ink">
                  <Link href={`/estoque/item/${i.id}`} className="underline-offset-2 hover:underline">{i.name}</Link>
                  <span className="ml-2 text-xs font-normal text-muted">{i.units.filter((u) => u.status === "available").length} de {i.units.length} disponíveis</span>
                </p>
                <ul className="space-y-2">
                  {i.units.map((u) => <UnitRow key={`${u.id}-${u.status}`} unit={{ id: u.id, label: u.label, status: u.status, holder: u.holder, dueBack: u.dueBack }} today={data.today} canManage={manage} />)}
                </ul>
                {manage && <AddUnit itemId={i.id} />}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card mb-5 p-4" aria-labelledby="cs-recent">
        <h2 id="cs-recent" className="mb-3 text-sm font-bold text-ink-2">Últimas movimentações</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.recent.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-x-3 border-t border-line pt-1.5 first:border-t-0 first:pt-0">
                <span className="text-ink">
                  <strong>{MOVEMENT_LABEL[m.kind]}</strong> · {m.itemName}
                  {(m.counterpart || m.city) && <span className="text-muted"> · {[m.counterpart, m.city].filter(Boolean).join(" — ")}</span>}
                  {m.reason && <span className="text-muted"> · {m.reason}</span>}
                </span>
                <span className="text-ink-2">
                  <strong className={m.delta < 0 ? "text-bad" : "text-ok"}>{m.delta > 0 ? "+" : ""}{m.delta} {m.unit}</strong> · {formatBr(m.day)} · {m.userName}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {manage && (
        <section className="card p-4" aria-labelledby="cs-new">
          <h2 id="cs-new" className="mb-3 text-sm font-bold text-ink-2">Novo item</h2>
          <ItemForm clientId={data.client.id} brands={data.brands} />
        </section>
      )}
      {inactive.length > 0 && (
        <p className="mt-4 text-xs text-muted">
          Itens desativados:{" "}
          {inactive.map((i, n) => (
            <span key={i.id}>{n > 0 && ", "}<Link href={`/estoque/item/${i.id}`} className="underline underline-offset-2">{i.name}</Link></span>
          ))}
        </p>
      )}
    </>
  );
}
