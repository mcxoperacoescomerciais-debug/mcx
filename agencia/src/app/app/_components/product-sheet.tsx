"use client";

/**
 * Produto na lista de estoque: três botões, nenhum obrigatório.
 *   1. RUPTURA — um toque marca, outro desfaz;
 *   2. INFORMAR ÁREA DE VENDAS — quantidade, validades da área de vendas e preço;
 *   3. INFORMAR ESTOQUE — quantidade por validade no estoque (depósito) e preço.
 * Sem nada para informar, o promotor não toca em nada e segue para o próximo produto.
 * A ruptura esconde só a área de vendas (gôndola vazia); o estoque continua disponível.
 * O preço é um só por produto: informado numa folha, aparece na outra.
 * Funciona sem sinal: grava no celular e sincroniza depois.
 */
import { useState } from "react";
import { Check, PackageX, Plus, ShoppingCart, Trash2, Warehouse } from "lucide-react";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import { STOCK_STATE_SHORT, STOCK_STATE_TONE, type ItemUnit, type StockState, type ValidityLocation } from "@/lib/domain";
import { daysBetween, fmtDate } from "@/lib/dates";
import type { BootstrapProduct } from "@/lib/sync-types";
import { classify, DEFAULT_BANDS, describeDays, formatIsoBr, isoToDigits, maskExpiryDigits, parseExpiryDigits } from "@/lib/validity";
import { clearStock, deleteValidity, saveStock, saveValidity, toggleRupture, uuid, type LocalAttendance } from "../_lib/local-store";
import { productPrice, stockSummary } from "../_lib/stock-summary";
import { haptic, useCatalog } from "../_lib/hooks";
import { Sheet, toast } from "./primitives";
import { FieldLabel, moneyDigitsToNumber, numberToMoneyDigits, PriceField, QuantityField, SeverityPill, unitsFor } from "./item-fields";

interface Entry {
  id: string;
  digits: string;
  qty: string;
  unit: ItemUnit;
}

interface CardProps {
  visitId: string;
  visitDate: string;
  attendance: LocalAttendance;
  product: BootstrapProduct;
  prev: { state: string; quantity: number | null; unit?: string; date: string } | undefined;
  editable: boolean;
}

/**
 * Marca o produto em ruptura (gôndola vazia): ruptura + estoque zero na área de
 * vendas, e as validades da área de vendas deixam de valer. O preço já informado fica.
 */
export async function markProductRupture(visitId: string, attendance: LocalAttendance, productId: string) {
  const stock = attendance.stock[productId];
  if (!Object.values(attendance.ruptures).some((r) => r.productId === productId)) await toggleRupture(visitId, attendance.id, productId);
  await saveStock(visitId, attendance.id, { productId, state: "zero", quantity: 0, unit: stock?.unit === "cx" ? "cx" : "un", note: stock?.note ?? null, price: productPrice(attendance, productId), recordedAt: new Date().toISOString() });
  for (const v of Object.values(attendance.validities ?? {})) if (v.productId === productId && v.location === "sales_floor") await deleteValidity(visitId, attendance.id, v.id);
}

/** Desfaz a ruptura: o produto volta a ficar sem informação na área de vendas. */
export async function unmarkProductRupture(visitId: string, attendance: LocalAttendance, productId: string) {
  if (Object.values(attendance.ruptures).some((r) => r.productId === productId)) await toggleRupture(visitId, attendance.id, productId);
  if (attendance.stock[productId]) await clearStock(visitId, attendance.id, productId);
}

const bigButton = "min-h-12 rounded-xl border-2 px-2 py-2 font-bold text-[13.5px] leading-tight inline-flex items-center justify-center gap-1.5 text-center disabled:opacity-60";

/** Cartão do produto na lista de estoque. */
export function ProductCard({ visitId, visitDate, attendance, product: p, prev, editable }: CardProps) {
  const [sheet, setSheet] = useState<ValidityLocation | null>(null);
  const stock = attendance.stock[p.id];
  const sum = stockSummary(attendance, p.id);
  const otherState = stock && stock.state !== "quantity" && stock.state !== "zero" ? stock.state : null;

  async function onRupture() {
    if (sum.rupture) {
      await unmarkProductRupture(visitId, attendance, p.id);
      haptic(10);
      toast("Ruptura desfeita.");
    } else {
      await markProductRupture(visitId, attendance, p.id);
      haptic(25);
      toast(`Ruptura: ${p.name}`, "warn");
    }
  }

  return (
    <div id={`produto-${p.id}`} className={clsx("px-4 py-3 scroll-mt-32", sum.rupture && "bg-bad-bg/40")}>
      <p className="text-[15px] font-semibold leading-snug">{p.name}</p>
      <p className="text-[12px] text-muted mt-0.5">
        SKU {p.sku}
        {p.package ? ` · ${p.package}` : ""}
        {prev ? ` · última: ${prev.state === "quantity" ? `${prev.quantity} ${prev.unit ?? p.unit}` : (STOCK_STATE_SHORT[prev.state as StockState] ?? "—")} (${fmtDate(prev.date).slice(0, 5)})` : ""}
      </p>

      {otherState ? (
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge tone={STOCK_STATE_TONE[otherState]} size="sm">
            {STOCK_STATE_SHORT[otherState]}
          </StatusBadge>
          {editable ? (
            <button type="button" onClick={() => void clearStock(visitId, attendance.id, p.id)} className="text-[13px] font-semibold text-brand-700">
              limpar
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2.5 space-y-2">
          <button
            type="button"
            aria-pressed={sum.rupture}
            disabled={!editable}
            onClick={() => void onRupture()}
            className={clsx(bigButton, "w-full", sum.rupture ? "bg-bad border-bad text-white" : "border-bad/40 text-bad bg-surface")}
          >
            <PackageX className="size-4 shrink-0" /> {sum.rupture ? "RUPTURA MARCADA" : "RUPTURA"}
          </button>
          {sum.rupture && editable ? <p className="text-[12px] text-muted text-center">Toque de novo para desfazer.</p> : null}
          <div className={clsx("grid gap-2", sum.rupture ? "grid-cols-1" : "grid-cols-2")}>
            {!sum.rupture ? (
              <button
                type="button"
                disabled={!editable}
                onClick={() => setSheet("sales_floor")}
                className={clsx(bigButton, sum.sales ? "bg-ok-bg border-ok text-ok" : "border-line-strong text-ink-2 bg-surface")}
              >
                {sum.sales ? <Check className="size-4 shrink-0" /> : <ShoppingCart className="size-4 shrink-0" />}
                {sum.sales ? `Área de vendas: ${sum.sales}` : "INFORMAR ÁREA DE VENDAS"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!editable}
              onClick={() => setSheet("stock")}
              className={clsx(bigButton, sum.stock ? "bg-ok-bg border-ok text-ok" : "border-line-strong text-ink-2 bg-surface")}
            >
              {sum.stock ? <Check className="size-4 shrink-0" /> : <Warehouse className="size-4 shrink-0" />}
              {sum.stock ? `Estoque: ${sum.stock}` : "INFORMAR ESTOQUE"}
            </button>
          </div>
        </div>
      )}

      {sheet ? <LocationSheet visitId={visitId} visitDate={visitDate} attendance={attendance} product={p} location={sheet} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

/** Folha de uma das duas áreas (área de vendas ou estoque): quantidade, validades e preço. */
function LocationSheet({ visitId, visitDate, attendance, product, location, onClose }: { visitId: string; visitDate: string; attendance: LocalAttendance; product: BootstrapProduct; location: ValidityLocation; onClose: () => void }) {
  const { settings } = useCatalog();
  const bands = settings?.validityBands ?? DEFAULT_BANDS;
  const sales = location === "sales_floor";
  const stock = attendance.stock[product.id];
  const allValidities = Object.values(attendance.validities ?? {}).filter((v) => v.productId === product.id);
  const existing = allValidities.filter((v) => v.location === location);
  const hadSales = Boolean(stock && (stock.state === "quantity" || stock.state === "zero"));
  const [qty, setQty] = useState(stock?.state === "quantity" && stock.quantity !== null ? String(stock.quantity) : stock?.state === "zero" ? "0" : "");
  const [unit, setUnit] = useState<ItemUnit>(stock?.unit === "cx" ? "cx" : "un");
  const [entries, setEntries] = useState<Entry[]>(() => {
    const saved = existing.map((v) => ({ id: v.id, digits: isoToDigits(v.expiryDate), qty: String(v.quantity), unit: (v.unit === "cx" ? "cx" : "un") as ItemUnit }));
    // No estoque a quantidade vai junto da validade: já abre com uma linha pronta.
    return saved.length || sales ? saved : [{ id: uuid(), digits: "", qty: "", unit: "un" }];
  });
  const [price, setPrice] = useState(numberToMoneyDigits(productPrice(attendance, product.id)));
  const [busy, setBusy] = useState(false);

  const add = () => setEntries((e) => [...e, { id: uuid(), digits: "", qty: "", unit: "un" }]);
  const patch = (id: string, p: Partial<Entry>) => setEntries((e) => e.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const remove = (id: string) => setEntries((e) => e.filter((x) => x.id !== id));

  // Linha em branco não conta (o promotor abriu e não preencheu).
  const filled = entries.filter((e) => e.digits || e.qty);
  const parsed = filled.map((e) => {
    const r = e.digits ? parseExpiryDigits(e.digits, visitDate) : null;
    return { e, iso: r?.ok ? r.iso : null, qty: Number(e.qty) };
  });
  const incomplete = parsed.filter((x) => !x.iso || !(x.qty > 0));
  const priceNum = moneyDigitsToNumber(price);
  const needsQty = sales && qty === "";
  const nothing = !sales && !parsed.length && !existing.length;
  // Com validade, o preço continua obrigatório (como já era); sem validade, é opcional.
  const needsPrice = parsed.length > 0 && !(priceNum && priceNum > 0);
  const ready = !needsQty && !incomplete.length && !nothing && !needsPrice;

  async function save() {
    if (!ready) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      if (sales) {
        const n = Number(qty);
        await saveStock(visitId, attendance.id, { productId: product.id, state: n === 0 ? "zero" : "quantity", quantity: n, unit, note: stock?.note ?? null, price: priceNum, recordedAt: now });
      } else if (stock) {
        // Mesmo preço do produto na contagem já gravada (área de vendas ou ruptura).
        await saveStock(visitId, attendance.id, { ...stock, price: priceNum });
      }
      const keep = new Set(parsed.map((x) => x.e.id));
      for (const v of existing) if (!keep.has(v.id)) await deleteValidity(visitId, attendance.id, v.id);
      for (const x of parsed) {
        const before = existing.find((v) => v.id === x.e.id);
        await saveValidity(visitId, attendance.id, {
          id: x.e.id,
          productId: product.id,
          location,
          quantity: x.qty,
          unit: x.e.unit,
          expiryDate: x.iso!,
          lot: before?.lot ?? null,
          price: priceNum,
          note: before?.note ?? null,
          recordedAt: before?.recordedAt ?? now,
        });
      }
      // Um preço por produto: as validades da outra área acompanham.
      if (priceNum !== null) for (const v of allValidities) if (v.location !== location && v.price !== priceNum) await saveValidity(visitId, attendance.id, { ...v, price: priceNum });
      haptic(20);
      toast(sales ? "Área de vendas salva." : "Estoque salvo.", "ok");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      for (const v of existing) await deleteValidity(visitId, attendance.id, v.id);
      if (sales && stock) await clearStock(visitId, attendance.id, product.id);
      toast("Informação removida.");
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const hasSaved = sales ? hadSales || existing.length > 0 : existing.length > 0;

  return (
    <Sheet
      open
      onClose={onClose}
      title={<span className="leading-snug">{sales ? "Área de vendas" : "Estoque"}</span>}
      footer={
        <Button size="xl" className="w-full" disabled={!ready || busy} onClick={() => void save()}>
          SALVAR
        </Button>
      }
    >
      <p className="text-[14px] font-semibold leading-snug">{product.name}</p>
      <p className="text-[12.5px] text-muted mb-4">{sales ? "O que está na gôndola, onde o cliente pega o produto." : "O que está guardado no depósito ou na câmara fria da loja."}</p>

      <div className="space-y-5">
        {sales ? <QuantityField value={qty} onChange={setQty} unit={unit} onUnit={setUnit} units={unitsFor(product)} /> : null}

        <div>
          <FieldLabel hint={sales ? "opcional · uma linha por data" : "uma linha por data"}>{sales ? "Validades" : "Quantidade e validade"}</FieldLabel>
          <div className="space-y-2">
            {entries.map((e) => {
              const r = e.digits ? parseExpiryDigits(e.digits, visitDate) : null;
              const iso = r?.ok ? r.iso : null;
              const days = iso ? daysBetween(visitDate, iso) : null;
              return (
                <div key={e.id} className="rounded-xl border border-line-strong p-2.5 bg-surface">
                  <div className="flex items-center gap-2">
                    <input
                      value={e.qty}
                      onChange={(ev) => patch(e.id, { qty: ev.target.value.replace(/\D/g, "").slice(0, 6) })}
                      inputMode="numeric"
                      placeholder="Qtd."
                      aria-label="Quantidade com esta validade"
                      className="w-20 h-12 rounded-lg border border-line-strong px-2 text-center text-[18px] font-semibold tnum focus:border-brand-600 focus:outline-none"
                    />
                    <input
                      value={maskExpiryDigits(e.digits)}
                      onChange={(ev) => patch(e.id, { digits: ev.target.value.replace(/\D/g, "").slice(0, 8) })}
                      inputMode="numeric"
                      placeholder="Validade DD/MM"
                      aria-label="Validade"
                      className="flex-1 min-w-0 h-12 rounded-lg border border-line-strong px-2.5 text-[18px] font-semibold tnum focus:border-brand-600 focus:outline-none"
                    />
                    <button type="button" onClick={() => remove(e.id)} aria-label="Remover linha" className="size-10 grid place-items-center text-bad shrink-0">
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
            <button type="button" onClick={add} className="w-full h-11 rounded-xl border border-dashed border-line-strong bg-surface text-[13.5px] font-semibold text-ink-2 inline-flex items-center justify-center gap-1.5">
              <Plus className="size-4" /> {entries.length ? "Outra validade" : "Adicionar validade"}
            </button>
          </div>
        </div>

        <PriceField digits={price} onChange={setPrice} label="Preço do produto (R$)" required={parsed.length > 0} />

        {!ready ? (
          <p className="text-[12.5px] text-warn font-medium">
            {needsQty ? "Informe a quantidade na área de vendas. " : ""}
            {incomplete.length ? "Complete a quantidade e a data de cada validade (ou remova a linha). " : ""}
            {nothing ? "Informe a quantidade e a validade do que está no estoque. " : ""}
            {needsPrice ? "Informe o preço do produto." : ""}
          </p>
        ) : null}

        {hasSaved ? (
          <button type="button" disabled={busy} onClick={() => void clear()} className="text-[13px] font-semibold text-muted">
            Limpar o que foi informado aqui
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
