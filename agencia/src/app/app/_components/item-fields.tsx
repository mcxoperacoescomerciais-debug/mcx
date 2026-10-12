"use client";

/**
 * Campos compartilhados das etapas Validade, Ruptura e Avaria (modo SUINCO):
 * selo de severidade, campo de validade digitada (0510 → 05/10), quantidade +
 * unidade e lista de produtos com busca.
 */
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Search } from "lucide-react";
import clsx from "clsx";
import type { ItemUnit } from "@/lib/domain";
import { daysBetween } from "@/lib/dates";
import { matchesQuery } from "@/lib/rules";
import type { BootstrapProduct } from "@/lib/sync-types";
import {
  classify,
  DEFAULT_BANDS,
  describeDays,
  formatIsoBr,
  isoToDigits,
  maskExpiryDigits,
  parseExpiryDigits,
  plausibilityWarning,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  type Severity,
  type SeverityBands,
} from "@/lib/validity";

export const inputClass =
  "w-full h-12 rounded-xl border border-line-strong bg-surface px-3.5 text-[16px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100";

export function SeverityPill({ severity, className }: { severity: Severity; className?: string }) {
  const c = SEVERITY_COLOR[severity];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 h-6 text-[12px] font-bold whitespace-nowrap", className)} style={{ background: c.bg, color: c.fg }}>
      <span className="size-2 rounded-full" style={{ background: c.solid }} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-2 mb-1.5">
      <span className="text-[13px] font-semibold text-ink-2">{children}</span>
      {hint ? <span className="text-[11.5px] text-muted">{hint}</span> : null}
    </span>
  );
}

export interface ExpiryState {
  digits: string;
  setDigits: (d: string) => void;
  iso: string | null;
  days: number | null;
  severity: Severity | null;
  invalid: boolean;
  incomplete: boolean;
  warning: ReturnType<typeof plausibilityWarning>;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
}

/** Estado do campo de validade, calculado em relação à DATA DA VISITA. */
export function useExpiry(initialIso: string | null | undefined, visitDate: string, bands: SeverityBands | undefined): ExpiryState {
  const [digits, setDigitsRaw] = useState(isoToDigits(initialIso));
  const [confirmed, setConfirmed] = useState(Boolean(initialIso));
  const parsed = digits ? parseExpiryDigits(digits, visitDate) : null;
  const iso = parsed?.ok ? parsed.iso : null;
  const days = iso ? daysBetween(visitDate, iso) : null;
  return {
    digits,
    setDigits: (d) => {
      setDigitsRaw(d);
      setConfirmed(false);
    },
    iso,
    days,
    severity: days === null ? null : classify(days, bands ?? DEFAULT_BANDS),
    invalid: Boolean(parsed && !parsed.ok && parsed.reason === "invalid"),
    incomplete: Boolean(parsed && !parsed.ok && parsed.reason === "incomplete"),
    warning: iso ? plausibilityWarning(iso, visitDate) : null,
    confirmed,
    setConfirmed,
  };
}

/** Pronto para salvar: data válida e, se improvável, confirmada pelo promotor. */
export function expiryReady(e: ExpiryState, required: boolean): boolean {
  if (!e.digits) return !required;
  return Boolean(e.iso) && (!e.warning || e.confirmed);
}

export function ExpiryField({ expiry, required, label = "Validade" }: { expiry: ExpiryState; required: boolean; label?: string }) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const { digits, iso, days, severity, invalid, incomplete, warning } = expiry;
  return (
    <div>
      <FieldLabel hint={required ? "só números: 0510" : "opcional · só números: 0510"}>{label}</FieldLabel>
      <div className="flex gap-2">
        <input
          value={maskExpiryDigits(digits)}
          onChange={(e) => expiry.setDigits(e.target.value.replace(/\D/g, "").slice(0, 8))}
          inputMode="numeric"
          placeholder="DD/MM"
          aria-invalid={invalid}
          className={clsx(inputClass, "!h-14 !text-[24px] font-semibold tnum flex-1 tracking-wide", invalid && "!border-bad")}
        />
        <button
          type="button"
          onClick={() => nativeRef.current?.showPicker?.()}
          className="h-14 w-14 shrink-0 rounded-xl border border-line-strong grid place-items-center text-ink-2 active:bg-canvas"
          aria-label="Abrir calendário"
        >
          <CalendarDays className="size-6" />
        </button>
        <input ref={nativeRef} type="date" tabIndex={-1} className="sr-only" onChange={(e) => e.target.value && expiry.setDigits(isoToDigits(e.target.value))} />
      </div>
      <div className="min-h-[28px] mt-2">
        {invalid ? (
          <p className="text-[13px] font-semibold text-bad">Data impossível. Confira dia e mês.</p>
        ) : incomplete ? (
          <p className="text-[13px] text-muted">Digite dia e mês (ex.: 0510).</p>
        ) : iso && severity && days !== null ? (
          <div className="flex items-center gap-2 flex-wrap">
            <SeverityPill severity={severity} />
            <span className="text-[13px] text-ink-2 tnum">
              {formatIsoBr(iso)} · {describeDays(days)}
            </span>
          </div>
        ) : null}
      </div>
      {warning && !expiry.confirmed ? (
        <div className="mt-1 rounded-xl bg-warn-bg text-warn px-3 py-2.5 text-[13px] font-medium">
          <p className="flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" /> {warning.message}
          </p>
          <div className="flex gap-2 mt-2">
            {warning.suggestionIso ? (
              <button type="button" onClick={() => expiry.setDigits(isoToDigits(warning.suggestionIso))} className="h-9 px-3 rounded-lg bg-warn text-white text-[13px] font-semibold">
                Usar {formatIsoBr(warning.suggestionIso)}
              </button>
            ) : null}
            <button type="button" onClick={() => expiry.setConfirmed(true)} className="h-9 px-3 rounded-lg border border-warn text-[13px] font-semibold">
              A data está certa
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Unidades: un e cx; kg só para produto fracionado (unidade kg no cadastro). */
export function unitsFor(product: BootstrapProduct | undefined): ItemUnit[] {
  return product?.unit === "kg" ? ["un", "cx", "kg"] : ["un", "cx"];
}

const UNIT_SHORT: Record<ItemUnit, string> = { un: "Unidade", cx: "Caixa", kg: "Kg" };

export function QuantityField({ value, onChange, unit, onUnit, units }: { value: string; onChange: (v: string) => void; unit: ItemUnit; onUnit: (u: ItemUnit) => void; units: ItemUnit[] }) {
  return (
    <div>
      <FieldLabel>Quantidade</FieldLabel>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          placeholder="0"
          className={clsx(inputClass, "!h-14 !text-[24px] font-semibold tnum w-28")}
        />
        <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))` }}>
          {units.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnit(u)}
              aria-pressed={unit === u}
              className={clsx("h-14 rounded-xl border text-[14px] font-semibold", unit === u ? "bg-brand-800 text-white border-brand-800" : "bg-surface border-line-strong text-ink")}
            >
              {UNIT_SHORT[u]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Lista completa dos produtos da marca/loja com busca que filtra enquanto digita. */
export function ProductSearchList({
  products,
  onPick,
  right,
  highlight,
  placeholder = "Buscar produto, SKU ou EAN",
  emptyText = "Nenhum produto encontrado.",
}: {
  products: BootstrapProduct[];
  onPick: (p: BootstrapProduct) => void;
  right?: (p: BootstrapProduct) => React.ReactNode;
  highlight?: (p: BootstrapProduct) => boolean;
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => products.filter((p) => matchesQuery(`${p.name} ${p.sku} ${p.ean ?? ""} ${p.variant ?? ""}`, query)), [products, query]);
  return (
    <div>
      <label className="relative block mb-2">
        <Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full h-12 rounded-2xl border border-line-strong bg-surface pl-11 pr-4 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </label>
      <div className="bg-surface border border-line rounded-2xl divide-y divide-line overflow-hidden">
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => onPick(p)} className={clsx("w-full min-h-14 px-4 py-2.5 flex items-center gap-3 text-left active:bg-canvas", highlight?.(p) && "bg-bad-bg/60")}>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold leading-snug">{p.name}</span>
              <span className="block text-[12px] text-muted">
                SKU {p.sku}
                {p.package ? ` · ${p.package}` : ""}
              </span>
            </span>
            {right?.(p)}
          </button>
        ))}
        {!list.length ? <p className="px-4 py-5 text-center text-[14px] text-muted">{emptyText}</p> : null}
      </div>
    </div>
  );
}
