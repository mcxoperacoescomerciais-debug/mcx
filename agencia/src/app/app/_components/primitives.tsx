"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, CloudOff, History, Loader2, RefreshCw, RotateCw, Store, UserRound, X } from "lucide-react";
import clsx from "clsx";
import { pendingCount, refreshAll, syncNow } from "../_lib/local-store";
import { go, useLocal } from "../_lib/hooks";
import { fmtAgo } from "@/lib/dates";

// ───────────────────────────── Estrutura de tela ─────────────────────────────

export function Screen({ children, footer, className }: { children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh flex flex-col bg-canvas overflow-x-clip">
      <div className={clsx("flex-1 w-full max-w-[560px] mx-auto", footer ? "pb-32" : "pb-24", className)}>{children}</div>
      {footer ? (
        <div className="fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line pb-safe">
          <div className="max-w-[560px] mx-auto px-4 py-3">{footer}</div>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({ title, subtitle, back, right }: { title: ReactNode; subtitle?: ReactNode; back?: string | (() => void); right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 bg-brand-900 text-white">
      <div className="max-w-[560px] mx-auto flex items-center gap-1 px-2 h-14">
        {back !== undefined ? (
          <button
            type="button"
            onClick={() => (typeof back === "string" ? go(back) : back())}
            className="size-11 grid place-items-center rounded-xl active:bg-white/10"
            aria-label="Voltar"
          >
            <ArrowLeft className="size-6" />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="font-semibold text-[16px] truncate">{title}</p>
          {subtitle ? <p className="text-[12px] text-brand-200 truncate">{subtitle}</p> : null}
        </div>
        <SyncPill />
        {right}
      </div>
    </header>
  );
}

/** Estado da conexão e da fila — sempre visível. Toque = sincronizar agora. */
export function SyncPill() {
  const local = useLocal();
  const pending = pendingCount(local);
  const { online, syncing } = local.sync;
  let label: string;
  let icon: ReactNode;
  let tone: string;
  if (!online) {
    label = pending ? `Sem sinal · ${pending}` : "Sem sinal";
    icon = <CloudOff className="size-3.5" />;
    tone = "bg-warn-bg text-warn";
  } else if (syncing) {
    label = "Enviando…";
    icon = <Loader2 className="size-3.5 animate-spin" />;
    tone = "bg-white/15 text-white";
  } else if (pending) {
    label = `${pending} a enviar`;
    icon = <RefreshCw className="size-3.5" />;
    tone = "bg-sync-bg text-sync";
  } else {
    label = "Salvo";
    icon = <CheckCircle2 className="size-3.5" />;
    tone = "bg-white/10 text-brand-100";
  }
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className={clsx("h-8 px-2.5 rounded-full inline-flex items-center gap-1.5 text-[12px] font-semibold mr-1", tone)}
      aria-label={`Sincronização: ${label}. Toque para enviar agora.`}
      title={local.sync.lastSyncAt ? `Última sincronização ${fmtAgo(local.sync.lastSyncAt)}` : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Atualizar: envia o que está no celular, busca a programação e as lojas do
 * servidor e recarrega a tela (pega também versões novas do app). Sem sinal, só avisa.
 */
export function RefreshButton({ label = true }: { label?: boolean }) {
  const local = useLocal();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!navigator.onLine) {
          toast("Sem sinal agora. Tente de novo quando a internet voltar.", "warn");
          return;
        }
        setBusy(true);
        try {
          await refreshAll();
        } finally {
          window.location.reload();
        }
      }}
      className={clsx("h-8 rounded-full inline-flex items-center gap-1.5 text-[12px] font-semibold bg-white text-brand-900 active:bg-brand-100", label ? "px-3" : "w-8 justify-center")}
      aria-label="Atualizar"
      title={local.bootstrapAt ? `Atualizado ${fmtAgo(local.bootstrapAt)}` : undefined}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
      {label ? "Atualizar" : null}
    </button>
  );
}

export function BottomTabs({ active }: { active: "hoje" | "lojas" | "historico" | "perfil" }) {
  const local = useLocal();
  const corrections = Object.values(local.visits).reduce((n, v) => n + Object.values(v.attendances).filter((a) => a.status === "correction_requested").length, 0);
  const tabs = [
    { id: "hoje", label: "Hoje", icon: CalendarDays, href: "", badge: corrections },
    { id: "lojas", label: "Lojas", icon: Store, href: "lojas", badge: 0 },
    { id: "historico", label: "Histórico", icon: History, href: "historico", badge: 0 },
    { id: "perfil", label: "Perfil", icon: UserRound, href: "perfil", badge: 0 },
  ] as const;
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-safe" aria-label="Navegação principal">
      <div className="max-w-[560px] mx-auto grid grid-cols-4">
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = t.id === active;
          return (
            <button key={t.id} type="button" onClick={() => go(t.href)} className={clsx("h-16 flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold relative", on ? "text-brand-800" : "text-muted")} aria-current={on ? "page" : undefined}>
              <Icon className="size-6" strokeWidth={on ? 2.4 : 2} />
              {t.label}
              {t.badge ? <span className="absolute top-2 left-1/2 ml-2 min-w-5 h-5 px-1 rounded-full bg-bad text-white text-[11px] grid place-items-center">{t.badge}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ───────────────────────────── Folha inferior / diálogo ─────────────────────────────

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div ref={ref} className="relative w-full max-w-[560px] max-h-[92dvh] flex flex-col bg-surface rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-pop)] animate-rise">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0 text-[17px] font-semibold text-ink">{title}</div>
          <button type="button" onClick={onClose} className="size-10 -mr-2 -mt-1 grid place-items-center rounded-xl text-muted active:bg-black/5" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3 pb-safe">{footer}</div> : null}
      </div>
    </div>
  );
}

// ───────────────────────────── Aviso rápido ─────────────────────────────

let toastListener: ((msg: { text: string; tone: "ok" | "warn" | "bad" }) => void) | null = null;

export function toast(text: string, tone: "ok" | "warn" | "bad" = "ok") {
  toastListener?.({ text, tone });
}

export function ToastHost() {
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" | "bad"; key: number } | null>(null);
  useEffect(() => {
    toastListener = (m) => setMsg({ ...m, key: Date.now() });
    return () => {
      toastListener = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  const tone = msg.tone === "ok" ? "bg-ink text-white" : msg.tone === "warn" ? "bg-warn text-white" : "bg-bad text-white";
  return (
    <div className="fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
      <div key={msg.key} className={clsx("max-w-[520px] rounded-2xl px-4 py-3 text-[14px] font-medium shadow-[var(--shadow-pop)] animate-rise", tone)}>
        {msg.text}
      </div>
    </div>
  );
}

// ───────────────────────────── Peças de formulário ─────────────────────────────

export function Chip({ selected, onClick, children, tone = "brand" }: { selected: boolean; onClick: () => void; children: ReactNode; tone?: "brand" | "bad" | "warn" }) {
  const on = { brand: "bg-brand-800 text-white border-brand-800", bad: "bg-bad text-white border-bad", warn: "bg-warn text-white border-warn" }[tone];
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={clsx("min-h-11 px-3.5 py-2 rounded-xl border text-[14px] font-semibold text-left transition-colors", selected ? on : "bg-surface text-ink border-line-strong active:bg-canvas")}>
      {children}
    </button>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3, maxLength = 500, label }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number; label?: string }) {
  return (
    <label className="block">
      {label ? <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">{label}</span> : null}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
      />
    </label>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 mt-6 mb-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Notice({ tone, icon, children, action }: { tone: "info" | "warn" | "bad" | "ok" | "sync"; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const cls = { info: "bg-info-bg text-info", warn: "bg-warn-bg text-warn", bad: "bg-bad-bg text-bad", ok: "bg-ok-bg text-ok", sync: "bg-sync-bg text-sync" }[tone];
  return (
    <div className={clsx("rounded-2xl px-4 py-3 text-[14px] flex gap-3 items-start", cls)}>
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="flex-1 min-w-0 font-medium">{children}</div>
      {action}
    </div>
  );
}
