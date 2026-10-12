"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { localStore, type LocalState, type LocalVisit } from "./local-store";
import type { BootstrapBrand, BootstrapProduct, BootstrapSchedule, BootstrapStore } from "@/lib/sync-types";

export function useLocal(): LocalState {
  return useSyncExternalStore(localStore.subscribe, localStore.getSnapshot, localStore.getServerSnapshot);
}

export function useCatalog() {
  const { bootstrap } = useLocal();
  return useMemo(() => {
    const brands = bootstrap?.brands ?? [];
    const stores = bootstrap?.stores ?? [];
    const products = bootstrap?.products ?? [];
    const storeProducts = bootstrap?.storeProducts ?? {};
    const productsByBrand = new Map<string, BootstrapProduct[]>();
    for (const p of products) {
      if (!productsByBrand.has(p.brandId)) productsByBrand.set(p.brandId, []);
      productsByBrand.get(p.brandId)!.push(p);
    }
    /** Produtos acompanhados (lista própria da loja ou todos os ativos da marca). */
    const trackedProducts = (storeId: string, brandId: string): BootstrapProduct[] => {
      const all = productsByBrand.get(brandId) ?? [];
      const custom = storeProducts[storeId];
      if (!custom) return all;
      const own = all.filter((p) => custom.includes(p.id));
      return own.length ? own : all;
    };
    return {
      brands,
      stores,
      products,
      schedules: bootstrap?.schedules ?? [],
      today: bootstrap?.today ?? "",
      settings: bootstrap?.settings,
      lastStock: bootstrap?.lastStock ?? {},
      brandById: new Map<string, BootstrapBrand>(brands.map((b) => [b.id, b])),
      storeById: new Map<string, BootstrapStore>(stores.map((s) => [s.id, s])),
      productById: new Map<string, BootstrapProduct>(products.map((p) => [p.id, p])),
      productsByBrand,
      trackedProducts,
      scheduleById: new Map<string, BootstrapSchedule>((bootstrap?.schedules ?? []).map((s) => [s.id, s])),
    };
  }, [bootstrap]);
}

export function useVisit(visitId: string): LocalVisit | undefined {
  return useLocal().visits[visitId];
}

/** Rota por hash (#/visita/123): funciona offline e respeita o "voltar" do Android. */
export function useHashRoute(): string[] {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const update = () => setHash(window.location.hash.replace(/^#\/?/, ""));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash.split("/").filter(Boolean);
}

export function go(path: string, replace = false) {
  const url = `#/${path.replace(/^\//, "")}`;
  if (replace) window.location.replace(url);
  else window.location.hash = url;
}

/** Feedback tátil curto ao salvar — o promotor não precisa olhar a tela. */
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem suporte */
  }
}

export function useObjectUrl(blob: Blob | undefined | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

/** Atualiza a cada minuto (para "atrasada", "há 5 min" etc.). */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
