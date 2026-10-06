/**
 * Componentes visuais básicos, sem estado — usáveis tanto em Server quanto em
 * Client Components.
 */
import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from "@/lib/domain";

export { clsx as cx };

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950 disabled:bg-navy-600/50",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-navy-50 active:bg-navy-100",
  ghost: "text-ink-2 hover:bg-navy-50 active:bg-navy-100",
  danger: "bg-sev-expired text-white hover:brightness-110",
  gold: "bg-gold-500 text-navy-950 hover:bg-gold-400 active:bg-gold-600",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-[10px] gap-2",
  lg: "h-12 px-5 text-[15px] rounded-xl gap-2",
  xl: "h-14 px-6 text-base rounded-2xl gap-2.5",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center font-semibold transition-colors select-none disabled:cursor-not-allowed whitespace-nowrap",
    BUTTON_VARIANT[variant],
    BUTTON_SIZE[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={clsx("bg-surface rounded-[var(--radius-card)] border border-line shadow-[var(--shadow-card)]", className)}
      {...props}
    />
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle ? <p className="text-[13px] text-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function SeverityBadge({ severity, days, size = "md" }: { severity: Severity; days?: number | null; size?: "sm" | "md" }) {
  const c = SEVERITY_COLOR[severity];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap tnum",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c.solid }} />
      {SEVERITY_LABEL[severity]}
      {days !== undefined && days !== null ? (
        <span className="font-medium opacity-80">· {days < 0 ? `${Math.abs(days)}d atrás` : `${days}d`}</span>
      ) : null}
    </span>
  );
}

type Tone = "neutral" | "navy" | "gold" | "red" | "orange" | "green" | "blue";
const TONE: Record<Tone, string> = {
  neutral: "bg-navy-50 text-ink-2",
  navy: "bg-navy-900 text-white",
  gold: "bg-gold-100 text-gold-600",
  red: "bg-[#FDECEC] text-[#B42318]",
  orange: "bg-[#FFF1E5] text-[#9A4A00]",
  green: "bg-[#E7F6EC] text-[#1D6B3A]",
  blue: "bg-[#E8F1FE] text-[#1D4E9E]",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[tone], className)}
      {...props}
    />
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-muted mt-1">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="text-sm text-muted mt-1 max-w-sm">{children}</div> : null}
    </div>
  );
}

export function BrandMark({ variant = "light", compact = false }: { variant?: "light" | "dark"; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mcx_logo.png" alt="MCX" className={clsx("rounded-md object-cover", compact ? "size-8" : "size-9")} />
      <div className="leading-tight">
        <div className={clsx("font-semibold tracking-[0.14em] text-[13px]", variant === "light" ? "text-white" : "text-ink")}>
          SUINCO
        </div>
        <div className={clsx("text-[11px]", variant === "light" ? "text-silver-300" : "text-muted")}>Gestão de Loja</div>
      </div>
    </div>
  );
}

export function Delta({ current, previous, invert = true }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0 && current === 0) return <span className="text-xs text-muted">—</span>;
  if (previous === 0) return <span className="text-xs text-muted">novo no período</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  // Para ocorrências, subir é ruim (invert=true): vermelho quando aumenta.
  const bad = invert ? pct > 0 : pct < 0;
  const tone = pct === 0 ? "text-muted" : bad ? "text-[#B42318]" : "text-[#1D6B3A]";
  return (
    <span className={clsx("text-xs font-semibold tnum", tone)}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "•"} {Math.abs(pct)}%
      <span className="font-normal text-muted"> vs. período anterior</span>
    </span>
  );
}
