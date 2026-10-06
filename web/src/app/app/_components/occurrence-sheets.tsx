"use client";

/**
 * Folhas de registro de cada tipo de ocorrência.
 *
 * Validade (o caso mais frequente) foi desenhada para 2 campos e o teclado
 * numérico: quantidade → Enter → validade em DDMM → Enter → salvo. O ano é
 * inferido, a classificação aparece enquanto digita e datas impossíveis
 * (28/20) nunca são aceitas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Copy, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Chip, FieldLabel, inputClass, Sheet } from "./primitives";
import { PhotoPicker } from "./photo-picker";
import { SeverityBadge } from "@/components/ui";
import {
  DAMAGE_KIND_LABEL,
  LOCATION_LABEL,
  RUPTURE_KIND_LABEL,
  type DamageKind,
  type Location,
  type RuptureKind,
  type Unit,
} from "@/lib/domain";
import {
  classify,
  daysBetween,
  describeDays,
  formatIsoBr,
  maskExpiryDigits,
  parseExpiryDigits,
  plausibilityWarning,
} from "@/lib/validity";
import type { BootstrapProduct } from "@/lib/sync-types";
import { addPhoto, deleteOccurrence, removePhoto, saveOccurrence, type LocalOccurrence } from "../_lib/local-store";
import { haptic, useCatalog } from "../_lib/hooks";

export interface SheetTarget {
  product: BootstrapProduct;
  existing?: LocalOccurrence;
  location?: Location;
  unit?: string;
}

function SheetTitle({ product, subtitle }: { product: BootstrapProduct; subtitle: string }) {
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gold-600">{subtitle}</p>
      <h2 className="text-[18px] font-semibold text-ink leading-snug">{product.name}</h2>
    </div>
  );
}

const targetKeys = new WeakMap<SheetTarget, number>();
let nextTargetKey = 1;
/** Chave estável por objeto de alvo: cada novo alvo remonta o formulário com estado inicial limpo. */
function keyOf(target: SheetTarget): number {
  let k = targetKeys.get(target);
  if (!k) {
    k = nextTargetKey++;
    targetKeys.set(target, k);
  }
  return k;
}

async function attachPhotos(visitId: string, occurrenceId: string, blobs: Blob[]) {
  for (const b of blobs) await addPhoto(visitId, occurrenceId, b);
}

// ───────────────────────────── Validade ─────────────────────────────

const UNITS: Unit[] = ["un", "cx", "kg", "pct"];

interface ValiditySheetProps {
  visitId: string;
  visitDate: string;
  target: SheetTarget | null;
  onClose: () => void;
  onSaved: (opts: { anotherLot: boolean; product: BootstrapProduct }) => void;
}

export function ValiditySheet(props: ValiditySheetProps) {
  if (!props.target) return null;
  return <ValidityForm key={keyOf(props.target)} {...props} target={props.target} />;
}

function ValidityForm({ visitId, visitDate, target, onClose, onSaved }: ValiditySheetProps & { target: SheetTarget }) {
  const { bands } = useCatalog();
  const existing = target.existing;
  const e = existing;
  const [qty, setQty] = useState(e?.quantity ? String(e.quantity) : "");
  const [unit, setUnit] = useState<string>(e?.unit ?? target.unit ?? (target.location === "stock" ? "cx" : target.product.defaultUnit));
  const [digits, setDigits] = useState(e?.expiryDate ? e.expiryDate.slice(8, 10) + e.expiryDate.slice(5, 7) + e.expiryDate.slice(0, 4) : "");
  const [location, setLocation] = useState<Location>((e?.location as Location) ?? target.location ?? "sales_floor");
  const [lot, setLot] = useState(e?.lot ?? "");
  const [price, setPrice] = useState(e?.price != null ? e.price.toFixed(2).replace(".", ",") : "");
  const [notes, setNotes] = useState(e?.notes ?? "");
  const [more, setMore] = useState(Boolean(e?.lot || e?.notes || (e?.location && e.location !== target.location)));
  const [pending, setPending] = useState<Blob[]>([]);
  const [confirmedWarning, setConfirmedWarning] = useState(false);
  const [triedSave, setTriedSave] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const nativeDateRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  // Foco automático: teclado numérico já aberto na quantidade.
  useEffect(() => {
    const t = setTimeout(() => qtyRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const parsed = useMemo(() => (digits ? parseExpiryDigits(digits, visitDate) : null), [digits, visitDate]);
  const iso = parsed?.ok ? parsed.iso : null;
  const days = iso ? daysBetween(visitDate, iso) : null;
  const severity = days !== null ? classify(days, bands) : null;
  const warning = iso ? plausibilityWarning(iso, visitDate) : null;
  const quantity = Number(qty);
  const qtyValid = Number.isInteger(quantity) && quantity > 0;
  const canSave = qtyValid && Boolean(iso) && (!warning || confirmedWarning);

  async function save(anotherLot: boolean) {
    setTriedSave(true);
    if (!canSave || !iso) {
      if (!qtyValid) qtyRef.current?.focus();
      else dateRef.current?.focus();
      return;
    }
    const priceNum = price ? Number(price.replace(",", ".")) : null;
    const id = await saveOccurrence(visitId, {
      id: existing?.id,
      productId: target.product.id,
      type: "validity",
      location,
      quantity,
      unit: unit as Unit,
      expiryDate: iso,
      lot: lot || null,
      price: priceNum !== null && Number.isFinite(priceNum) ? priceNum : null,
      notes: notes || null,
    });
    await attachPhotos(visitId, id, pending);
    haptic();
    onSaved({ anotherLot, product: target.product });
  }

  const dateError = triedSave && !iso ? "Informe a validade." : parsed && !parsed.ok && parsed.reason === "invalid" ? "Data impossível. Confira dia e mês." : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={<SheetTitle product={target.product} subtitle={existing ? "Editar validade" : location === "stock" ? "Estoque × validade" : "Área de vendas × validade"} />}
      footer={
        <div className="flex gap-2">
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                await deleteOccurrence(visitId, existing.id);
                haptic(30);
                onClose();
              }}
              className="h-14 w-14 shrink-0 rounded-2xl border border-line-strong grid place-items-center text-[#B42318]"
              aria-label="Excluir item"
            >
              <Trash2 className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void save(true)}
              className="h-14 px-4 shrink-0 rounded-2xl border border-line-strong font-semibold text-[14px] text-ink-2 inline-flex items-center gap-1.5 active:bg-navy-50"
            >
              <Copy className="size-4" /> + Outro lote
            </button>
          )}
          <button
            type="button"
            onClick={() => void save(false)}
            className={clsx("h-14 flex-1 rounded-2xl font-semibold text-[16px] text-white", canSave ? "bg-navy-900 active:bg-navy-950" : "bg-navy-600/50")}
          >
            Salvar
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <FieldLabel>Quantidade</FieldLabel>
          <div className="flex gap-2">
            <input
              ref={qtyRef}
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  dateRef.current?.focus();
                }
              }}
              inputMode="numeric"
              enterKeyHint="next"
              placeholder="0"
              aria-invalid={triedSave && !qtyValid}
              className={clsx(inputClass, "!h-14 !text-[24px] font-semibold tnum !w-28 shrink-0 text-center", triedSave && !qtyValid && "!border-[#E5484D]")}
            />
            <div className="flex flex-wrap gap-1.5 items-center">
              {UNITS.map((u) => (
                <Chip key={u} active={unit === u} onClick={() => setUnit(u)}>
                  {u}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel hint="digite só os números: 0510">Validade</FieldLabel>
          <div className="flex gap-2">
            <input
              ref={dateRef}
              value={maskExpiryDigits(digits)}
              onChange={(e) => {
                setDigits(e.target.value.replace(/\D/g, "").slice(0, 8));
                setConfirmedWarning(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  priceRef.current?.focus();
                }
              }}
              inputMode="numeric"
              enterKeyHint="next"
              placeholder="DD/MM"
              aria-invalid={Boolean(dateError)}
              className={clsx(inputClass, "!h-14 !text-[24px] font-semibold tnum flex-1 tracking-wide", dateError && "!border-[#E5484D]")}
            />
            <button
              type="button"
              onClick={() => nativeDateRef.current?.showPicker?.()}
              className="h-14 w-14 shrink-0 rounded-xl border border-line-strong grid place-items-center text-ink-2 active:bg-navy-50"
              aria-label="Abrir calendário"
            >
              <CalendarDays className="size-6" />
            </button>
            <input
              ref={nativeDateRef}
              type="date"
              tabIndex={-1}
              className="sr-only"
              onChange={(e) => {
                const v = e.target.value;
                if (v) setDigits(v.slice(8, 10) + v.slice(5, 7) + v.slice(0, 4));
              }}
            />
          </div>
          <div className="min-h-[30px] mt-2">
            {dateError ? (
              <p className="text-[13px] font-semibold text-[#B42318]">{dateError}</p>
            ) : iso && severity && days !== null ? (
              <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={severity} />
                <span className="text-[13px] text-ink-2 tnum">
                  {formatIsoBr(iso)} · {describeDays(days)}
                </span>
              </div>
            ) : null}
          </div>
          {warning && !confirmedWarning ? (
            <div className="mt-1 rounded-xl bg-[#FFF8DB] border border-[#F5D96B] p-3">
              <p className="text-[13px] font-semibold text-[#7A5B00]">{warning.message}</p>
              <div className="flex gap-2 mt-2">
                {warning.suggestionIso ? (
                  <button
                    type="button"
                    onClick={() => {
                      const s = warning.suggestionIso!;
                      setDigits(s.slice(8, 10) + s.slice(5, 7) + s.slice(0, 4));
                    }}
                    className="h-10 px-3 rounded-lg bg-[#7A5B00] text-white text-[13px] font-semibold whitespace-nowrap"
                  >
                    Usar {formatIsoBr(warning.suggestionIso)}
                  </button>
                ) : null}
                <button type="button" onClick={() => setConfirmedWarning(true)} className="h-10 px-3 rounded-lg border border-[#C9A227] text-[#7A5B00] text-[13px] font-semibold whitespace-nowrap">
                  A data está certa
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <FieldLabel hint={target.product.referencePrice != null ? `tabela SUINCO: R$ ${target.product.referencePrice.toFixed(2).replace(".", ",")}` : "preço na etiqueta"}>
            Preço (R$)
          </FieldLabel>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-muted">R$</span>
            <input
              ref={priceRef}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  void save(false);
                }
              }}
              enterKeyHint="done"
              value={price}
              onChange={(ev) => setPrice(ev.target.value.replace(/[^\d,]/g, "").replace(/(,\d{0,2}).*/, "$1").slice(0, 9))}
              inputMode="decimal"
              placeholder="0,00"
              className={clsx(inputClass, "pl-12 tnum font-semibold")}
            />
          </div>
        </div>

        <PhotoPicker
          existing={existing?.photos ?? []}
          pending={pending}
          onAdd={(b) => setPending((p) => [...p, b])}
          onRemovePending={(i) => setPending((p) => p.filter((_, j) => j !== i))}
          onRemoveExisting={(photoId) => existing && void removePhoto(visitId, existing.id, photoId)}
        />

        <button type="button" onClick={() => setMore((m) => !m)} className="flex items-center gap-1 text-[14px] font-semibold text-navy-700 py-1">
          <ChevronDown className={clsx("size-4 transition-transform", more && "rotate-180")} /> Local, lote e observação
        </button>
        {more ? (
          <div className="space-y-4">
            <div>
              <FieldLabel>Local</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(LOCATION_LABEL) as Location[]).map((l) => (
                  <Chip key={l} active={location === l} onClick={() => setLocation(l)}>
                    {LOCATION_LABEL[l]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Lote</FieldLabel>
              <input value={lot} onChange={(ev) => setLot(ev.target.value)} className={inputClass} autoCapitalize="characters" />
            </div>
            <div>
              <FieldLabel>Observação</FieldLabel>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={clsx(inputClass, "!h-auto py-3")} />
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}

// ───────────────────────────── Ruptura ─────────────────────────────

interface SimpleSheetProps {
  visitId: string;
  target: SheetTarget | null;
  onClose: () => void;
}

export function RuptureSheet(props: SimpleSheetProps) {
  if (!props.target) return null;
  return <RuptureForm key={keyOf(props.target)} {...props} target={props.target} />;
}

function RuptureForm({ visitId, target, onClose }: SimpleSheetProps & { target: SheetTarget }) {
  const existing = target.existing;
  const [kind, setKind] = useState<RuptureKind>((existing?.ruptureKind as RuptureKind) ?? "total");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, setPending] = useState<Blob[]>([]);

  async function save() {
    const id = await saveOccurrence(visitId, {
      id: existing?.id,
      productId: target.product.id,
      type: "rupture",
      location: "sales_floor",
      unit: "un",
      ruptureKind: kind,
      notes: notes || null,
    });
    await attachPhotos(visitId, id, pending);
    haptic();
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={<SheetTitle product={target.product} subtitle="Ruptura" />}
      footer={
        <div className="flex gap-2">
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                await deleteOccurrence(visitId, existing.id);
                onClose();
              }}
              className="h-14 px-4 rounded-2xl border border-line-strong font-semibold text-[#B42318] inline-flex items-center gap-1.5"
            >
              <Trash2 className="size-4" /> Remover
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} className="h-14 flex-1 rounded-2xl bg-navy-900 text-white font-semibold text-[16px]">
            Salvar
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <FieldLabel>Situação</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RUPTURE_KIND_LABEL) as RuptureKind[]).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {RUPTURE_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <FieldLabel>Observação</FieldLabel>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Ex.: gôndola vazia desde segunda" className={clsx(inputClass, "!h-auto py-3")} />
        </div>
        <PhotoPicker
          existing={existing?.photos ?? []}
          pending={pending}
          onAdd={(b) => setPending((p) => [...p, b])}
          onRemovePending={(i) => setPending((p) => p.filter((_, j) => j !== i))}
          onRemoveExisting={(photoId) => existing && void removePhoto(visitId, existing.id, photoId)}
        />
      </div>
    </Sheet>
  );
}

// ───────────────────────────── Avaria ─────────────────────────────

export function DamageSheet(props: SimpleSheetProps) {
  if (!props.target) return null;
  return <DamageForm key={keyOf(props.target)} {...props} target={props.target} />;
}

function DamageForm({ visitId, target, onClose }: SimpleSheetProps & { target: SheetTarget }) {
  const existing = target.existing;
  const [qty, setQty] = useState(existing?.quantity ? String(existing.quantity) : "");
  const [kind, setKind] = useState<DamageKind | null>((existing?.damageKind as DamageKind) ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [pending, setPending] = useState<Blob[]>([]);
  const [tried, setTried] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => qtyRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);
  const quantity = Number(qty);
  const photoCount = (existing?.photos.length ?? 0) + pending.length;
  const errors = {
    qty: !(Number.isInteger(quantity) && quantity > 0),
    kind: !kind,
    photo: photoCount === 0,
  };
  const valid = !errors.qty && !errors.kind && !errors.photo;

  async function save() {
    setTried(true);
    if (!valid) return;
    const id = await saveOccurrence(visitId, {
      id: existing?.id,
      productId: target.product.id,
      type: "damage",
      location: "sales_floor",
      quantity,
      unit: "un",
      damageKind: kind,
      notes: notes || null,
    });
    await attachPhotos(visitId, id, pending);
    haptic();
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={<SheetTitle product={target.product} subtitle="Avaria" />}
      footer={
        <div className="flex gap-2">
          {existing ? (
            <button
              type="button"
              onClick={async () => {
                await deleteOccurrence(visitId, existing.id);
                onClose();
              }}
              className="h-14 w-14 rounded-2xl border border-line-strong grid place-items-center text-[#B42318]"
              aria-label="Excluir"
            >
              <Trash2 className="size-5" />
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} className={clsx("h-14 flex-1 rounded-2xl text-white font-semibold text-[16px]", valid ? "bg-navy-900" : "bg-navy-600/50")}>
            Salvar avaria
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <FieldLabel>Quantidade</FieldLabel>
          <input
            ref={qtyRef}
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            placeholder="0"
            className={clsx(inputClass, "!h-14 !text-[24px] font-semibold tnum !w-28 shrink-0 text-center", tried && errors.qty && "!border-[#E5484D]")}
          />
        </div>
        <div>
          <FieldLabel>Tipo de avaria</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(DAMAGE_KIND_LABEL) as DamageKind[]).map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {DAMAGE_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
          {tried && errors.kind ? <p className="text-[13px] text-[#B42318] font-semibold mt-1.5">Escolha o tipo.</p> : null}
        </div>
        <div>
          <PhotoPicker
            required
            existing={existing?.photos ?? []}
            pending={pending}
            onAdd={(b) => setPending((p) => [...p, b])}
            onRemovePending={(i) => setPending((p) => p.filter((_, j) => j !== i))}
            onRemoveExisting={(photoId) => existing && void removePhoto(visitId, existing.id, photoId)}
          />
          {tried && errors.photo ? <p className="text-[13px] text-[#B42318] font-semibold mt-1.5">A foto é a evidência da avaria.</p> : null}
        </div>
        <div>
          <FieldLabel>Observação</FieldLabel>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={clsx(inputClass, "!h-auto py-3")} />
        </div>
      </div>
    </Sheet>
  );
}
