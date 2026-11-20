"use client";
/** Formulários do estoque: item, movimentação, contagem, aprovação de ajuste e equipamentos. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMovementAction, addStockUnitAction, decideCountAction, recordCountAction, saveStockItemAction, setInventoryDayAction, setUnitStatusAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import { MOVEMENT_LABEL, STOCK_CATEGORIES, STOCK_CATEGORY_LABEL, STOCK_UNITS, UNIT_STATUS_LABEL, type StockCategory, type UnitStatus } from "@/lib/stock";
import { addDays, formatBr } from "@/lib/dates";

const digits = (v: string) => v.replace(/\D/g, "");

export interface ItemValues {
  id: string;
  brand: string | null;
  name: string;
  category: StockCategory;
  unit: string;
  minQuantity: number;
  location: string | null;
  tracksExpiry: boolean;
  note: string | null;
  active: boolean;
}

export function ItemForm({ clientId, item, brands }: { clientId: string; item?: ItemValues; brands: string[] }) {
  const router = useRouter();
  const { run, pending, message } = useRun();
  const blank = { name: "", brand: "", category: "disposable" as StockCategory, unit: "un", min: "0", location: "", tracksExpiry: false, note: "", active: true };
  const [f, setF] = useState(item ? { name: item.name, brand: item.brand ?? "", category: item.category, unit: item.unit, min: String(item.minQuantity), location: item.location ?? "", tracksExpiry: item.tracksExpiry, note: item.note ?? "", active: item.active } : blank);
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const k = item?.id ?? "novo";
  const equipment = f.category === "equipment";
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await saveStockItemAction(item?.id ?? null, { clientId, name: f.name, brand: f.brand, category: f.category, unit: f.unit, minQuantity: Number(f.min) || 0, location: f.location, tracksExpiry: f.tracksExpiry, note: f.note, active: f.active });
          if (r.ok && !item) {
            setF(blank);
            router.refresh();
          }
          return r;
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`si-name-${k}`}>Item</label>
          <input id={`si-name-${k}`} className="field" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Copos descartáveis 50 ml" required minLength={2} />
        </div>
        <div>
          <label className="label" htmlFor={`si-cat-${k}`}>Categoria</label>
          <select id={`si-cat-${k}`} className="field" value={f.category} onChange={(e) => set("category", e.target.value as StockCategory)}>
            {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{STOCK_CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`si-brand-${k}`}>Marca (opcional)</label>
          <input id={`si-brand-${k}`} className="field" list={`si-brands-${k}`} value={f.brand} onChange={(e) => set("brand", e.target.value)} />
          <datalist id={`si-brands-${k}`}>{brands.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <div>
          <label className="label" htmlFor={`si-unit-${k}`}>Unidade</label>
          <select id={`si-unit-${k}`} className="field" value={f.unit} onChange={(e) => set("unit", e.target.value)}>
            {[...new Set([...STOCK_UNITS, f.unit])].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {!equipment && (
          <div>
            <label className="label" htmlFor={`si-min-${k}`}>Estoque mínimo</label>
            <input id={`si-min-${k}`} className="field" inputMode="numeric" value={f.min} onChange={(e) => set("min", digits(e.target.value))} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`si-loc-${k}`}>Local de guarda</label>
          <input id={`si-loc-${k}`} className="field" value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Ex.: Escritório — prateleira 2" />
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="label" htmlFor={`si-note-${k}`}>Observação</label>
          <input id={`si-note-${k}`} className="field" value={f.note} onChange={(e) => set("note", e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {!equipment && (
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="size-4" checked={f.tracksExpiry} onChange={(e) => set("tracksExpiry", e.target.checked)} /> Controla validade (lote e data em cada entrada)
          </label>
        )}
        {item && (
          <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" className="size-4" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Item ativo
          </label>
        )}
      </div>
      {equipment && <p className="text-xs text-muted">Equipamento é controlado por unidade: depois de salvar, cadastre cada uma (ex.: Garrafa térmica 1).</p>}
      {message}
      <button className="btn-primary" disabled={pending}>{item ? "Salvar item" : "Cadastrar item"}</button>
    </form>
  );
}

type MoveKind = "in" | "out" | "return" | "loss";

export function MovementForm({ items, today, canManage, fixedItemId }: { items: { id: string; name: string; unit: string; balance: number; tracksExpiry: boolean; lots: { lot: string | null; expiresOn: string | null; quantity: number }[] }[]; today: string; canManage: boolean; fixedItemId?: string }) {
  const { run, pending, message } = useRun();
  const [itemId, setItemId] = useState(fixedItemId ?? items[0]?.id ?? "");
  const [kind, setKind] = useState<MoveKind>("out");
  const blank = { quantity: "", day: today, counterpart: "", reference: "", lot: "", expiresOn: "", city: "", store: "", promoter: "", reason: "", lotKey: "" };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const item = items.find((i) => i.id === itemId);
  if (!item) return <p className="text-sm text-muted">Cadastre um item (que não seja equipamento) para registrar movimentações.</p>;
  const kinds: MoveKind[] = canManage ? ["out", "in", "return", "loss"] : ["out", "in", "return"];
  const quantity = Number(f.quantity) || 0;
  const leaving = kind === "out" || kind === "loss";
  const over = leaving && quantity > item.balance;
  const chosenLot = item.lots.find((l) => `${l.lot ?? ""}|${l.expiresOn ?? ""}` === f.lotKey);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            addMovementAction(item.id, {
              kind,
              quantity,
              day: f.day,
              counterpart: kind === "loss" ? null : f.counterpart,
              reference: f.reference,
              lot: leaving ? (chosenLot?.lot ?? null) : f.lot,
              expiresOn: leaving ? (chosenLot?.expiresOn ?? null) : f.expiresOn || null,
              city: f.city,
              store: f.store,
              promoter: f.promoter,
              reason: f.reason,
            }),
          () => setF({ ...blank, day: f.day }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!fixedItemId && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mv-item">Item</label>
            <select id="mv-item" className="field" value={itemId} onChange={(e) => { setItemId(e.target.value); set("lotKey", ""); }}>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} — saldo {i.balance} {i.unit}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="mv-kind">Tipo</label>
          <select id="mv-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as MoveKind)}>
            {kinds.map((x) => <option key={x} value={x}>{MOVEMENT_LABEL[x]}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mv-qty">Quantidade ({item.unit})</label>
          <input id="mv-qty" className="field" inputMode="numeric" value={f.quantity} onChange={(e) => set("quantity", digits(e.target.value))} required />
        </div>
        <div>
          <label className="label" htmlFor="mv-day">Data</label>
          <input id="mv-day" type="date" className="field" value={f.day} max={today} onChange={(e) => set("day", e.target.value)} required />
        </div>
        {kind !== "loss" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mv-cp">{kind === "in" ? "Origem" : kind === "out" ? "Destino (ação, degustação, para quem)" : "De onde voltou (opcional)"}</label>
            <input id="mv-cp" className="field" value={f.counterpart} onChange={(e) => set("counterpart", e.target.value)} placeholder={kind === "in" ? "Ex.: Recebido do cliente" : "Ex.: Degustação Itaúna"} required={kind !== "return"} />
          </div>
        )}
        {kind === "in" && (
          <div>
            <label className="label" htmlFor="mv-ref">NF / romaneio (opcional)</label>
            <input id="mv-ref" className="field" value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </div>
        )}
        {(kind === "in" || kind === "return") && item.tracksExpiry && (
          <>
            <div>
              <label className="label" htmlFor="mv-lot">Lote</label>
              <input id="mv-lot" className="field" value={f.lot} onChange={(e) => set("lot", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mv-exp">Validade</label>
              <input id="mv-exp" type="date" className="field" value={f.expiresOn} onChange={(e) => set("expiresOn", e.target.value)} required={kind === "in"} />
            </div>
          </>
        )}
        {leaving && item.tracksExpiry && item.lots.length > 0 && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mv-lots">Lote</label>
            <select id="mv-lots" className="field" value={f.lotKey} onChange={(e) => set("lotKey", e.target.value)}>
              <option value="">Automático — sai primeiro o que vence antes</option>
              {item.lots.map((l) => {
                const key = `${l.lot ?? ""}|${l.expiresOn ?? ""}`;
                return <option key={key} value={key}>{l.lot ?? "Sem lote"} · vence {formatBr(l.expiresOn)} · {l.quantity} {item.unit}</option>;
              })}
            </select>
          </div>
        )}
        {kind === "out" && (
          <>
            <div>
              <label className="label" htmlFor="mv-city">Cidade</label>
              <input id="mv-city" className="field" value={f.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mv-store">Loja</label>
              <input id="mv-store" className="field" value={f.store} onChange={(e) => set("store", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="mv-prom">Promotor</label>
              <input id="mv-prom" className="field" value={f.promoter} onChange={(e) => set("promoter", e.target.value)} />
            </div>
          </>
        )}
        {kind === "loss" && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="mv-reason">Motivo da perda</label>
            <input id="mv-reason" className="field" value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Ex.: venceu, embalagem danificada" required />
          </div>
        )}
      </div>
      {over && <p className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">O saldo é de {item.balance} {item.unit}; não dá para tirar {quantity}. Se a contagem física for outra, registre uma contagem.</p>}
      {message}
      <button className="btn-primary" disabled={pending || over}>Registrar {MOVEMENT_LABEL[kind].toLowerCase()}</button>
    </form>
  );
}

export function CountForm({ itemId, unit, balance, canManage }: { itemId: string; unit: string; balance: number; canManage: boolean }) {
  const { run, pending, message } = useRun();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const diff = counted === "" ? 0 : Number(counted) - balance;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordCountAction(itemId, Number(counted), note || null), () => { setCounted(""); setNote(""); });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="ct-n">Contado ({unit})</label>
          <input id="ct-n" className="field" inputMode="numeric" value={counted} onChange={(e) => setCounted(digits(e.target.value))} required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="ct-note">{diff !== 0 && canManage ? "Motivo da diferença (obrigatório)" : "Observação"}</label>
          <input id="ct-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} required={diff !== 0 && canManage} />
        </div>
      </div>
      {counted !== "" && (
        <p className={diff === 0 ? "text-xs text-ok" : "text-xs font-semibold text-warn"}>
          {diff === 0 ? "Bate com o sistema." : `Diferença de ${diff > 0 ? "+" : ""}${diff} ${unit} em relação ao sistema (${balance}). ${canManage ? "Vira um ajuste de inventário." : "O gestor aprova o ajuste."}`}
        </p>
      )}
      {message}
      <button className="btn-ghost" disabled={pending}>Registrar contagem</button>
    </form>
  );
}

export function PendingCount({ count }: { count: { id: string; itemName: string; unit: string; counted: number; balanceAtCount: number; note: string | null; userName: string } }) {
  const { run, pending, message } = useRun();
  const [reason, setReason] = useState(count.note ?? "");
  const diff = count.counted - count.balanceAtCount;
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold text-ink">
        {count.itemName}: contado {count.counted} {count.unit} <span className="font-normal text-muted">(sistema tinha {count.balanceAtCount}; diferença {diff > 0 ? "+" : ""}{diff})</span>
      </p>
      <p className="text-xs text-muted">Contagem de {count.userName}</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor={`pc-${count.id}`}>Motivo do ajuste</label>
          <input id={`pc-${count.id}`} className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => decideCountAction(count.id, true, reason || null))}>Aprovar ajuste</button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => decideCountAction(count.id, false, null))}>Descartar</button>
      </div>
      <div className="mt-2">{message}</div>
    </li>
  );
}

export function UnitRow({ unit, today, canManage }: { unit: { id: string; label: string; status: UnitStatus; holder: string | null; dueBack: string | null }; today: string; canManage: boolean }) {
  const { run, pending, message } = useRun();
  const [holder, setHolder] = useState("");
  const [dueBack, setDueBack] = useState(addDays(today, 3));
  const late = unit.status === "in_use" && !!unit.dueBack && unit.dueBack < today;
  return (
    <li className="rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold text-ink">
        {unit.label}{" "}
        <span className={late ? "ml-1 rounded-full bg-bad-bg px-2 py-0.5 text-xs font-semibold text-bad" : unit.status === "available" ? "ml-1 rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok" : "ml-1 rounded-full bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn"}>
          {late ? "Devolução atrasada" : UNIT_STATUS_LABEL[unit.status]}
        </span>
      </p>
      {unit.status === "in_use" && <p className="text-xs text-muted">Com {unit.holder} até {formatBr(unit.dueBack)}</p>}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {unit.status === "available" && (
          <>
            <div className="min-w-32 flex-1">
              <label className="label" htmlFor={`un-h-${unit.id}`}>Com quem vai ficar</label>
              <input id={`un-h-${unit.id}`} className="field" value={holder} onChange={(e) => setHolder(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`un-d-${unit.id}`}>Devolve até</label>
              <input id={`un-d-${unit.id}`} type="date" className="field" value={dueBack} min={today} onChange={(e) => setDueBack(e.target.value)} />
            </div>
            <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setUnitStatusAction(unit.id, { status: "in_use", holder, dueBack }), () => setHolder(""))}>Registrar saída</button>
            {canManage && <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setUnitStatusAction(unit.id, { status: "maintenance" }))}>Manutenção</button>}
          </>
        )}
        {unit.status === "in_use" && <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => setUnitStatusAction(unit.id, { status: "available" }))}>Registrar devolução</button>}
        {unit.status === "maintenance" && canManage && <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setUnitStatusAction(unit.id, { status: "available" }))}>Voltou da manutenção</button>}
      </div>
      <div className="mt-2">{message}</div>
    </li>
  );
}

export function AddUnit({ itemId }: { itemId: string }) {
  const { run, pending, message } = useRun();
  const [label, setLabel] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addStockUnitAction(itemId, label), () => setLabel(""));
      }}
    >
      <div className="min-w-40 flex-1">
        <label className="label" htmlFor={`au-${itemId}`}>Nova unidade</label>
        <input id={`au-${itemId}`} className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Garrafa térmica 1" required minLength={2} />
      </div>
      <button className="btn-ghost" disabled={pending}>Adicionar</button>
      <div className="w-full">{message}</div>
    </form>
  );
}

export function InventoryDayForm({ day }: { day: number }) {
  const { run, pending, message } = useRun();
  const [value, setValue] = useState(String(day));
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setInventoryDayAction(Number(value)));
      }}
    >
      <div className="w-56">
        <label className="label" htmlFor="inv-day">Dia da contagem mensal (0 desliga)</label>
        <input id="inv-day" className="field" inputMode="numeric" value={value} onChange={(e) => setValue(digits(e.target.value).slice(0, 2))} required />
      </div>
      <button className="btn-ghost" disabled={pending}>Salvar</button>
      <div className="w-full">{message}</div>
    </form>
  );
}

export function PrintButton() {
  return <button type="button" className="btn-primary" onClick={() => window.print()}>Imprimir ou salvar em PDF</button>;
}
