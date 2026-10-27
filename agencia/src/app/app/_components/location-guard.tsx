"use client";

/**
 * Localização do promotor (obrigatória para o acompanhamento em tempo real):
 * - primeiro acesso: aviso em tela cheia pedindo para permitir;
 * - se ficar bloqueada: o aviso volta a cada 15 minutos;
 * - a cada 2 minutos com o app aberto: envia ao servidor se está liberada e,
 *   se estiver, a posição atual (aparece no mapa do gestor).
 * O navegador só pergunta uma vez; depois de "Bloquear", a liberação é feita
 * nas configurações do site no celular — o aviso explica o caminho.
 */
import { useCallback, useEffect, useState } from "react";
import { MapPin, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";

type Perm = "granted" | "denied" | "prompt" | "unsupported";

const ASKED_KEY = "mcx-geo-asked-v1";
const REMIND_KEY = "mcx-geo-remind-at";
const BEAT_MS = 120_000;
const REMIND_MS = 15 * 60_000;

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* armazenamento indisponível: o aviso volta a aparecer, sem prejuízo */
    }
  },
};

async function permissionState(): Promise<Perm> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  try {
    const st = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    if (st) return st.state as Perm;
  } catch {
    /* navegador sem a API de permissões: descobre ao pedir a posição */
  }
  return "prompt";
}

function currentPosition(timeout = 15_000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 60_000, timeout }));
}

async function beat(permission: Perm, pos?: GeolocationPosition | null) {
  try {
    await fetch("/api/promoter/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permission, lat: pos?.coords.latitude ?? null, lng: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null }),
      keepalive: true,
    });
  } catch {
    /* sem sinal: tenta de novo na próxima volta */
  }
}

export function LocationGuard() {
  const [perm, setPerm] = useState<Perm | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);

  // Uma volta: confere a permissão, envia o sinal (com a posição, se liberada) e decide se mostra o aviso.
  const tick = useCallback(async (fromTimer: boolean) => {
    let p = await permissionState();
    let pos: GeolocationPosition | null = null;
    if (p === "granted" || (p === "prompt" && store.get(ASKED_KEY) === "granted")) {
      try {
        pos = await currentPosition();
        p = "granted";
      } catch (e) {
        if ((e as GeolocationPositionError)?.code === 1) p = "denied";
      }
    }
    setPerm(p);
    void beat(p, pos);
    if (p === "granted" || p === "unsupported") {
      setOpen(false);
      return;
    }
    const firstTime = !store.get(ASKED_KEY);
    const last = Number(store.get(REMIND_KEY) ?? 0);
    // Ao abrir o app: sempre. Com o app aberto: no máximo a cada 15 minutos.
    if (firstTime || !fromTimer || Date.now() - last >= REMIND_MS) {
      store.set(REMIND_KEY, String(Date.now()));
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void tick(false), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void tick(true);
    }, BEAT_MS);
    // Lembrete a cada 15 min enquanto a localização estiver bloqueada.
    const r = setInterval(() => {
      if (document.visibilityState === "visible") void tick(true);
    }, REMIND_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      clearInterval(r);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);

  async function allow() {
    setAsking(true);
    try {
      const pos = await currentPosition(20_000);
      store.set(ASKED_KEY, "granted");
      setPerm("granted");
      setOpen(false);
      void beat("granted", pos);
    } catch (e) {
      store.set(ASKED_KEY, "asked");
      const denied = (e as GeolocationPositionError)?.code === 1;
      setPerm(denied ? "denied" : "prompt");
      void beat(denied ? "denied" : "prompt");
    } finally {
      setAsking(false);
    }
  }

  function later() {
    store.set(ASKED_KEY, store.get(ASKED_KEY) ?? "asked");
    store.set(REMIND_KEY, String(Date.now()));
    setOpen(false);
  }

  if (!open) return null;
  const blocked = perm === "denied";
  return (
    <div className="fixed inset-0 z-[100] bg-brand-950/80 grid place-items-center px-5" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }} role="dialog" aria-modal="true" aria-labelledby="geo-title">
      <div className="w-full max-w-md bg-surface rounded-3xl p-6 text-center shadow-2xl">
        <span className={`mx-auto size-16 rounded-2xl grid place-items-center ${blocked ? "bg-bad-bg text-bad" : "bg-info-bg text-info"}`}>{blocked ? <ShieldAlert className="size-9" /> : <MapPin className="size-9" />}</span>
        <h2 id="geo-title" className="mt-4 text-[22px] font-bold leading-tight">
          {blocked ? "Sua localização está bloqueada" : "Permita sua localização"}
        </h2>
        {blocked ? (
          <div className="mt-3 text-[15px] text-ink-2 text-left space-y-2">
            <p>O gestor precisa ver em qual loja você está. Libere a localização para este site:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Toque no cadeado (ou nos três pontinhos) ao lado do endereço do site.</li>
              <li>Abra <strong>Permissões</strong> ou <strong>Configurações do site</strong>.</li>
              <li>Em <strong>Localização</strong>, escolha <strong>Permitir</strong>.</li>
              <li>Volte aqui e toque em “Já liberei”.</li>
            </ol>
            <p className="text-[13px] text-muted">No iPhone: Ajustes › Safari › Localização › Permitir.</p>
          </div>
        ) : (
          <p className="mt-3 text-[15px] text-ink-2">
            O aplicativo usa sua localização durante o trabalho para registrar em qual loja você está. Na próxima tela, toque em <strong>Permitir</strong>. Você só precisa fazer isso uma vez.
          </p>
        )}
        <Button size="xl" className="w-full mt-5" disabled={asking} onClick={() => void (blocked ? tick(false) : allow())}>
          {asking ? "Aguardando…" : blocked ? "Já liberei" : "Permitir localização"}
        </Button>
        <button type="button" onClick={later} className="mt-3 text-[13px] text-muted font-medium">
          Agora não (vou ser lembrado em 15 minutos)
        </button>
      </div>
    </div>
  );
}
