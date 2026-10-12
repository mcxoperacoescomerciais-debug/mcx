"use client";

/**
 * Raiz do app do promotor: uma única página com navegação por hash. O app
 * inteiro abre e navega sem internet (o Service Worker guarda esta página e
 * os arquivos JS/CSS) e o botão "voltar" do Android funciona.
 */
import { useEffect } from "react";
import { Loader2, WifiOff } from "lucide-react";
import { initLocalStore } from "../_lib/local-store";
import { useHashRoute, useLocal } from "../_lib/hooks";
import { ToastHost } from "./primitives";
import { HomeScreen } from "./home-screen";
import { StoresScreen } from "./stores-screen";
import { HistoryScreen, ProfileScreen } from "./history-profile";
import { VisitScreen } from "./visit-screen";
import { AttendanceScreen } from "./attendance-screen";

/** Registra o Service Worker e aquece o cache com os arquivos já carregados. */
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
    const offline = state.ready && !state.sync.online;
    return (
      <div className="min-h-dvh grid place-items-center bg-brand-900 text-white px-8">
        <div className="text-center">
          {offline ? <WifiOff className="size-8 mx-auto text-brand-200" /> : <Loader2 className="size-8 animate-spin mx-auto text-brand-200" />}
          <p className="mt-3 text-[15px] text-brand-100">{offline ? "Sem sinal. Conecte-se uma vez para baixar seu roteiro; depois o app funciona sem internet." : "Carregando seu roteiro…"}</p>
        </div>
      </div>
    );
  }

  const [section, id, sub, subId, step] = route;
  let screen;
  if (section === "visita" && id && sub === "marca" && subId) screen = <AttendanceScreen key={subId} visitId={id} attendanceId={subId} step={step} />;
  else if (section === "visita" && id) screen = <VisitScreen key={id} visitId={id} closing={sub === "encerrar"} />;
  else if (section === "lojas") screen = <StoresScreen />;
  else if (section === "historico") screen = <HistoryScreen />;
  else if (section === "perfil") screen = <ProfileScreen />;
  else screen = <HomeScreen />;
  return (
    <>
      {screen}
      <ToastHost />
    </>
  );
}
