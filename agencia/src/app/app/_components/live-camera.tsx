"use client";

/**
 * Câmera dentro do app (Android). Abrir a câmera do celular tira o navegador da frente e,
 * em aparelho com pouca memória, o Android fecha o navegador: ao voltar aparece "Devido à
 * insuficiência de memória…", a página recarrega e a foto se perde. Aqui a imagem da câmera
 * aparece na própria tela — o navegador nunca sai da frente.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

/** Só no Android (no iPhone a câmera do sistema não derruba o navegador). */
export function canUseLiveCamera(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function LiveCamera({ onShot, onClose, onFallback }: { onShot: (photo: Blob) => void; onClose: () => void; onFallback: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"opening" | "ready" | "failed">("opening");
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => undefined);
        }
        setState("ready");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || shooting) return;
    setShooting(true);
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    canvas.width = 0;
    canvas.height = 0;
    if (blob) onShot(blob);
    else {
      setShooting(false);
      setState("failed");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Câmera">
      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 w-full h-full object-contain" />
        {state === "opening" ? (
          <div className="absolute inset-0 grid place-items-center text-white">
            <div className="flex items-center gap-2 text-[15px]">
              <Loader2 className="size-5 animate-spin" /> Abrindo a câmera…
            </div>
          </div>
        ) : null}
        {state === "failed" ? (
          <div className="absolute inset-0 grid place-items-center px-6">
            <div className="text-center text-white space-y-4">
              <p className="text-[16px] font-semibold">Não foi possível abrir a câmera aqui.</p>
              <p className="text-[14px] text-white/80">Se o celular perguntou, toque em Permitir o uso da câmera. Ou use a câmera do celular.</p>
              <button type="button" onClick={onFallback} className="w-full h-14 rounded-2xl bg-white text-black text-[16px] font-bold">
                Usar a câmera do celular
              </button>
            </div>
          </div>
        ) : null}
        <button type="button" onClick={onClose} aria-label="Fechar câmera" className="absolute left-3 top-3 size-12 rounded-full bg-black/55 text-white grid place-items-center">
          <X className="size-6" />
        </button>
      </div>
      <div className="shrink-0 py-5 pb-safe flex flex-col items-center justify-center gap-3 bg-black">
        {state !== "failed" ? (
          <button type="button" onClick={onFallback} className="text-[13px] text-white/75 underline underline-offset-2">
            Câmera com problema? Usar a câmera do celular
          </button>
        ) : null}
        <button
          type="button"
          disabled={state !== "ready" || shooting}
          onClick={() => void shoot()}
          aria-label="Tirar foto"
          className="size-20 rounded-full bg-white grid place-items-center ring-4 ring-white/40 disabled:opacity-40 active:scale-95 transition"
        >
          {shooting ? <Loader2 className="size-8 animate-spin text-black" /> : <Camera className="size-8 text-black" />}
        </button>
      </div>
    </div>
  );
}
