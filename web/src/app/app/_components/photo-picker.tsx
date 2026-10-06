"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { compressImage } from "../_lib/photo";
import { getPhotoBlob, type LocalPhoto } from "../_lib/local-store";
import { useObjectUrl } from "../_lib/hooks";

function Thumb({ blob, onRemove }: { blob: Blob | undefined; onRemove: () => void }) {
  const url = useObjectUrl(blob);
  return (
    <div className="relative size-20 shrink-0 rounded-xl overflow-hidden bg-navy-50 border border-line">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
      <button type="button" onClick={onRemove} className="absolute top-1 right-1 size-6 grid place-items-center rounded-full bg-navy-950/70 text-white" aria-label="Remover foto">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function StoredThumb({ photo, onRemove }: { photo: LocalPhoto; onRemove: () => void }) {
  const [blob, setBlob] = useState<Blob | undefined>();
  useEffect(() => {
    void getPhotoBlob(photo.id).then(setBlob);
  }, [photo.id]);
  if (photo.uploaded && !blob) {
    return (
      <div className="relative size-20 shrink-0 rounded-xl overflow-hidden bg-navy-50 border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/photos/${photo.id}`} alt="" className="size-full object-cover" />
      </div>
    );
  }
  return <Thumb blob={blob} onRemove={onRemove} />;
}

/**
 * Fotos de um item. `existing` são as já salvas no aparelho; `pending` são as
 * tiradas agora e ainda não vinculadas (o item só é salvo ao confirmar).
 */
export function PhotoPicker({
  existing,
  pending,
  onAdd,
  onRemoveExisting,
  onRemovePending,
  required,
}: {
  existing: LocalPhoto[];
  pending: Blob[];
  onAdd: (blob: Blob) => void;
  onRemoveExisting: (id: string) => void;
  onRemovePending: (index: number) => void;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const total = existing.length + pending.length;

  async function handleFiles(files: FileList | null, source: HTMLInputElement) {
    if (!files?.length) return;
    setBusy(true);
    for (const f of Array.from(files).slice(0, 6)) onAdd(await compressImage(f));
    setBusy(false);
    source.value = "";
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px] font-semibold text-ink-2">
          Fotos {required ? <span className="text-[#B42318]">*</span> : <span className="font-normal text-muted">(opcional)</span>}
        </span>
        {total ? <span className="text-[12px] text-muted">{total} foto{total > 1 ? "s" : ""}</span> : null}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="size-20 shrink-0 rounded-xl border-2 border-dashed border-line-strong text-ink-2 flex flex-col items-center justify-center gap-1 active:bg-navy-50"
        >
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6" />}
          <span className="text-[11px] font-semibold">Câmera</span>
        </button>
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className="size-20 shrink-0 rounded-xl border-2 border-dashed border-line-strong text-ink-2 flex flex-col items-center justify-center gap-1 active:bg-navy-50"
        >
          <ImagePlus className="size-6" />
          <span className="text-[11px] font-semibold">Galeria</span>
        </button>
        {existing.map((p) => (
          <StoredThumb key={p.id} photo={p} onRemove={() => onRemoveExisting(p.id)} />
        ))}
        {pending.map((b, i) => (
          <Thumb key={i} blob={b} onRemove={() => onRemovePending(i)} />
        ))}
      </div>
      {/* Câmera abre direto a câmera traseira; Galeria permite enviar uma foto já tirada. */}
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handleFiles(e.target.files, e.target)} />
      <input ref={gallery} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files, e.target)} />
    </div>
  );
}
