"use client";

/**
 * Raiz do app do promotor: uma única página com navegação por hash. Assim o
 * app inteiro abre e navega sem internet (o Service Worker guarda esta página
 * e os arquivos de JavaScript), e o botão "voltar" do Android funciona.
 */
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { initLocalStore } from "../_lib/local-store";
import { useHashRoute, useLocal } from "../_lib/hooks";
import { HistoryScreen, HomeScreen, ProfileScreen, StoresScreen } from "./home-screens";
import { DoneScreen, NotesScreen, ReviewScreen, VisitHub } from "./visit-screens";
import { DamageScreen, RuptureScreen, ValidityScreen } from "./section-screens";

/**
 * Registra o Service Worker e, assim que ele assume a página, pede de novo os
 * arquivos de JavaScript/CSS já carregados — passando por ele, ficam guardados
 * e o app abre sem sinal desde a primeira visita.
 */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  const warm = () => {
    const assets = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => u.startsWith(`${location.origin}/_next/static/`));
    for (const url of new Set(assets)) fetch(url).catch(() => {});
  };
  if (navigator.serviceWorker.controller) warm();
  else navigator.serviceWorker.addEventListener("controllerchange", warm, { once: true });
}

export function PromoterApp() {
  const route = useHashRoute();
  const state = useLocal();

  useEffect(() => {
    void initLocalStore();
    registerServiceWorker();
  }, []);

  useEffect(() => {
    if (state.sessionExpired) window.location.replace("/sair");
  }, [state.sessionExpired]);

  if (!state.ready || !state.bootstrap) {
    return (
      <div className="min-h-dvh grid place-items-center bg-navy-900 text-white">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin mx-auto text-gold-400" />
          <p className="mt-3 text-[14px] text-silver-300">{state.ready && !state.sync.online ? "Sem sinal. Conecte-se uma vez para baixar suas lojas." : "Carregando suas lojas…"}</p>
        </div>
      </div>
    );
  }

  const [section, id, sub] = route;
  if (section === "visita" && id) {
    switch (sub) {
      case "validade":
        return <ValidityScreen key={id} visitId={id} location="sales_floor" />;
      case "estoque":
        return <ValidityScreen key={`${id}-stock`} visitId={id} location="stock" />;
      case "ruptura":
        return <RuptureScreen visitId={id} />;
      case "avaria":
        return <DamageScreen visitId={id} />;
      case "obs":
        return <NotesScreen visitId={id} />;
      case "conferir":
        return <ReviewScreen visitId={id} />;
      case "ok":
        return <DoneScreen visitId={id} />;
      default:
        return <VisitHub visitId={id} />;
    }
  }
  if (section === "lojas") return <StoresScreen />;
  if (section === "historico") return <HistoryScreen />;
  if (section === "perfil") return <ProfileScreen />;
  return <HomeScreen />;
}
