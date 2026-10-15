"use client";

/**
 * Tudo do produto numa tela só (o promotor não volta duas vezes ao mesmo item):
 *   1. Está em ruptura (gôndola vazia)?
 *   2. Se não: quantidade na ÁREA DE VENDAS e as validades dela (pode haver
 *      várias datas diferentes no mesmo produto — sortido);
 *   3. Validades no ESTOQUE (também várias);
 *   4. Preço do KG (quando há validade).
 * Funciona sem sinal: grava no celular e sincroniza depois.
 */
import { useState } from "react";
import { PackageCheck, PackageX, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui";
import type { ItemUnit, ValidityLocation } from "@/lib/domain";
import { daysBetween } from "@/lib/dates";
import type { BootstrapProduct } from "@/lib/sync-types";
import { classify, DEFAULT_BANDS, describeDays, formatIsoBr, isoToDigits, maskExpiryDigits, parseExpiryDigits } from "@/lib/validity";
import { deleteValidity, saveStock, saveValidity, toggleRupture, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic, useCatalog } from "../_lib/hooks";
import { Sheet, toast } from "./primitives";
import { FieldLabel, moneyDigitsToNumber, numberToMoneyDigits, PriceField, QuantityField, SeverityPill, unitsFor } from "./item-fields";

interface Entry {
  id: string;
  location: ValidityLocation;
  digits: string;
  qty: string;
  unit: ItemUnit;
  /** Já existia (para saber o que apagar ao salvar). */
  saved: boolean;
}

export function ProductSheet({ visitId, visitDate, attendance, product, onClose }: { visitId: string; visitDate: string; attendance: LocalAttendance; product: BootstrapProduct; onClose: () => void }) {
  const { settings } = useCatalog();
  const bands = settings?.validityBands ?? DEFAULT_BANDS;
  const stock = attendance.stock[product.id];
  const hasRupture = Object.values(attendance.ruptures).some((r) => r.productId === product.id);
  const existing = Object.values(attendance.validities ?? {}).filter((v) => v.productId === product.id);
  const [rupture, setRupture] = useState<boolean | null>(hasRupture ? true : stock ? false : null);
  const [qty, setQty] = useState(stock?.state === "quantity" && stock.quantity !== null ? String(stock.quantity) : "");
  const [unit, setUnit] = useState<ItemUnit>(stock?.unit === "cx" ? "cx" : "un");
  const [entries, setEntries] = useState<Entry[]>(() => existing.map((v) => ({ id: v.id, location: v.location, digits: isoToDigits(v.expiryDate), qty: String(v.quantity), unit: v.unit === "cx" ? "cx" : "un", saved: true })));
  const [price, setPrice] = useState(numberToMoneyDigits(existing.find((v) => v.price !== null)?.price));
  const [busy, setBusy] = useState(false);

  const add = (location: ValidityLocation) => setEntries((e) => [...e, { id: uuid(), location, digits: "", qty: "", unit: "un", saved: false }]);
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
  const needsQty = rupture === false && qty === "";
  const ready = rupture !== null && !needsQty && !incomplete.length && !needsPrice;

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
      onClose();
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
              <div key={e.id} className="rounded-xl border border-line-strong p-2.5">
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
                <div className="flex items-center gap-2 mt-2">
                  <div className="grid grid-cols-2 gap-1 w-40" role="radiogroup" aria-label="Unidade">
                    {unitsFor(product).map((u) => (
                      <button
                        key={u}
                        type="button"
                        role="radio"
                        aria-checked={e.unit === u}
                        onClick={() => patch(e.id, { unit: u })}
                        className={clsx("h-8 rounded-lg border text-[12px] font-bold", e.unit === u ? "bg-brand-800 text-white border-brand-800" : "border-line-strong text-ink-2")}
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
          <button type="button" onClick={() => add(location)} className="w-full h-11 rounded-xl border border-dashed border-line-strong text-[13.5px] font-semibold text-ink-2 inline-flex items-center justify-center gap-1.5">
            <Plus className="size-4" /> {list.length ? "Outra validade" : "Adicionar validade"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span>
          <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted">Estoque, ruptura e validade</span>
          <span className="block leading-snug">{product.name}</span>
        </span>
      }
      footer={
        <Button size="xl" className="w-full" disabled={!ready || busy} onClick={() => void save()}>
          Salvar produto
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel>Está em ruptura (gôndola vazia)?</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRupture(false)}
              className={clsx("h-14 rounded-xl border-2 font-bold text-[15px] inline-flex items-center justify-center gap-2", rupture === false ? "bg-ok border-ok text-white" : "border-line-strong text-ink-2")}
            >
              <PackageCheck className="size-5" /> NÃO
            </button>
            <button
              type="button"
              onClick={() => setRupture(true)}
              className={clsx("h-14 rounded-xl border-2 font-bold text-[15px] inline-flex items-center justify-center gap-2", rupture === true ? "bg-bad border-bad text-white" : "border-bad/40 text-bad")}
            >
              <PackageX className="size-5" /> SIM, RUPTURA
            </button>
          </div>
        </div>

        {rupture === false ? (
          <>
            <QuantityField value={qty} onChange={setQty} unit={unit} onUnit={setUnit} units={unitsFor(product)} />
            {section("sales_floor", "Validades na área de vendas", "uma linha por data")}
          </>
        ) : null}
        {rupture !== null ? section("stock", "Validades no estoque", "se houver produto no depósito") : null}
        {rupture !== null && active.length ? <PriceField digits={price} onChange={setPrice} /> : null}

        {rupture !== null && !ready ? (
          <p className="text-[12.5px] text-warn font-medium">
            {needsQty ? "Informe a quantidade na área de vendas. " : ""}
            {incomplete.length ? "Complete a data e a quantidade de cada validade (ou remova a linha). " : ""}
            {needsPrice ? "Informe o preço do KG." : ""}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
