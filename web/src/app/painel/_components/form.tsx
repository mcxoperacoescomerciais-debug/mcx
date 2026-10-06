/** Campos de formulário do painel (server-friendly, sem estado). */
import type { ComponentProps, ReactNode } from "react";
import clsx from "clsx";

export const fieldClass =
  "w-full h-10 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      {children}
      {hint ? <span className="block text-[11.5px] text-muted mt-1">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={clsx(fieldClass, props.className)} />;
}

export function Select({ children, ...props }: ComponentProps<"select">) {
  return (
    <select {...props} className={clsx(fieldClass, "pr-8", props.className)}>
      {children}
    </select>
  );
}

export function FormNotice({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="text-[13px] font-semibold text-[#B42318] bg-[#FDECEC] rounded-lg px-3 py-2">{error}</p>;
  if (ok) return <p className="text-[13px] font-semibold text-[#1D6B3A] bg-[#E7F6EC] rounded-lg px-3 py-2">{ok}</p>;
  return null;
}
