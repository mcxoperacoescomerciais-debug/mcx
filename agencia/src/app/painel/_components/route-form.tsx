"use client";

import type { ReactNode } from "react";

/**
 * Formulário GET cujo destino depende de um campo: "store" vira
 * /api/reports/store/{id}; "export" vira /api/export/{dataset}.
 */
export function RouteForm({ kind, className, children }: { kind: "store" | "export"; className?: string; children: ReactNode }) {
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const key = kind === "store" ? "id" : "dataset";
        const target = String(data.get(key) ?? "");
        if (!target) return;
        data.delete(key);
        const q = new URLSearchParams();
        data.forEach((v, k) => {
          if (v) q.set(k, String(v));
        });
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- rota de API/route handler, exige navegação completa
        window.location.href = `${kind === "store" ? "/api/reports/store/" : "/api/export/"}${encodeURIComponent(target)}?${q.toString()}`;
      }}
    >
      {children}
    </form>
  );
}
