/**
 * Componentes visuais básicos e sem estado — usáveis em Server e Client
 * Components. O painel e o app do promotor compartilham estes padrões.
 */
import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleDot, CloudUpload, MinusCircle, XCircle, type LucideIcon } from "lucide-react";
import { ExportExcelButton } from "./export-excel-button";
import type { Tone } from "@/lib/domain";

export { clsx as cx };

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg" | "xl";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-900 disabled:bg-brand-800/45",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-subtle active:bg-canvas disabled:text-muted",
  ghost: "text-ink-2 hover:bg-black/[0.04] active:bg-black/[0.07] disabled:text-muted",
  danger: "bg-bad text-white hover:brightness-110 disabled:opacity-50",
  success: "bg-ok text-white hover:brightness-110 disabled:opacity-50",
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

export function Button({ variant = "primary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={clsx("bg-surface rounded-[var(--radius-card)] border border-line shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="text-[13px] text-muted mt-0.5">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-ink-2",
  info: "bg-info-bg text-info",
  success: "bg-ok-bg text-ok",
  warning: "bg-warn-bg text-warn",
  danger: "bg-bad-bg text-bad",
  sync: "bg-sync-bg text-sync",
  muted: "bg-black/[0.04] text-muted",
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-ink-2",
  info: "text-info",
  success: "text-ok",
  warning: "text-warn",
  danger: "text-bad",
  sync: "text-sync",
  muted: "text-muted",
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  neutral: CircleDashed,
  info: CircleDot,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  sync: CloudUpload,
  muted: MinusCircle,
};

/** Selo de estado: sempre cor + ícone + texto. */
export function StatusBadge({ tone, children, size = "md", icon = true, className }: { tone: Tone; children: ReactNode; size?: "sm" | "md"; icon?: boolean; className?: string }) {
  const Icon = TONE_ICON[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon ? <Icon className={size === "sm" ? "size-3" : "size-3.5"} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap", TONE_CLASS[tone], className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions, eyebrow, noExport }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; noExport?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow ? <div className="text-[12px] font-medium text-muted mb-1">{eyebrow}</div> : null}
        <h1 className="text-[22px] sm:text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-muted mt-1">{subtitle}</p> : null}
      </div>
      {/* Toda tela do painel exporta para Excel o que mostra (com os filtros, sem paginação). */}
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {noExport ? null : <ExportExcelButton />}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, className }: { icon?: ReactNode; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {children ? <div className="text-sm text-muted mt-1 max-w-md">{children}</div> : null}
    </div>
  );
}

/** Nome do app. */
export const APP_NAME = "MCX Trade";

/** Assinatura "MCX TRADE" em letras espaçadas (prata no fundo escuro). */
export function TradeWordmark({ variant = "light", className }: { variant?: "light" | "dark"; className?: string }) {
  return (
    <span className={clsx("inline-flex items-baseline gap-[0.35em] text-[10px] font-semibold uppercase tracking-[0.22em] leading-none", className)}>
      <span className={variant === "light" ? "text-silver" : "text-ink-2"}>MCX</span>
      <span className={variant === "light" ? "text-silver-2" : "text-muted"}>Trade</span>
    </span>
  );
}

/**
 * Identidade no cabeçalho: "MCX TRADE" em cima e, embaixo, quem usa — o nome da
 * agência (com a logo dela, se houver) ou a visão da equipe MCX.
 */
export function BrandMark({ variant = "light", name, logoUrl, subtitle }: { variant?: "light" | "dark"; name: string; logoUrl?: string | null; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="size-10 rounded-[11px] object-cover bg-white shrink-0 ring-1 ring-white/15" />
      ) : (
        <span
          className={clsx(
            "size-10 rounded-[11px] grid place-items-center font-semibold text-[16px] tracking-tight shrink-0",
            variant === "light" ? "bg-gradient-to-br from-white to-silver text-brand-900 ring-1 ring-white/20" : "bg-brand-800 text-white",
          )}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <TradeWordmark variant={variant} />
        <div className={clsx("font-semibold text-[15px] leading-tight truncate mt-1", variant === "light" ? "text-white" : "text-ink")}>{name}</div>
        {subtitle ? <div className={clsx("text-[11px] leading-tight truncate mt-0.5", variant === "light" ? "text-brand-200/80" : "text-muted")}>{subtitle}</div> : null}
      </div>
    </div>
  );
}

/** Assinatura discreta da MCX (rodapé do painel, login e app). */
export function McxFooter({ variant = "light", className }: { variant?: "light" | "dark"; className?: string }) {
  return (
    <div className={clsx("flex items-center justify-center gap-1.5 text-[10.5px] tracking-wide", variant === "light" ? "text-brand-200/60" : "text-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mcx_logo.png" alt="" className="size-4 rounded-[3px]" />
      <span>por MCX Soluções Operacionais</span>
    </div>
  );
}

/** Barra de progresso com rótulo acessível. */
export function Progress({ value, total, tone = "success", className }: { value: number; total: number; tone?: Tone; className?: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const bar = { success: "bg-ok", info: "bg-info", warning: "bg-warn", danger: "bg-bad", sync: "bg-sync", neutral: "bg-ink-2", muted: "bg-muted" }[tone];
  return (
    <div className={clsx("h-1.5 rounded-full bg-black/[0.07] overflow-hidden", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={`${value} de ${total}`}>
      <div className={clsx("h-full rounded-full transition-[width]", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Field({ label, hint, error, children, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
      {error ? <span className="block text-xs text-bad mt-1 font-medium">{error}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-subtle disabled:text-muted";

export const selectClass = inputClass + " pr-8";

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex items-center rounded border border-line-strong bg-subtle px-1.5 text-[11px] font-medium text-ink-2">{children}</kbd>;
}
