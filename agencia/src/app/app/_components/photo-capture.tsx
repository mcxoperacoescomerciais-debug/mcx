"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, CloudUpload, Expand, ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { PhotoKind } from "@/lib/domain";
import { fmtTime } from "@/lib/dates";
import { addPhoto, getPhotoBlob, removePhoto, type LocalPhoto, type PhotoLink } from "../_lib/local-store";
import { haptic, useObjectUrl } from "../_lib/hooks";
import { preparePhoto } from "../_lib/photo";
import { Sheet, toast } from "./primitives";

/** Miniatura: do aparelho (ainda não enviada) ou do servidor (já enviada). */
export function PhotoThumb({ photo, className, full = false }: { photo: LocalPhoto; className?: string; full?: boolean }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    let alive = true;
    if (photo.local) {
      void (async () => {
        const b = (!full ? await getPhotoBlob(photo.id, true) : undefined) ?? (await getPhotoBlob(photo.id));
        if (alive) setBlob(b ?? null);
      })();
    }
    return () => {
      alive = false;
    };
  }, [photo.id, photo.local, full]);
  const localUrl = useObjectUrl(blob);
  const src = localUrl ?? (photo.uploaded ? `/api/photos/${photo.id}${full ? "" : "?size=thumb"}` : null);
  if (!src) return <div className={clsx("bg-canvas grid place-items-center text-muted text-[12px]", className)}>Sem prévia</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={clsx("object-cover bg-canvas", className)} />;
}

export function PhotoStatus({ photo }: { photo: LocalPhoto }) {
  if (photo.uploaded)
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-ok">
        <CheckCircle2 className="size-3.5" /> Enviada
      </span>
    );
  if (photo.lastError)
    return <span className="text-[11.5px] font-semibold text-bad">{photo.lastError}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-sync">
      <CloudUpload className="size-3.5" /> No celular · aguardando envio
    </span>
  );
}

interface CaptureProps {
  visitId: string;
  attendanceId: string;
  kind: PhotoKind;
  photos: LocalPhoto[];
  min: number;
  allowGallery: boolean;
  editable: boolean;
  title: string;
  cta: string;
  link?: PhotoLink;
  compact?: boolean;
}

/** Captura com câmera traseira (prioridade) e galeria (se a marca permitir). */
export function PhotoCapture({ visitId, attendanceId, kind, photos, min, allowGallery, editable, title, cta, link, compact }: CaptureProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [viewing, setViewing] = useState<LocalPhoto | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>, source: "camera" | "gallery") {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      setReplacing(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast("Escolha uma imagem.", "warn");
      return;
    }
    setBusy(true);
    try {
      const { full, thumb } = await preparePhoto(file);
      if (replacing) await removePhoto(visitId, attendanceId, replacing);
      await addPhoto(visitId, attendanceId, kind, source, full, thumb, link);
      haptic(25);
      toast(replacing ? "Foto substituída e salva no celular." : "Foto salva no celular.");
    } catch {
      toast("Não foi possível guardar a foto. Tente de novo.", "bad");
    } finally {
      setBusy(false);
      setReplacing(null);
    }
  }

  const done = photos.length >= min;

  return (
    <div>
      {!compact ? (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">{title}</h2>
          {min > 0 ? (
            <span className={clsx("text-[12px] font-semibold rounded-full px-2 py-0.5", done ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>
              {photos.length}/{min} obrigatória{min > 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-[12px] text-muted">{photos.length} foto(s)</span>
          )}
        </div>
      ) : null}

      {photos.length ? (
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {photos.map((p) => (
            <figure key={p.id} className="bg-surface border border-line rounded-2xl overflow-hidden">
              <button type="button" className="relative block w-full" onClick={() => setViewing(p)} aria-label="Ampliar foto">
                <PhotoThumb photo={p} className="w-full aspect-[4/3]" />
                <span className="absolute right-1.5 top-1.5 size-7 rounded-lg bg-black/45 text-white grid place-items-center">
                  <Expand className="size-4" />
                </span>
              </button>
              <figcaption className="px-2.5 py-2 space-y-1">
                <PhotoStatus photo={p} />
                <p className="text-[11.5px] text-muted tnum">
                  {fmtTime(p.takenAt)} · {p.source === "gallery" ? "galeria" : "câmera"}
                </p>
                {editable ? (
                  <div className="flex gap-1 pt-0.5">
                    <button
                      type="button"
                      className="flex-1 h-9 rounded-lg bg-canvas text-[12.5px] font-semibold text-ink-2 flex items-center justify-center gap-1"
                      onClick={() => {
                        setReplacing(p.id);
                        cameraRef.current?.click();
                      }}
                    >
                      <RefreshCw className="size-3.5" /> Substituir
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir foto"
                      className="size-9 rounded-lg bg-canvas text-bad grid place-items-center"
                      onClick={async () => {
                        await removePhoto(visitId, attendanceId, p.id);
                        toast(p.uploaded ? "Foto removida (o original fica guardado no histórico)." : "Foto removida.");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {editable ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className={clsx(
              "w-full rounded-2xl font-bold flex items-center justify-center gap-2.5 active:scale-[0.99] transition",
              compact ? "h-12 text-[14px] bg-surface border border-line-strong text-ink" : photos.length ? "h-14 text-[15px] bg-surface border-2 border-brand-700 text-brand-800" : "h-20 text-[16px] bg-brand-800 text-white",
            )}
          >
            {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
            {busy ? "Preparando foto…" : photos.length ? "Adicionar outra foto" : cta}
          </button>
          {allowGallery ? (
            <button type="button" disabled={busy} onClick={() => galleryRef.current?.click()} className="w-full h-11 rounded-xl text-[14px] font-semibold text-ink-2 flex items-center justify-center gap-2 active:bg-surface">
              <ImagePlus className="size-4" /> Escolher da galeria
            </button>
          ) : null}
        </div>
      ) : photos.length === 0 ? (
        <p className="text-[14px] text-muted bg-surface border border-line rounded-2xl p-4">Nenhuma foto registrada.</p>
      ) : null}

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e, "camera")} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e, "gallery")} />

      <Sheet open={Boolean(viewing)} onClose={() => setViewing(null)} title="Foto">
        {viewing ? (
          <div className="space-y-2">
            <PhotoThumb photo={viewing} full className="w-full rounded-xl" />
            <PhotoStatus photo={viewing} />
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
