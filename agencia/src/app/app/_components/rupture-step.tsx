"use client";

/**
 * Etapa Ruptura (modo SUINCO): lista completa dos produtos da marca na loja,
 * com busca. Um toque marca "Ruptura total"; outro toque desmarca. Produtos
 * com estoque zero ou "não encontrado" aparecem em destaque como sugestão.
 */
import { Check, PackageX } from "lucide-react";
import clsx from "clsx";
import { STOCK_STATE_SHORT } from "@/lib/domain";
import { suggestsRupture } from "@/lib/rules";
import type { BootstrapProduct } from "@/lib/sync-types";
import { toggleRupture, type LocalAttendance } from "../_lib/local-store";
import { haptic } from "../_lib/hooks";
import { toast } from "./primitives";
import { ProductSearchList } from "./item-fields";

interface Props {
  visitId: string;
  attendance: LocalAttendance;
  products: BootstrapProduct[];
  editable: boolean;
}

export function RuptureStep({ visitId, attendance, products, editable }: Props) {
  const marked = new Set(Object.values(attendance.ruptures).map((r) => r.productId));
  const suggested = (p: BootstrapProduct) => suggestsRupture(attendance.stock[p.id]?.state) && !marked.has(p.id);
  // Sugestões do estoque primeiro, depois a ordem do cadastro.
  const ordered = [...products].sort((a, b) => Number(suggested(b)) - Number(suggested(a)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Ruptura</h2>
        <span className={clsx("text-[12px] font-semibold rounded-full px-2 py-0.5", marked.size ? "bg-bad-bg text-bad" : "bg-canvas text-muted")}>{marked.size} em ruptura</span>
      </div>
      <p className="text-[13px] text-muted mb-3">Toque no produto que está em falta para marcar “Ruptura total”. Toque de novo para desmarcar.</p>

      <ProductSearchList
        products={ordered}
        highlight={suggested}
        onPick={async (p) => {
          if (!editable) return;
          const on = await toggleRupture(visitId, attendance.id, p.id, suggestsRupture(attendance.stock[p.id]?.state));
          haptic(on ? 25 : 10);
          toast(on ? `Ruptura total: ${p.name}` : "Ruptura desmarcada.", on ? "warn" : "ok");
        }}
        right={(p) =>
          marked.has(p.id) ? (
            <span className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-full bg-bad text-white text-[12.5px] font-bold">
              <Check className="size-4" /> Ruptura total
            </span>
          ) : suggested(p) ? (
            <span className="shrink-0 text-[12px] font-semibold text-bad text-right leading-tight">
              Estoque: {STOCK_STATE_SHORT[attendance.stock[p.id]!.state]}
              <span className="block font-normal">toque para marcar</span>
            </span>
          ) : editable ? (
            <span className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-full border border-line-strong text-ink-2 text-[12.5px] font-semibold">
              <PackageX className="size-4" /> Marcar
            </span>
          ) : null
        }
      />
    </div>
  );
}
