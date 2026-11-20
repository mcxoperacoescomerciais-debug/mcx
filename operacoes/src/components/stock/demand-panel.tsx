"use client";
/**
 * Estoque na demanda: vincula itens do checklist ao estoque do contratante,
 * mostra o saldo na hora de separar e, quando a pessoa confirma, registra as
 * saídas de uma vez. Nunca registra sozinho.
 */
import { useState } from "react";
import { linkChecklistItemAction, registerDemandOutputsAction } from "@/app/actions";
import { useRun } from "@/components/use-run";

interface Line {
  id: string;
  text: string;
  quantity: number | null;
  checked: boolean;
  stockItemId: string | null;
  unit: string;
  balance: number | null;
  short: boolean;
  registered: number;
}

export function DemandStock({ demandId, lines, options, done, defaultDestination }: { demandId: string; lines: Line[]; options: { id: string; name: string; unit: string; balance: number }[]; done: boolean; defaultDestination: string }) {
  const { run, pending, message } = useRun();
  const linked = lines.filter((l) => l.stockItemId);
  const pendingOut = linked.filter((l) => l.registered === 0);
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(pendingOut.map((l) => [l.id, l.checked && l.quantity ? String(l.quantity) : ""])));
  const [dest, setDest] = useState(defaultDestination);
  const [city, setCity] = useState("");
  const chosen = pendingOut.map((l) => ({ checklistItemId: l.id, quantity: Number(qty[l.id]) || 0 })).filter((l) => l.quantity > 0);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className="grid gap-2 rounded-lg border border-line p-3 text-sm sm:grid-cols-[1fr_14rem] sm:items-center">
            <div>
              <p className="font-semibold text-ink">
                {l.text}
                {l.quantity != null && <span className="ml-1 font-normal text-muted">· pedir {l.quantity} {l.unit}</span>}
              </p>
              {l.stockItemId && (
                <p className={l.short ? "text-xs font-semibold text-bad" : "text-xs text-muted"}>
                  Saldo no estoque: {l.balance} {l.unit}
                  {l.short && " — menos que o pedido"}
                  {l.registered > 0 && <span className="ml-1 font-semibold text-ok">· saída de {l.registered} {l.unit} já registrada</span>}
                </p>
              )}
            </div>
            <label>
              <span className="sr-only">Item do estoque para {l.text}</span>
              <select className="field min-h-9 text-xs" value={l.stockItemId ?? ""} disabled={pending || l.registered > 0} onChange={(e) => run(() => linkChecklistItemAction(l.id, e.target.value || null))}>
                <option value="">Sem vínculo com o estoque</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>{o.name} — {o.balance} {o.unit}</option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>

      {pendingOut.length > 0 && (
        <form
          className="space-y-3 rounded-lg bg-subtle p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => registerDemandOutputsAction(demandId, chosen, { counterpart: dest, city }));
          }}
        >
          <p className="text-sm font-bold text-ink-2">{done ? "Demanda concluída: registrar as saídas do estoque?" : "Registrar as saídas do estoque"}</p>
          <p className="text-xs text-muted">Confira as quantidades que realmente saíram. Nada é baixado sem você confirmar.</p>
          <ul className="space-y-2">
            {pendingOut.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <label htmlFor={`so-${l.id}`} className="text-ink">{l.text} <span className="text-xs text-muted">(saldo {l.balance} {l.unit})</span></label>
                <input id={`so-${l.id}`} className="field w-28" inputMode="numeric" placeholder="0" value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value.replace(/\D/g, "") })} />
              </li>
            ))}
          </ul>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="so-dest">Destino (ação, degustação, para quem)</label>
              <input id="so-dest" className="field" value={dest} onChange={(e) => setDest(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="so-city">Cidade</label>
              <input id="so-city" className="field" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary" disabled={pending || chosen.length === 0}>
            Confirmar {chosen.length || ""} {chosen.length === 1 ? "saída" : "saídas"}
          </button>
        </form>
      )}
      {message}
    </div>
  );
}
