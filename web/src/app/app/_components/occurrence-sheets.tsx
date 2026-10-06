"use client";

/**
 * Folhas de registro: Validade (área de vendas e estoque) e Avaria.
 * Ruptura não tem folha: o promotor só toca no produto (ruptura total).
 *
 * Validade foi desenhada para o teclado numérico: quantidade → Enter →
 * validade em DDMM → Enter → preço → Enter → salvo. O ano é inferido, a
 * classificação aparece enquanto digita e datas impossíveis (28/20) nunca
 * são aceitas. Lote e observação ficam sempre visíveis (opcionais).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Copy, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Chip, FieldLabel, inputClass, Sheet } from "./primitives";
import { PhotoPicker } from "./photo-picker";
import { SeverityBadge } from "@/components/ui";
import { DAMAGE_KIND_LABEL, DAMAGE_KIND_OPTIONS, type DamageKind, type Location, type Unit } from "@/lib/domain";
import { classify, daysBetween, describeDays, formatIsoBr, maskExpiryDigits, parseExpiryDigits, plausibilityWarning } from "@/lib/validity";
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

const toDigits = (iso: string | null | undefined) => (iso ? iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(0, 4) : "");

/** Unidade e pacote são a mesma coisa; "kg" só para produto fracionado (unidade padrão kg no cadastro). */
function unitsFor(product: BootstrapProduct): Unit[] {
  return product.defaultUnit === "kg" ? ["un", "cx", "kg"] : ["un", "cx"];
}

function TextField({ label, value, onChange, upper }: { label: string; value: string; onChange: (v: string) => void; upper?: boolean }) {
  return (
    <div>
      <FieldLabel hint="opcional">{label}</FieldLabel>
      <input value={value} onChange={(ev) => onChange(ev.target.value)} className={inputClass} autoCapitalize={upper ? "characters" : "sentences"} />
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <FieldLabel hint="opcional">Observação</FieldLabel>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={clsx(inputClass, "!h-auto py-3")} />
    </div>
  );
}

// ───────────────────────────── Campo de validade (DDMM) ─────────────────────────────

interface ExpiryState {
  digits: string;
  setDigits: (d: string) => void;
  confirmedWarning: boolean;
  setConfirmedWarning: (v: boolean) => void;
}

function useExpiry(initialIso: string | null | undefined, visitDate: string) {
  const { bands } = useCatalog();
  const [digits, setDigits] = useState(toDigits(initialIso));
  const [confirmedWarning, setConfirmedWarning] = useState(false);
  const parsed = useMemo(() => (digits ? parseExpiryDigits(digits, visitDate) : null), [digits, visitDate]);
  const iso = parsed?.ok ? parsed.iso : null;
  const days = iso ? daysBetween(visitDate, iso) : null;
  return {
    state: { digits, setDigits, confirmedWarning, setConfirmedWarning } satisfies ExpiryState,
    parsed,
    iso,
    days,
    severity: days !== null ? classify(days, bands) : null,
    warning: iso ? plausibilityWarning(iso, visitDate) : null,
  };
}

function ExpiryField({
  expiry,
  inputRef,
  required,
  showedError,
  onEnter,
}: {
  expiry: ReturnType<typeof useExpiry>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  required: boolean;
  showedError: boolean;
  onEnter: () => void;
}) {
  const nativeDateRef = useRef<HTMLInputElement>(null);
  const { state, parsed, iso, days, severity, warning } = expiry;
  const dateError =
    showedError && required && !state.digits
      ? "Informe a validade."
      : parsed && !parsed.ok && (parsed.reason === "invalid" || showedError)
        ? parsed.reason === "invalid"
          ? "Data impossível. Confira dia e mês."
          : "Data incompleta. Digite dia e mês: 0510."
        : null;
  return (
    <div>
      <FieldLabel hint={required ? "digite só os números: 0510" : "opcional · digite só os números: 0510"}>Validade</FieldLabel>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={maskExpiryDigits(state.digits)}
          onChange={(e) => {
            state.setDigits(e.target.value.replace(/\D/g, "").slice(0, 8));
            state.setConfirmedWarning(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
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
            if (e.target.value) state.setDigits(toDigits(e.target.value));
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
      {warning && !state.confirmedWarning ? (
        <div className="mt-1 rounded-xl bg-[#FFF8DB] border border-[#F5D96B] p-3">
          <p className="text-[13px] font-semibold text-[#7A5B00]">{warning.message}</p>
          <div className="flex gap-2 mt-2">
            {warning.suggestionIso ? (
              <button
                type="button"
                onClick={() => state.setDigits(toDigits(warning.suggestionIso))}
                className="h-10 px-3 rounded-lg bg-[#7A5B00] text-white text-[13px] font-semibold whitespace-nowrap"
              >
                Usar {formatIsoBr(warning.suggestionIso)}
              </button>
            ) : null}
            <button type="button" onClick={() => state.setConfirmedWarning(true)} className="h-10 px-3 rounded-lg border border-[#C9A227] text-[#7A5B00] text-[13px] font-semibold whitespace-nowrap">
              A data está certa
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QuantityInput({ value, onChange, invalid, inputRef, onEnter }: { value: string; onChange: (v: string) => void; invalid: boolean; inputRef: React.RefObject<HTMLInputElement | null>; onEnter?: () => void }) {
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      inputMode="numeric"
      enterKeyHint="next"
      placeholder="0"
      aria-invalid={invalid}
      className={clsx(inputClass, "!h-14 !text-[24px] font-semibold tnum !w-28 shrink-0 text-center", invalid && "!border-[#E5484D]")}
    />
  );
}

function useAutoFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [ref]);
}

// ───────────────────────────── Validade ─────────────────────────────

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
  const e = target.existing;
  // O local vem da seção em que o promotor está (área de vendas ou estoque).
  const location: Location = (e?.location as Location) ?? target.location ?? "sales_floor";
  const units = unitsFor(target.product);
  const initialUnit = e?.unit ?? target.unit ?? (location === "stock" ? "cx" : target.product.defaultUnit);
  const [qty, setQty] = useState(e?.quantity ? String(e.quantity) : "");
  const [unit, setUnit] = useState<string>(units.includes(initialUnit as Unit) ? initialUnit : "un");
  const [lot, setLot] = useState(e?.lot ?? "");
  const [price, setPrice] = useState(e?.price != null ? e.price.toFixed(2).replace(".", ",") : "");
  const [notes, setNotes] = useState(e?.notes ?? "");
  const [pending, setPending] = useState<Blob[]>([]);
  const [triedSave, setTriedSave] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const expiry = useExpiry(e?.expiryDate, visitDate);
  useAutoFocus(qtyRef);

  const quantity = Number(qty);
  const qtyValid = Number.isInteger(quantity) && quantity > 0;
  const canSave = qtyValid && Boolean(expiry.iso) && (!expiry.warning || expiry.state.confirmedWarning);

  async function save(anotherLot: boolean) {
    setTriedSave(true);
    if (!canSave || !expiry.iso) {
      if (!qtyValid) qtyRef.current?.focus();
      else dateRef.current?.focus();
      return;
    }
    const priceNum = price ? Number(price.replace(",", ".")) : null;
    const id = await saveOccurrence(visitId, {
      id: e?.id,
      productId: target.product.id,
      type: "validity",
      location,
      quantity,
      unit: unit as Unit,
      expiryDate: expiry.iso,
      lot: lot || null,
      price: priceNum !== null && Number.isFinite(priceNum) ? priceNum : null,
      notes: notes || null,
    });
    await attachPhotos(visitId, id, pending);
    haptic();
    onSaved({ anotherLot, product: target.product });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={<SheetTitle product={target.product} subtitle={e ? "Editar validade" : location === "stock" ? "Estoque × validade" : "Área de vendas × validade"} />}
      footer={
        <div className="flex gap-2">
          {e ? (
            <button
              type="button"
              onClick={async () => {
                await deleteOccurrence(visitId, e.id);
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
            <QuantityInput value={qty} onChange={setQty} invalid={triedSave && !qtyValid} inputRef={qtyRef} onEnter={() => dateRef.current?.focus()} />
            <div className="flex flex-wrap gap-1.5 items-center">
              {units.map((u) => (
                <Chip key={u} active={unit === u} onClick={() => setUnit(u)}>
                  {u}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <ExpiryField expiry={expiry} inputRef={dateRef} required showedError={triedSave} onEnter={() => priceRef.current?.focus()} />

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

        <TextField label="Lote" value={lot} onChange={setLot} upper />
        <NotesField value={notes} onChange={setNotes} />

        <PhotoPicker
          existing={e?.photos ?? []}
          pending={pending}
          onAdd={(b) => setPending((p) => [...p, b])}
          onRemovePending={(i) => setPending((p) => p.filter((_, j) => j !== i))}
          onRemoveExisting={(photoId) => e && void removePhoto(visitId, e.id, photoId)}
        />
      </div>
    </Sheet>
  );
}

// ───────────────────────────── Avaria ─────────────────────────────

interface DamageSheetProps {
  visitId: string;
  visitDate: string;
  target: SheetTarget | null;
  onClose: () => void;
}

export function DamageSheet(props: DamageSheetProps) {
  if (!props.target) return null;
  return <DamageForm key={keyOf(props.target)} {...props} target={props.target} />;
}

function DamageForm({ visitId, visitDate, target, onClose }: DamageSheetProps & { target: SheetTarget }) {
  const e = target.existing;
  const [qty, setQty] = useState(e?.quantity ? String(e.quantity) : "");
  const [kind, setKind] = useState<DamageKind | null>((e?.damageKind as DamageKind) ?? null);
  const [lot, setLot] = useState(e?.lot ?? "");
  const [notes, setNotes] = useState(e?.notes ?? "");
  const [pending, setPending] = useState<Blob[]>([]);
  const [tried, setTried] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const expiry = useExpiry(e?.expiryDate, visitDate);
  useAutoFocus(qtyRef);

  const quantity = Number(qty);
  const photoCount = (e?.photos.length ?? 0) + pending.length;
  // Validade é opcional na avaria, mas se for digitada precisa ser uma data válida.
  const expiryOk = !expiry.state.digits || (Boolean(expiry.iso) && (!expiry.warning || expiry.state.confirmedWarning));
  const errors = {
    qty: !(Number.isInteger(quantity) && quantity > 0),
    kind: !kind,
    photo: photoCount === 0,
    expiry: !expiryOk,
  };
  const valid = !errors.qty && !errors.kind && !errors.photo && !errors.expiry;
  const kinds = kind && !DAMAGE_KIND_OPTIONS.includes(kind) ? [...DAMAGE_KIND_OPTIONS, kind] : DAMAGE_KIND_OPTIONS;

  async function save() {
    setTried(true);
    if (!valid) return;
    const id = await saveOccurrence(visitId, {
      id: e?.id,
      productId: target.product.id,
      type: "damage",
      location: "sales_floor",
      quantity,
      unit: "un",
      damageKind: kind,
      expiryDate: expiry.iso,
      lot: lot || null,
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
          {e ? (
            <button
              type="button"
              onClick={async () => {
                await deleteOccurrence(visitId, e.id);
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
          <QuantityInput value={qty} onChange={setQty} invalid={tried && errors.qty} inputRef={qtyRef} />
        </div>
        <div>
          <FieldLabel>Tipo de avaria</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
                {DAMAGE_KIND_LABEL[k]}
              </Chip>
            ))}
          </div>
          {tried && errors.kind ? <p className="text-[13px] text-[#B42318] font-semibold mt-1.5">Escolha o tipo.</p> : null}
        </div>

        <ExpiryField expiry={expiry} inputRef={dateRef} required={false} showedError={tried} onEnter={() => dateRef.current?.blur()} />
        <TextField label="Lote" value={lot} onChange={setLot} upper />

        <div>
          <PhotoPicker
            required
            existing={e?.photos ?? []}
            pending={pending}
            onAdd={(b) => setPending((p) => [...p, b])}
            onRemovePending={(i) => setPending((p) => p.filter((_, j) => j !== i))}
            onRemoveExisting={(photoId) => e && void removePhoto(visitId, e.id, photoId)}
          />
          {tried && errors.photo ? <p className="text-[13px] text-[#B42318] font-semibold mt-1.5">A foto é a evidência da avaria.</p> : null}
        </div>
        <NotesField value={notes} onChange={setNotes} />
      </div>
    </Sheet>
  );
}
