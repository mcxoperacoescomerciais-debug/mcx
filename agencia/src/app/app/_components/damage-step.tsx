"use client";

/**
 * Etapa Avaria (modo SUINCO): produto da lista completa (com busca), tipo da
 * avaria, quantidade, validade e lote (opcionais) e FOTO OBRIGATÓRIA.
 */
import { useState } from "react";
import { Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import { DAMAGE_KIND_LABEL, DAMAGE_KINDS, type DamageKind, type ItemUnit } from "@/lib/domain";
import type { BootstrapBrand, BootstrapProduct, DamageInput } from "@/lib/sync-types";
import { formatIsoBr } from "@/lib/validity";
import { deleteDamage, discardUnsavedPhotos, saveDamage, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic, useCatalog } from "../_lib/hooks";
import { Chip, Notice, Sheet, TextArea, toast } from "./primitives";
import { PhotoCapture } from "./photo-capture";
import { ExpiryField, expiryReady, FieldLabel, inputClass, ProductSearchList, initialUnit, QuantityField, unitsFor, useExpiry } from "./item-fields";

interface Props {
  visitId: string;
  visitDate: string;
  attendance: LocalAttendance;
  brand: BootstrapBrand;
  products: BootstrapProduct[];
  editable: boolean;
}

export function DamageStep({ visitId, visitDate, attendance, brand, products, editable }: Props) {
  const { productById } = useCatalog();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<{ product: BootstrapProduct; item: DamageInput | null } | null>(null);
  const items = Object.values(attendance.damages ?? {});

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Avarias</h2>
        <span className="text-[12px] text-muted">{items.length} registrada(s)</span>
      </div>
      <p className="text-[13px] text-muted mb-3">Produto danificado ou impróprio. Toda avaria precisa de foto.</p>

      <div className="space-y-2">
        {items.map((d) => {
          const p = productById.get(d.productId);
          const photos = attendance.photos.filter((x) => x.damageId === d.id).length;
          return (
            <div key={d.id} className="bg-surface border border-line rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] leading-snug">{p?.name ?? "Produto"}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <StatusBadge tone="danger" size="sm">
                      {DAMAGE_KIND_LABEL[d.kind]}
                    </StatusBadge>
                    <StatusBadge tone={photos ? "success" : "danger"} size="sm">
                      {photos ? `${photos} foto(s)` : "Falta foto"}
                    </StatusBadge>
                  </div>
                  <p className="text-[12.5px] text-muted mt-1 tnum">
                    {d.quantity} {d.unit}
                    {d.expiryDate ? ` · validade ${formatIsoBr(d.expiryDate)}` : ""}
                    {d.lot ? ` · lote ${d.lot}` : ""}
                  </p>
                </div>
                {editable ? (
                  <div className="flex gap-1">
                    <button type="button" aria-label="Editar" onClick={() => p && setEditing({ product: p, item: d })} className="size-10 grid place-items-center rounded-xl text-ink-2 active:bg-canvas">
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      onClick={async () => {
                        await deleteDamage(visitId, attendance.id, d.id);
                        toast("Avaria removida.");
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
            <ShieldAlert className="size-5 shrink-0" /> Nenhuma avaria registrada neste atendimento.
          </p>
        ) : null}
      </div>

      {editable ? (
        <Button size="xl" variant="danger" className="w-full mt-4" onClick={() => setPicking(true)}>
          <Plus className="size-5" /> REGISTRAR AVARIA
        </Button>
      ) : null}

      {picking ? (
        <Sheet open onClose={() => setPicking(false)} title="Qual produto está avariado?">
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
        <DamageSheet
          key={editing.item?.id ?? editing.product.id}
          visitId={visitId}
          visitDate={visitDate}
          attendance={attendance}
          brand={brand}
          product={editing.product}
          item={editing.item}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function DamageSheet({
  visitId,
  visitDate,
  attendance,
  brand,
  product,
  item,
  onClose,
}: {
  visitId: string;
  visitDate: string;
  attendance: LocalAttendance;
  brand: BootstrapBrand;
  product: BootstrapProduct;
  item: DamageInput | null;
  onClose: () => void;
}) {
  const { settings } = useCatalog();
  const [id] = useState(item?.id ?? uuid());
  const [kind, setKind] = useState<DamageKind | null>(item?.kind ?? null);
  const units = unitsFor(product);
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "");
  const [unit, setUnit] = useState<ItemUnit>(initialUnit(item?.unit));
  const expiry = useExpiry(item?.expiryDate, visitDate, settings?.validityBands);
  const [lot, setLot] = useState(item?.lot ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const photos = attendance.photos.filter((p) => p.damageId === id);
  const qty = Number(quantity);
  const ready = Boolean(kind) && qty > 0 && expiryReady(expiry, false) && photos.length > 0;
  const cancel = async () => {
    if (!attendance.damages?.[id]) await discardUnsavedPhotos(visitId, attendance.id, { damageId: id });
    onClose();
  };

  async function save() {
    if (!ready || !kind) return;
    await saveDamage(visitId, attendance.id, {
      id,
      productId: product.id,
      kind,
      quantity: qty,
      unit,
      expiryDate: expiry.iso,
      lot: lot.trim().toUpperCase() || null,
      note: note.trim() || null,
      recordedAt: item?.recordedAt ?? new Date().toISOString(),
    });
    haptic(20);
    toast("Avaria salva.");
    onClose();
  }

  return (
    <Sheet
      open
      onClose={() => void cancel()}
      title={
        <span>
          <span className="block text-[12px] font-semibold uppercase tracking-wide text-muted">Avaria</span>
          <span className="block leading-snug">{product.name}</span>
        </span>
      }
      footer={
        <Button size="xl" variant="danger" className="w-full" disabled={!ready} onClick={() => void save()}>
          {photos.length ? "Salvar avaria" : "Falta a foto da avaria"}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Tipo da avaria</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {DAMAGE_KINDS.map((k) => (
              <Chip key={k} selected={kind === k} onClick={() => setKind(k)} tone="bad">
                {DAMAGE_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
        </div>
        <QuantityField value={quantity} onChange={setQuantity} unit={unit} onUnit={setUnit} units={units} />
        <ExpiryField expiry={expiry} required={false} />
        <label className="block">
          <FieldLabel hint="opcional">Lote</FieldLabel>
          <input value={lot} onChange={(e) => setLot(e.target.value.slice(0, 60))} className={clsx(inputClass, "uppercase")} />
        </label>
        <TextArea label="Observação (opcional)" value={note} onChange={setNote} rows={2} maxLength={300} />
        {!photos.length ? <Notice tone="warn">A foto da avaria é obrigatória.</Notice> : null}
        <PhotoCapture
          visitId={visitId}
          attendanceId={attendance.id}
          kind="damage"
          photos={photos}
          min={1}
          allowGallery={brand.allowGallery}
          editable
          title="Foto da avaria"
          cta="FOTOGRAFAR A AVARIA"
          link={{ damageId: id }}
          compact
        />
      </div>
    </Sheet>
  );
}
