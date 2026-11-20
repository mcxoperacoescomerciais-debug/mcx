import Link from "next/link";
import { notFound } from "next/navigation";
import { AddUnit, CountForm, ItemForm, MovementForm, UnitRow } from "@/components/stock/forms";
import { PageHeader } from "@/components/ui";
import { formatBr } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { MOVEMENT_LABEL, STOCK_CATEGORY_LABEL } from "@/lib/stock";
import { requireCan } from "@/server/auth";
import { getStockItem } from "@/server/stock";

export const metadata = { title: "Item do estoque" };

export default async function StockItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCan("stock.view");
  const { id } = await params;
  const item = await getStockItem(user, id);
  if (!item) notFound();
  const manage = can(user.role, "stock.manage");
  const equipment = item.category === "equipment";
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/estoque/${item.clientId}`} className="font-semibold text-brand-600 underline-offset-2 hover:underline">← Estoque — {item.clientName}</Link>
      </p>
      <PageHeader title={item.name} subtitle={[STOCK_CATEGORY_LABEL[item.category], item.brand, item.location, item.active ? null : "desativado"].filter(Boolean).join(" · ")}>
        {!equipment && (
          <p className={item.low ? "text-2xl font-bold text-bad" : "text-2xl font-bold text-brand-900"}>
            {item.balance} {item.unit}
            {item.minQuantity > 0 && <span className="ml-2 text-xs font-normal text-muted">mínimo {item.minQuantity}</span>}
          </p>
        )}
      </PageHeader>

      {equipment ? (
        <section className="card mb-5 space-y-3 p-4" aria-labelledby="it-units">
          <h2 id="it-units" className="text-sm font-bold text-ink-2">Unidades</h2>
          {item.units.length === 0 && <p className="text-sm text-muted">Nenhuma unidade cadastrada.</p>}
          <ul className="space-y-2">
            {item.units.map((u) => <UnitRow key={`${u.id}-${u.status}`} unit={{ id: u.id, label: u.label, status: u.status, holder: u.holder, dueBack: u.dueBack }} today={item.today} canManage={manage} />)}
          </ul>
          {manage && <AddUnit itemId={item.id} />}
        </section>
      ) : (
        <>
          {item.tracksExpiry && (
            <section className="card mb-5 p-4" aria-labelledby="it-lots">
              <h2 id="it-lots" className="mb-2 text-sm font-bold text-ink-2">Lotes com saldo (sai primeiro o que vence antes)</h2>
              {item.lots.length === 0 ? (
                <p className="text-sm text-muted">Sem lotes com saldo.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {item.lots.map((l) => {
                    const alert = item.expiring.some((e) => e.lot === l.lot && e.expiresOn === l.expiresOn);
                    return (
                      <li key={`${l.lot}-${l.expiresOn}`} className={alert ? "font-semibold text-warn" : "text-ink-2"}>
                        {l.lot ?? "Sem lote"} · vence {formatBr(l.expiresOn)} · {l.quantity} {item.unit}
                        {l.expiresOn && l.expiresOn < item.today ? " · VENCIDO" : ""}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {item.active && (
            <div className="mb-5 grid gap-5 lg:grid-cols-2">
              <section className="card p-4" aria-labelledby="it-move">
                <h2 id="it-move" className="mb-3 text-sm font-bold text-ink-2">Registrar movimentação</h2>
                <MovementForm fixedItemId={item.id} today={item.today} canManage={manage} items={[{ id: item.id, name: item.name, unit: item.unit, balance: item.balance, tracksExpiry: item.tracksExpiry, lots: item.lots }]} />
              </section>
              <section className="card p-4" aria-labelledby="it-count">
                <h2 id="it-count" className="mb-1 text-sm font-bold text-ink-2">Contagem</h2>
                <p className="mb-3 text-xs text-muted">Informe o que foi contado. O saldo nunca é digitado: a diferença vira um ajuste de inventário, com motivo.</p>
                <CountForm itemId={item.id} unit={item.unit} balance={item.balance} canManage={manage} />
                {item.counts.some((c) => c.status === "pending") && <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-xs text-warn">Há uma contagem aguardando o gestor aprovar o ajuste.</p>}
              </section>
            </div>
          )}

          <section className="card mb-5 p-4" aria-labelledby="it-stmt">
            <h2 id="it-stmt" className="mb-3 text-sm font-bold text-ink-2">Extrato</h2>
            {item.statement.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma movimentação ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="pb-1 font-semibold">Data</th>
                      <th className="pb-1 font-semibold">Tipo</th>
                      <th className="pb-1 font-semibold">Origem / destino / motivo</th>
                      <th className="pb-1 text-right font-semibold">Qtd.</th>
                      <th className="pb-1 text-right font-semibold">Saldo</th>
                      <th className="pb-1 pl-3 font-semibold">Quem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.statement.map((m) => (
                      <tr key={m.id} className="border-t border-line align-top">
                        <td className="py-1.5 text-ink-2">{formatBr(m.day)}</td>
                        <td className="py-1.5 text-ink">{MOVEMENT_LABEL[m.kind]}</td>
                        <td className="py-1.5 text-ink-2">
                          {[m.counterpart, m.city, m.store, m.promoter, m.reason, m.reference ? `ref. ${m.reference}` : null, m.lot ? `lote ${m.lot}` : null, m.expiresOn ? `val. ${formatBr(m.expiresOn)}` : null].filter(Boolean).join(" · ") || "—"}
                          {m.demandId && <> · <Link href={`/demandas/${m.demandId}`} className="underline underline-offset-2">demanda</Link></>}
                        </td>
                        <td className={m.delta < 0 ? "py-1.5 text-right font-semibold text-bad" : "py-1.5 text-right font-semibold text-ok"}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                        <td className="py-1.5 text-right font-bold text-ink">{m.balance}</td>
                        <td className="py-1.5 pl-3 text-ink-2">{m.userName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {manage && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-bold text-ink-2">Editar item</summary>
          <div className="mt-4">
            <ItemForm clientId={item.clientId} brands={[]} item={{ id: item.id, brand: item.brand, name: item.name, category: item.category, unit: item.unit, minQuantity: item.minQuantity, location: item.location, tracksExpiry: item.tracksExpiry, note: item.note, active: item.active }} />
          </div>
        </details>
      )}
    </>
  );
}
