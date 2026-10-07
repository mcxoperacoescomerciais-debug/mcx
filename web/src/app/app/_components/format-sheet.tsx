"use client";

/**
 * Escolha do formato da loja (ex.: ABC Varejo, Plus ou Cash). Cada formato
 * tem um mix de produtos diferente, então o promotor informa uma vez qual é a
 * loja; a escolha fica salva no aparelho (vale sem internet) e no cadastro.
 */
import { Check } from "lucide-react";
import clsx from "clsx";
import { Sheet } from "./primitives";
import { STORE_FORMAT_LABEL, type StoreFormat } from "@/lib/domain";
import type { BootstrapStore } from "@/lib/sync-types";

const ORDER: string[] = Object.keys(STORE_FORMAT_LABEL);

const HINT: Record<string, string> = {
  varejo: "Supermercado de bairro",
  plus: "Loja maior, linha completa",
  cash: "Atacarejo / atacado",
};

export function FormatSheet({ store, onClose, onChoose }: { store: BootstrapStore | null; onClose: () => void; onChoose: (format: string) => void }) {
  if (!store) return null;
  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gold-600">Qual é o tipo desta loja?</p>
          <h2 className="text-[18px] font-semibold text-ink leading-snug">
            {store.name}
            {store.code ? ` · ${store.code}` : ""}
          </h2>
        </div>
      }
    >
      <p className="text-[14px] text-ink-2 mb-3">Cada tipo de {store.network} tem uma lista de produtos diferente. Toque no tipo desta loja para iniciar a visita.</p>
      <div className="space-y-2 pb-2">
        {[...store.formatOptions].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onChoose(f)}
            className={clsx(
              "w-full h-16 rounded-2xl border px-4 flex items-center justify-between text-left active:bg-navy-50",
              store.format === f ? "border-navy-900 bg-navy-50" : "border-line-strong bg-surface",
            )}
          >
            <span>
              <span className="block text-[17px] font-semibold text-ink">
                {store.network.replace(/^Super\s+/i, "")} {STORE_FORMAT_LABEL[f as StoreFormat] ?? f}
              </span>
              <span className="block text-[12.5px] text-muted">
                {HINT[f] ?? ""} · {store.mixByFormat[f]?.length ?? 0} produtos
              </span>
            </span>
            {store.format === f ? <Check className="size-5 text-navy-900" /> : null}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
