"use client";

/**
 * Etapa Validade (modo SUINCO): o promotor escolhe o produto na lista completa
 * (com busca), digita a validade (0510), quantidade, preço e, se quiser, lote,
 * observação e foto. A classificação (Vencido, Crítico…) aparece na hora,
 * calculada sobre a data da visita e as faixas da agência — tudo sem internet.
 */
import { useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "@/components/ui";
import { VALIDITY_LOCATION_LABEL, VALIDITY_LOCATIONS, type ItemUnit, type ValidityLocation } from "@/lib/domain";
import { daysBetween } from "@/lib/dates";
import type { BootstrapBrand, BootstrapProduct, ValidityInput } from "@/lib/sync-types";
import { classify, DEFAULT_BANDS, describeDays, formatIsoBr } from "@/lib/validity";
import { deleteValidity, discardUnsavedPhotos, saveValidity, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic, useCatalog } from "../_lib/hooks";
import { Sheet, TextArea, toast } from "./primitives";
import { PhotoCapture } from "./photo-capture";
import { ExpiryField, expiryReady, FieldLabel, inputClass, ProductSearchList, QuantityField, SeverityPill, unitsFor, useExpiry } from "./item-fields";

interface Props {
  visitId: string;
  visitDate: string;
  attendance: LocalAttendance;
  brand: BootstrapBrand;
  products: BootstrapProduct[];
  editable: boolean;
}

export function ValidityStep({ visitId, visitDate, attendance, brand, products, editable }: Props) {
  const { productById, settings } = useCatalog();
  const bands = settings?.validityBands ?? DEFAULT_BANDS;
  const [location, setLocation] = useState<ValidityLocation>("sales_floor");
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ product: BootstrapProduct; item: ValidityInput | null } | null>(null);
  const all = Object.values(attendance.validities ?? {});
  const items = all
    .filter((v) => v.location === location)
    .map((v) => ({ v, days: daysBetween(visitDate, v.expiryDate) }))
    .sort((a, b) => a.days - b.days);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Validades</h2>
        <span className="text-[12px] text-muted">{all.length} registrada(s)</span>
      </div>
      <p className="text-[13px] text-muted mb-3">Registre os produtos com validade próxima ou vencida. Digite só os números da data (ex.: 0510).</p>

      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-canvas border border-line mb-3" role="tablist">
        {VALIDITY_LOCATIONS.map((l) => {
          const n = all.filter((v) => v.location === l).length;
          return (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={location === l}
              onClick={() => setLocation(l)}
              className={clsx("h-11 rounded-xl text-[14px] font-semibold", location === l ? "bg-surface shadow-sm text-ink" : "text-muted")}
            >
              {VALIDITY_LOCATION_LABEL[l]} {n ? <span className="tnum">({n})</span> : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {items.map(({ v, days }) => {
          const p = productById.get(v.productId);
          const photos = attendance.photos.filter((x) => x.validityId === v.id).length;
          return (
            <div key={v.id} className="bg-surface border border-line rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] leading-snug">{p?.name ?? "Produto"}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <SeverityPill severity={classify(days, bands)} />
                    <span className="text-[13px] text-ink-2 tnum">
                      {formatIsoBr(v.expiryDate)} · {describeDays(days)}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-muted mt-1 tnum">
                    {v.quantity} {v.unit}
                    {v.price !== null ? ` · R$ ${v.price.toFixed(2).replace(".", ",")}` : ""}
                    {v.lot ? ` · lote ${v.lot}` : ""}
                    {photos ? ` · ${photos} foto(s)` : ""}
                  </p>
                </div>
                {editable ? (
                  <div className="flex gap-1">
                    <button type="button" aria-label="Editar" onClick={() => p && setEditing({ product: p, item: v })} className="size-10 grid place-items-center rounded-xl text-ink-2 active:bg-canvas">
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      onClick={async () => {
                        await deleteValidity(visitId, attendance.id, v.id);
                        toast("Validade removida.");
                      }}
                      className="size-10 grid place-items-center rounded-xl text-bad active:bg-canvas"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {!items.length ? (
          <p className="text-[14px] text-muted bg-surface border border-line rounded-2xl p-4 flex items-center gap-2">
            <CalendarClock className="size-5 shrink-0" /> Nenhuma validade registrada em {VALIDITY_LOCATION_LABEL[location].toLowerCase()}.
          </p>
        ) : null}
      </div>

      {editable ? (
        <Button size="xl" className="w-full mt-4" onClick={() => setPicking(true)}>
          <Plus className="size-5" /> ADICIONAR VALIDADE · {VALIDITY_LOCATION_LABEL[location].toUpperCase()}
        </Button>
      ) : null}

      {picking ? (
        <Sheet open onClose={() => setPicking(false)} title={`Validade · ${VALIDITY_LOCATION_LABEL[location]}`}>
          <ProductSearchList
            products={products}
            onPick={(p) => {
              setPicking(false);
              setEditing({ product: p, item: null });
            }}
          />
        </Sheet>
      ) : null}

      {editing ? (
        <ValiditySheet
          key={editing.item?.id ?? editing.product.id}
          visitId={visitId}
          visitDate={visitDate}
          attendance={attendance}
          brand={brand}
          product={editing.product}
          item={editing.item}
          location={editing.item?.location ?? location}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function ValiditySheet({
  visitId,
  visitDate,
  attendance,
  brand,
  product,
  item,
  location,
  onClose,
}: {
  visitId: string;
  visitDate: string;
  attendance: LocalAttendance;
  brand: BootstrapBrand;
  product: BootstrapProduct;
  item: ValidityInput | null;
  location: ValidityLocation;
  onClose: () => void;
}) {
  const { settings } = useCatalog();
  const [id] = useState(item?.id ?? uuid());
  const expiry = useExpiry(item?.expiryDate, visitDate, settings?.validityBands);
  const units = unitsFor(product);
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "");
  const [unit, setUnit] = useState<ItemUnit>(item?.unit ?? (product.unit === "kg" ? "kg" : "un"));
  const [price, setPrice] = useState(item?.price !== null && item?.price !== undefined ? item.price.toFixed(2).replace(".", ",") : "");
  const [lot, setLot] = useState(item?.lot ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const photos = attendance.photos.filter((p) => p.validityId === id);
  const qty = Number(quantity);
  const priceNum = price.trim() ? Number(price.replace(/\./g, "").replace(",", ".")) : null;
  const priceInvalid = priceNum !== null && (!Number.isFinite(priceNum) || priceNum < 0);
  const ready = expiryReady(expiry, true) && qty > 0 && !priceInvalid;
  const cancel = async () => {
    if (!attendance.validities?.[id]) await discardUnsavedPhotos(visitId, attendance.id, { validityId: id });
    onClose();
  };

  async function save() {
    if (!ready || !expiry.iso) return;
    await saveValidity(visitId, attendance.id, {
      id,
      productId: product.id,
      location,
      quantity: qty,
      unit,
      expiryDate: expiry.iso,
      lot: lot.trim().toUpperCase() || null,
      price: priceNum,
      note: note.trim() || null,
      recordedAt: item?.recordedAt ?? new Date().toISOString(),
    });
    haptic(20);
    toast("Validade salva.");
    onClose();
  }

  return (
    <Sheet
      open
      onClose={() => void cancel()}
      title={
        <span>
          <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted">Validade · {VALIDITY_LOCATION_LABEL[location]}</span>
          <span className="block leading-snug">{product.name}</span>
        </span>
      }
      footer={
        <Button size="xl" className="w-full" disabled={!ready} onClick={() => void save()}>
          Salvar validade
        </Button>
      }
    >
      <div className="space-y-4">
        <ExpiryField expiry={expiry} required />
        <QuantityField value={quantity} onChange={setQuantity} unit={unit} onUnit={setUnit} units={units} />
        <label className="block">
          <FieldLabel hint="preço na gôndola">Preço (R$)</FieldLabel>
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, "").slice(0, 10))} inputMode="decimal" placeholder="0,00" className={clsx(inputClass, "tnum", priceInvalid && "!border-bad")} />
        </label>
        <label className="block">
          <FieldLabel hint="opcional">Lote</FieldLabel>
          <input value={lot} onChange={(e) => setLot(e.target.value.slice(0, 60))} className={clsx(inputClass, "uppercase")} />
        </label>
        <TextArea label="Observação (opcional)" value={note} onChange={setNote} rows={2} maxLength={300} />
        <PhotoCapture
          visitId={visitId}
          attendanceId={attendance.id}
          kind="validity"
          photos={photos}
          min={0}
          allowGallery={brand.allowGallery}
          editable
          title="Foto (opcional)"
          cta="FOTOGRAFAR O PRODUTO"
          link={{ validityId: id }}
          compact
        />
      </div>
    </Sheet>
  );
}
