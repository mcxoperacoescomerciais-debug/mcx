"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { localStore, type LocalState, type LocalVisit } from "./local-store";
import type { BootstrapProduct, BootstrapStore } from "@/lib/sync-types";

export function useLocal(): LocalState {
  return useSyncExternalStore(localStore.subscribe, localStore.getSnapshot, localStore.getServerSnapshot);
}

/**
 * Aplica o formato escolhido pelo promotor (ex.: ABC Plus) sobre a loja do
 * catálogo: troca o mix e os códigos da rede pelos do formato escolhido.
 */
function withFormat(store: BootstrapStore, choice: string | undefined): BootstrapStore {
  const format = choice && store.formatOptions?.includes(choice) ? choice : store.format;
  if (!store.mixByFormat) return store;
  return {
    ...store,
    format,
    mix: [...new Set([...(store.mixByFormat[format] ?? []), ...(store.seenProducts ?? [])])],
    chainCodes: store.chainCodesByFormat?.[format] ?? {},
  };
}

/** A loja precisa que o promotor escolha o formato (rede com mais de um mix e formato ainda não definido). */
export function needsFormatChoice(store: BootstrapStore | undefined): boolean {
  return Boolean(store && (store.formatOptions?.length ?? 0) > 1 && !store.format);
}

export function useCatalog() {
  const { bootstrap, formatChoices } = useLocal();
  return useMemo(() => {
    const products = bootstrap?.products ?? [];
    const stores = (bootstrap?.stores ?? []).map((s) => withFormat(s, formatChoices[s.id]));
    return {
      products,
      stores,
      productById: new Map<string, BootstrapProduct>(products.map((p) => [p.id, p])),
      storeById: new Map<string, BootstrapStore>(stores.map((s) => [s.id, s])),
      bands: bootstrap?.bands,
    };
  }, [bootstrap, formatChoices]);
}

export function useVisit(visitId: string): LocalVisit | undefined {
  return useLocal().visits[visitId];
}

/** Rota baseada em hash (#/visita/123/validade): funciona offline e respeita o "voltar" do Android. */
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

export function back(fallback: string) {
  if (window.history.length > 1) window.history.back();
  else go(fallback, true);
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
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
