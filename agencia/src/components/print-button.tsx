"use client";

import { Printer } from "lucide-react";

export function PrintButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex items-center gap-2 rounded-full border border-current/30 px-4 py-2 text-[13px] font-semibold transition hover:bg-white/10 print:hidden ${className}`}
    >
      <Printer className="size-4" aria-hidden="true" /> Imprimir ou salvar em PDF
    </button>
  );
}
