"use client";

/** Utilidades compartilhadas pelas telas da visita. */
import { classify, daysBetween } from "@/lib/validity";
import type { BootstrapStore } from "@/lib/sync-types";
import type { LocalOccurrence, LocalVisit } from "../_lib/local-store";
import { go, useCatalog } from "../_lib/hooks";

export type Section = "validade" | "estoque" | "ruptura" | "avaria";

export function sectionItems(v: LocalVisit, section: Section): LocalOccurrence[] {
  const all = Object.values(v.occurrences).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  switch (section) {
    case "validade":
      return all.filter((o) => o.type === "validity" && o.location !== "stock");
    case "estoque":
      return all.filter((o) => o.type === "validity" && o.location === "stock");
    case "ruptura":
      return all.filter((o) => o.type === "rupture");
    case "avaria":
      return all.filter((o) => o.type === "damage");
  }
}

export function useSeverityOf() {
  const { bands } = useCatalog();
  return (o: LocalOccurrence, visitDate: string) => {
    if (!o.expiryDate) return null;
    const days = daysBetween(visitDate, o.expiryDate);
    return { days, severity: classify(days, bands) };
  };
}

export function storeTitle(store: BootstrapStore | undefined) {
  if (!store) return "Loja";
  return `${store.name}${store.code ? ` · ${store.code}` : ""}`;
}

export function MissingVisit() {
  return (
    <div className="p-8 text-center">
      <p className="font-semibold">Visita não encontrada neste aparelho.</p>
      <button type="button" onClick={() => go("", true)} className="mt-4 h-12 px-5 rounded-xl bg-navy-900 text-white font-semibold">
        Voltar ao início
      </button>
    </div>
  );
}
