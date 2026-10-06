"use client";

/**
 * Peças de interface do app do promotor: cabeçalho, folha inferior (sheet),
 * chips, indicador de sincronização. Tudo dimensionado para o polegar
 * (alvos ≥ 44px) e leitura rápida.
 */
import { useEffect, type ReactNode } from "react";
import { ArrowLeft, CloudOff, Check, RefreshCw, X } from "lucide-react";
import clsx from "clsx";
import { useLocal } from "../_lib/hooks";
import { pendingCount, syncNow } from "../_lib/local-store";

export function SyncPill({ dark = true }: { dark?: boolean }) {
  const s = useLocal();
  const pending = pendingCount(s);
  const base = clsx(
    "inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-semibold",
    dark ? "bg-white/10 text-white" : "bg-navy-50 text-ink-2",
  );
  if (!s.sync.online) {
    return (
      <span className={clsx(base, dark ? "!bg-[#F07C1B]/25 !text-[#FFD7B5]" : "!bg-[#FFF1E5] !text-[#9A4A00]")}>
        <CloudOff className="size-3.5" /> Sem sinal{pending ? ` · ${pending}` : ""}
      </span>
    );
  }
  if (pending) {
    return (
      <button type="button" onClick={() => void syncNow()} className={base}>
        <RefreshCw className={clsx("size-3.5", s.sync.syncing && "animate-spin")} /> {pending} pendente{pending > 1 ? "s" : ""}
      </button>
    );
  }
  return (
    <span className={base}>
      <Check className="size-3.5 text-[#7BE0A3]" /> Sincronizado
    </span>
  );
}

export function TopBar({ title, subtitle, onBack, right }: { title: ReactNode; subtitle?: ReactNode; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 bg-navy-900 text-white pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-1 h-14 px-2">
        {onBack ? (
          <button type="button" onClick={onBack} className="size-11 grid place-items-center rounded-full active:bg-white/10" aria-label="Voltar">
            <ArrowLeft className="size-[22px]" />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[16px] truncate leading-tight">{title}</div>
          {subtitle ? <div className="text-[12px] text-silver-300 truncate">{subtitle}</div> : null}
        </div>
        <div className="pr-1.5">{right ?? <SyncPill />}</div>
      </div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-navy-950/55" onClick={onClose} />
      <div className="relative bg-surface rounded-t-[22px] max-h-[92dvh] flex flex-col shadow-[var(--shadow-pop)]">
        <div className="flex items-start gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0 flex-1">{title}</div>
          <button type="button" onClick={onClose} className="size-9 -mr-2 grid place-items-center rounded-full text-muted active:bg-navy-50" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-3 flex-1">{children}</div>
        {footer ? <div className="px-5 pt-2 pb-4 pb-safe border-t border-line bg-surface">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Chip({ active, onClick, children, tone = "navy" }: { active: boolean; onClick: () => void; children: ReactNode; tone?: "navy" | "red" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "h-10 px-3.5 rounded-full text-[14px] font-semibold border transition-colors",
        active
          ? tone === "red"
            ? "bg-[#B42318] border-[#B42318] text-white"
            : "bg-navy-900 border-navy-900 text-white"
          : "bg-surface border-line-strong text-ink-2 active:bg-navy-50",
      )}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-[13px] font-semibold text-ink-2">{children}</span>
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </div>
  );
}

export const inputClass =
  "w-full h-12 rounded-xl border border-line-strong px-4 text-[16px] bg-surface focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100";

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line">
      <div className="max-w-xl mx-auto px-4 pt-3 pb-3 pb-safe flex gap-2">{children}</div>
    </div>
  );
}
