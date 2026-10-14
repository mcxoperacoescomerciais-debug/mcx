"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { localStore, type LocalState, type LocalVisit } from "./local-store";
import type { BootstrapBrand, BootstrapProduct, BootstrapSchedule, BootstrapStore } from "@/lib/sync-types";

export function useLocal(): LocalState {
  return useSyncExternalStore(localStore.subscribe, localStore.getSnapshot, localStore.getServerSnapshot);
}

export function useCatalog() {
  const { bootstrap, visits } = useLocal();
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
    // Formato da loja (mix) escolhido neste aparelho e ainda não confirmado pelo servidor.
    const localMix = new Map<string, string>();
    for (const v of Object.values(visits)) for (const [b, m] of Object.entries(v.mixChoices ?? {})) localMix.set(`${v.storeId}:${b}`, m);
    const mixes = bootstrap?.mixes ?? [];
    const serverMix = bootstrap?.storeMixes ?? {};
    /** Formatos a escolher (ex.: ABC VAREJO/PLUS/CASH) — vazio quando a loja já tem o seu. */
    const mixOptions = (storeId: string, brandId: string) => {
      const chainId = stores.find((s) => s.id === storeId)?.chainId;
      const opts = mixes.filter((m) => m.chainId === chainId && m.brandId === brandId);
      if (opts.length < 2 || serverMix[storeId]?.[brandId] || localMix.has(`${storeId}:${brandId}`)) return [];
      return opts;
    };
    const mixName = (storeId: string, brandId: string): string | null => {
      const id = localMix.get(`${storeId}:${brandId}`) ?? serverMix[storeId]?.[brandId];
      return mixes.find((m) => m.id === id)?.name ?? null;
    };
    /** Produtos acompanhados (lista própria da loja, mix escolhido no aparelho, ou todos os ativos da marca). */
    const trackedProducts = (storeId: string, brandId: string): BootstrapProduct[] => {
      const all = productsByBrand.get(brandId) ?? [];
      const chosen = localMix.get(`${storeId}:${brandId}`);
      if (chosen && !serverMix[storeId]?.[brandId]) {
        const ids = mixes.find((m) => m.id === chosen)?.productIds ?? [];
        const own = all.filter((p) => ids.includes(p.id));
        if (own.length) return own;
      }
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
      mixOptions,
      mixName,
      scheduleById: new Map<string, BootstrapSchedule>((bootstrap?.schedules ?? []).map((s) => [s.id, s])),
    };
  }, [bootstrap, visits]);
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
