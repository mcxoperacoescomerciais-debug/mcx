"use client";

/**
 * Formulário de ação do gestor (server action) com estado de envio,
 * mensagem de sucesso/erro e proteção contra duplo clique.
 */
import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import clsx from "clsx";
import { buttonClass } from "@/components/ui";
import type { FormState } from "../actions";

export function ActionForm({
  action,
  hidden,
  children,
  submitLabel,
  variant = "primary",
  className,
  resetOnSuccess = true,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  children?: ReactNode;
  submitLabel: string;
  variant?: "primary" | "secondary" | "danger" | "success";
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={run} className={clsx("space-y-3", className)}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass(variant, "md")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitLabel}
        </button>
        {state ? (
          <p role="status" className={clsx("text-[13px] font-medium inline-flex items-center gap-1.5", state.ok ? "text-ok" : "text-bad")}>
            {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {state.ok ? state.message ?? "Feito." : state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Painel recolhível para ações menos frequentes. */
export function Disclosure({ label, children, tone = "neutral" }: { label: ReactNode; children: ReactNode; tone?: "neutral" | "danger" }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={clsx("rounded-xl border", tone === "danger" ? "border-bad/25" : "border-line")}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={clsx("w-full text-left px-4 py-3 text-[13.5px] font-semibold", tone === "danger" ? "text-bad" : "text-ink")}>
        {label}
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}
