"use client";

/**
 * Tudo do produto direto na lista (o promotor não abre outra tela):
 *   1. RUPTURA ou NÃO RUPTURA;
 *   2. Não ruptura: quantidade na ÁREA DE VENDAS e as validades dela (pode haver
 *      várias datas diferentes no mesmo produto — sortido);
 *   3. Validades no ESTOQUE (também várias; na ruptura também, se houver no depósito);
 *   4. Preço do KG (quando há validade).
 * Funciona sem sinal: grava no celular e sincroniza depois.
 */
import { useState } from "react";
import { MoreHorizontal, PackageCheck, PackageX, PencilLine, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import { STOCK_STATE_SHORT, STOCK_STATE_TONE, type ItemUnit, type StockState, type ValidityLocation } from "@/lib/domain";
import { daysBetween, fmtDate } from "@/lib/dates";
import type { BootstrapProduct } from "@/lib/sync-types";
import { classify, DEFAULT_BANDS, describeDays, formatIsoBr, isoToDigits, maskExpiryDigits, parseExpiryDigits } from "@/lib/validity";
import { deleteValidity, saveStock, saveValidity, toggleRupture, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic, useCatalog } from "../_lib/hooks";
import { toast } from "./primitives";
import { FieldLabel, moneyDigitsToNumber, numberToMoneyDigits, PriceField, QuantityField, SeverityPill, unitsFor } from "./item-fields";

interface Entry {
  id: string;
  location: ValidityLocation;
  digits: string;
  qty: string;
  unit: ItemUnit;
}

type Mode = "rupture" | "ok";

interface CardProps {
  visitId: string;
  visitDate: string;
  attendance: LocalAttendance;
  product: BootstrapProduct;
  prev: { state: string; quantity: number | null; unit?: string; date: string } | undefined;
  editable: boolean;
  /** Outras situações (estoque zero, não encontrado, não se aplica). */
  onMore: () => void;
}

/** Cartão do produto na lista de estoque: ruptura/não ruptura e os campos logo abaixo. */
export function ProductCard({ visitId, visitDate, attendance, product: p, prev, editable, onMore }: CardProps) {
  const stock = attendance.stock[p.id];
  const hasRupture = Object.values(attendance.ruptures).some((r) => r.productId === p.id);
  const validities = Object.values(attendance.validities ?? {}).filter((v) => v.productId === p.id);
  const otherState = stock && stock.state !== "quantity" && stock.state !== "zero" ? stock.state : null;
  const savedMode: Mode | null = hasRupture ? "rupture" : stock && !otherState ? "ok" : null;
  // Aberto: produto ainda sem resposta ou o promotor tocou em editar.
  const [editing, setEditing] = useState<Mode | null>(null);
  const mode = editing ?? savedMode;

  async function markRupture() {
    if (!hasRupture) await toggleRupture(visitId, attendance.id, p.id);
    await saveStock(visitId, attendance.id, { productId: p.id, state: "zero", quantity: 0, unit: stock?.unit === "cx" ? "cx" : "un", note: stock?.note ?? null, recordedAt: new Date().toISOString() });
    // Gôndola vazia: validades da área de vendas não valem mais.
    for (const v of validities) if (v.location === "sales_floor") await deleteValidity(visitId, attendance.id, v.id);
    haptic(25);
    toast(`Ruptura: ${p.name}`, "warn");
    setEditing(null);
  }

  const salesQty = stock?.state === "quantity" ? stock.quantity : stock?.state === "zero" ? 0 : null;
  const summary =
    savedMode === "rupture"
      ? validities.length
        ? `Ruptura · ${validities.length} validade(s) no estoque`
        : "Ruptura · sem produto na gôndola"
      : savedMode === "ok"
        ? [`${salesQty ?? 0} ${stock?.unit === "cx" ? "CX" : "UN"} na área de vendas`, validities.length ? `${validities.length} validade(s)` : "sem validade"].join(" · ")
        : null;

  return (
    <div className={clsx("px-4 py-3", savedMode === "rupture" && editing === null && "bg-bad-bg/40")}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold leading-snug">{p.name}</p>
          <p className="text-[12px] text-muted mt-0.5">
            SKU {p.sku}
            {p.package ? ` · ${p.package}` : ""}
            {prev ? ` · última: ${prev.state === "quantity" ? `${prev.quantity} ${prev.unit ?? p.unit}` : (STOCK_STATE_SHORT[prev.state as StockState] ?? "—")} (${fmtDate(prev.date).slice(0, 5)})` : ""}
          </p>
        </div>
        {editable ? (
          <button type="button" onClick={onMore} aria-label="Outras situações" className="size-9 -mr-2 grid place-items-center rounded-lg text-muted active:bg-canvas">
            <MoreHorizontal className="size-5" />
          </button>
        ) : null}
      </div>

      {otherState ? (
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge tone={STOCK_STATE_TONE[otherState]} size="sm">
            {STOCK_STATE_SHORT[otherState]}
          </StatusBadge>
          {editable ? (
            <button type="button" onClick={onMore} className="text-[13px] font-semibold text-brand-700">
              alterar
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-2.5" role="radiogroup" aria-label={`Situação de ${p.name}`}>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "rupture"}
              disabled={!editable}
              onClick={() => void markRupture()}
              className={clsx("h-12 rounded-xl border-2 font-bold text-[14px] inline-flex items-center justify-center gap-1.5", mode === "rupture" ? "bg-bad border-bad text-white" : "border-bad/40 text-bad bg-surface")}
            >
              <PackageX className="size-4" /> RUPTURA
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "ok"}
              disabled={!editable}
              onClick={() => setEditing("ok")}
              className={clsx("h-12 rounded-xl border-2 font-bold text-[14px] inline-flex items-center justify-center gap-1.5", mode === "ok" ? "bg-ok border-ok text-white" : "border-line-strong text-ink-2 bg-surface")}
            >
              <PackageCheck className="size-4" /> NÃO RUPTURA
            </button>
          </div>

          {editing ? (
            <ProductForm visitId={visitId} visitDate={visitDate} attendance={attendance} product={p} mode={editing} onDone={() => setEditing(null)} />
          ) : summary ? (
            <div className="mt-2 flex items-center gap-2 text-[13px]">
              <span className={clsx("flex-1 min-w-0", savedMode === "rupture" ? "text-bad font-medium" : "text-ink-2")}>{summary}</span>
              {editable ? (
                <button type="button" onClick={() => setEditing(savedMode)} className="shrink-0 inline-flex items-center gap-1 font-semibold text-brand-700">
                  <PencilLine className="size-3.5" /> {savedMode === "rupture" ? "validade do estoque" : "editar"}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Campos do produto (abertos dentro do cartão). Salvar fecha o cartão com o resumo. */
function ProductForm({ visitId, visitDate, attendance, product, mode, onDone }: { visitId: string; visitDate: string; attendance: LocalAttendance; product: BootstrapProduct; mode: Mode; onDone: () => void }) {
  const { settings } = useCatalog();
  const bands = settings?.validityBands ?? DEFAULT_BANDS;
  const stock = attendance.stock[product.id];
  const hasRupture = Object.values(attendance.ruptures).some((r) => r.productId === product.id);
  const existing = Object.values(attendance.validities ?? {}).filter((v) => v.productId === product.id);
  const rupture = mode === "rupture";
  const [qty, setQty] = useState(stock?.state === "quantity" && stock.quantity !== null ? String(stock.quantity) : "");
  const [unit, setUnit] = useState<ItemUnit>(stock?.unit === "cx" ? "cx" : "un");
  const [entries, setEntries] = useState<Entry[]>(() => existing.map((v) => ({ id: v.id, location: v.location, digits: isoToDigits(v.expiryDate), qty: String(v.quantity), unit: v.unit === "cx" ? "cx" : "un" })));
  const [price, setPrice] = useState(numberToMoneyDigits(existing.find((v) => v.price !== null)?.price));
  const [busy, setBusy] = useState(false);

  const add = (location: ValidityLocation) => setEntries((e) => [...e, { id: uuid(), location, digits: "", qty: "", unit: "un" }]);
  const patch = (id: string, p: Partial<Entry>) => setEntries((e) => e.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => setEntries((e) => e.filter((x) => x.id !== id));

  const parsed = entries.map((e) => {
    const r = e.digits ? parseExpiryDigits(e.digits, visitDate) : null;
    return { e, iso: r?.ok ? r.iso : null, qty: Number(e.qty) };
  });
  // Na ruptura, a área de vendas não conta (gôndola vazia): só o estoque.
  const active = parsed.filter((x) => !(rupture && x.e.location === "sales_floor"));
  const incomplete = active.filter((x) => !x.iso || !(x.qty > 0));
  const priceNum = moneyDigitsToNumber(price);
  const needsPrice = active.length > 0 && !(priceNum && priceNum > 0);
  const needsQty = !rupture && qty === "";
  const ready = !needsQty && !incomplete.length && !needsPrice;

  async function save() {
    if (!ready) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (rupture) {
        if (!hasRupture) await toggleRupture(visitId, attendance.id, product.id);
        await saveStock(visitId, attendance.id, { productId: product.id, state: "zero", quantity: 0, unit, note: stock?.note ?? null, recordedAt: now });
      } else {
        if (hasRupture) await toggleRupture(visitId, attendance.id, product.id);
        const n = Number(qty);
        await saveStock(visitId, attendance.id, { productId: product.id, state: n === 0 ? "zero" : "quantity", quantity: n, unit, note: stock?.note ?? null, recordedAt: now });
      }
      const keep = new Set(active.map((x) => x.e.id));
      for (const v of existing) if (!keep.has(v.id)) await deleteValidity(visitId, attendance.id, v.id);
      for (const x of active) {
        const before = existing.find((v) => v.id === x.e.id);
        await saveValidity(visitId, attendance.id, {
          id: x.e.id,
          productId: product.id,
          location: x.e.location,
          quantity: x.qty,
          unit: x.e.unit,
          expiryDate: x.iso!,
          lot: before?.lot ?? null,
          price: priceNum,
          note: before?.note ?? null,
          recordedAt: before?.recordedAt ?? now,
        });
      }
      haptic(20);
      toast(rupture ? `Ruptura: ${product.name}` : "Produto salvo.", rupture ? "warn" : "ok");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const section = (location: ValidityLocation, title: string, hint: string) => {
    const list = parsed.filter((x) => x.e.location === location);
    return (
      <div>
        <FieldLabel hint={hint}>{title}</FieldLabel>
        <div className="space-y-2">
          {list.map(({ e, iso }) => {
            const days = iso ? daysBetween(visitDate, iso) : null;
            return (
              <div key={e.id} className="rounded-xl border border-line-strong p-2.5 bg-surface">
                <div className="flex items-center gap-2">
                  <input
                    value={maskExpiryDigits(e.digits)}
                    onChange={(ev) => patch(e.id, { digits: ev.target.value.replace(/\D/g, "").slice(0, 8) })}
                    inputMode="numeric"
                    placeholder="Validade DD/MM"
                    aria-label="Validade"
                    className="flex-1 min-w-0 h-12 rounded-lg border border-line-strong px-2.5 text-[18px] font-semibold tnum focus:border-brand-600 focus:outline-none"
                  />
                  <input
                    value={e.qty}
                    onChange={(ev) => patch(e.id, { qty: ev.target.value.replace(/\D/g, "").slice(0, 6) })}
                    inputMode="numeric"
                    placeholder="Qtd."
                    aria-label="Quantidade com esta validade"
                    className="w-20 h-12 rounded-lg border border-line-strong px-2 text-center text-[18px] font-semibold tnum focus:border-brand-600 focus:outline-none"
                  />
                  <button type="button" onClick={() => remove(e.id)} aria-label="Remover validade" className="size-10 grid place-items-center text-bad shrink-0">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Unidade">
                    {unitsFor(product).map((u) => (
                      <button
                        key={u}
                        type="button"
                        role="radio"
                        aria-checked={e.unit === u}
                        onClick={() => patch(e.id, { unit: u })}
                        className={clsx("h-9 rounded-lg border text-[12.5px] font-bold", e.unit === u ? "bg-brand-800 text-white border-brand-800" : "border-line-strong text-ink-2")}
                      >
                        {u === "un" ? "UNIDADE" : "CAIXA"}
                      </button>
                    ))}
                  </div>
                  {iso && days !== null ? (
                    <span className="flex items-center gap-1.5 text-[12px] text-ink-2 tnum">
                      <SeverityPill severity={classify(days, bands)} /> {formatIsoBr(iso, false)} · {describeDays(days)}
                    </span>
                  ) : e.digits ? (
                    <span className="text-[12px] text-warn font-medium">Data incompleta ou inválida</span>
                  ) : null}
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => add(location)} className="w-full h-11 rounded-xl border border-dashed border-line-strong bg-surface text-[13.5px] font-semibold text-ink-2 inline-flex items-center justify-center gap-1.5">
            <Plus className="size-4" /> {list.length ? "Outra validade" : "Adicionar validade"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-3 space-y-4 rounded-2xl bg-canvas p-3">
      {!rupture ? (
        <>
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wide text-ink-2 mb-1">Área de vendas</p>
            <QuantityField value={qty} onChange={setQty} unit={unit} onUnit={setUnit} units={unitsFor(product)} />
          </div>
          {section("sales_floor", "Validades na área de vendas", "uma linha por data")}
        </>
      ) : null}
      {section("stock", "Validades no estoque", rupture ? "se houver produto no depósito" : "uma linha por data")}
      {active.length ? <PriceField digits={price} onChange={setPrice} /> : null}

      {!ready ? (
        <p className="text-[12.5px] text-warn font-medium">
          {needsQty ? "Informe a quantidade na área de vendas. " : ""}
          {incomplete.length ? "Complete a data e a quantidade de cada validade (ou remova a linha). " : ""}
          {needsPrice ? "Informe o preço do KG." : ""}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="secondary" className="!h-12" onClick={onDone}>
          Cancelar
        </Button>
        <Button className="flex-1 !h-12" disabled={!ready || busy} onClick={() => void save()}>
          Salvar produto
        </Button>
      </div>
    </div>
  );
}
