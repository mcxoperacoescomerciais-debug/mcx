"use client";
/**
 * "Tempo no sistema": a cada 60 s, se a aba está visível e houve clique, toque
 * ou digitação nos últimos 5 minutos, avisa o servidor. Só o sinal — nenhum
 * conteúdo digitado, tela ou endereço é enviado. Nada bloqueia nem alerta.
 */
import { useEffect } from "react";

const IDLE_MS = 5 * 60_000;

export function ActivityBeacon() {
  useEffect(() => {
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || Date.now() - last > IDLE_MS) return;
      void fetch("/api/atividade", { method: "POST", keepalive: true }).catch(() => {});
    }, 60_000);
    return () => {
      clearInterval(timer);
      for (const e of events) window.removeEventListener(e, touch);
    };
  }, []);
  return null;
}
