"use client";

/**
 * Comparação ANTES | DEPOIS com ampliação e navegação entre fotos adicionais.
 * Miniaturas na tela; a foto original só é carregada ao ampliar.
 */
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CloudUpload, Download, ImageOff, X, ZoomIn } from "lucide-react";
import clsx from "clsx";

export interface ViewerPhoto {
  id: string;
  kind: string;
  label: string;
  takenAt: string;
  uploaded: boolean;
  source: string;
  caption?: string;
}

export function PhotoTile({ photo, onOpen, className }: { photo: ViewerPhoto; onOpen: () => void; className?: string }) {
  if (!photo.uploaded) {
    return (
      <div className={clsx("rounded-xl bg-sync-bg text-sync grid place-items-center text-center p-3", className)}>
        <div>
          <CloudUpload className="size-6 mx-auto" />
          <p className="text-[12px] font-semibold mt-1">Aguardando sincronização</p>
          <p className="text-[11px]">Declarada pelo aparelho às {photo.takenAt}</p>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={onOpen} className={clsx("relative group rounded-xl overflow-hidden bg-canvas", className)} aria-label={`Ampliar ${photo.label}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/photos/${photo.id}?size=thumb`} alt={photo.label} loading="lazy" className="w-full h-full object-cover" />
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition grid place-items-center">
        <ZoomIn className="size-6 text-white opacity-0 group-hover:opacity-100" />
      </span>
    </button>
  );
}

export function BeforeAfter({ before, after, compact = false }: { before: ViewerPhoto[]; after: ViewerPhoto[]; compact?: boolean }) {
  const all = [...before, ...after];
  const [index, setIndex] = useState<number | null>(null);
  const column = (title: string, list: ViewerPhoto[], offset: number) => (
    <div className="min-w-0">
      <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted mb-1.5">
        {title} <span className="font-medium normal-case">({list.length})</span>
      </p>
      {list.length ? (
        <div className="space-y-2">
          <PhotoTile photo={list[0]} onOpen={() => setIndex(offset)} className={clsx("w-full", compact ? "aspect-[4/3]" : "aspect-[4/3]")} />
          {list.length > 1 ? (
            <div className="grid grid-cols-4 gap-1.5">
              {list.slice(1).map((p, i) => (
                <PhotoTile key={p.id} photo={p} onOpen={() => setIndex(offset + i + 1)} className="aspect-square" />
              ))}
            </div>
          ) : null}
          {!compact ? <p className="text-[12px] text-muted">{list[0].takenAt} · {list[0].source === "gallery" ? "galeria" : "câmera"}</p> : null}
        </div>
      ) : (
        <div className="aspect-[4/3] rounded-xl border-2 border-dashed border-bad/40 bg-bad-bg/40 text-bad grid place-items-center text-center">
          <div>
            <ImageOff className="size-6 mx-auto" />
            <p className="text-[12.5px] font-semibold mt-1">Sem foto do {title.toLowerCase()}</p>
          </div>
        </div>
      )}
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {column("Antes", before, 0)}
        {column("Depois", after, before.length)}
      </div>
      {index !== null ? <Lightbox photos={all} index={index} onIndex={setIndex} onClose={() => setIndex(null)} /> : null}
    </>
  );
}

export function Gallery({ photos, wall = false }: { photos: ViewerPhoto[]; wall?: boolean }) {
  const [index, setIndex] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className={wall ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3" : "grid grid-cols-3 sm:grid-cols-5 gap-2"}>
        {photos.map((p, i) =>
          wall ? (
            <figure key={p.id} className="min-w-0">
              <PhotoTile photo={p} onOpen={() => setIndex(i)} className="aspect-[3/4] w-full" />
              {p.caption ? <figcaption className="mt-1.5 text-[11.5px] leading-snug text-ink-2 line-clamp-2">{p.caption}</figcaption> : null}
            </figure>
          ) : (
            <PhotoTile key={p.id} photo={p} onOpen={() => setIndex(i)} className="aspect-square" />
          ),
        )}
      </div>
      {index !== null ? <Lightbox photos={photos} index={index} onIndex={setIndex} onClose={() => setIndex(null)} /> : null}
    </>
  );
}

export function Lightbox({ photos, index, onIndex, onClose }: { photos: ViewerPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const p = photos[index];
  const step = useCallback(
    (d: number) => {
      let i = index;
      do i = (i + d + photos.length) % photos.length;
      while (!photos[i].uploaded && i !== index);
      onIndex(i);
    },
    [index, photos, onIndex],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);
  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <div className="flex items-center gap-3 px-4 h-14 text-white">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[14px] truncate">{p.label}</p>
          <p className="text-[12px] text-white/70 truncate">
            {p.takenAt} · {p.source === "gallery" ? "galeria" : "câmera"}
            {p.caption ? ` · ${p.caption}` : ""} · {index + 1}/{photos.length}
          </p>
        </div>
        <a href={`/api/photos/${p.id}?download=1`} className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center gap-1.5 text-[13px] font-semibold">
          <Download className="size-4" /> Baixar
        </a>
        <button type="button" onClick={onClose} className="size-9 grid place-items-center rounded-lg hover:bg-white/10" aria-label="Fechar">
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 relative grid place-items-center px-14 pb-6 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/photos/${p.id}`} alt={p.label} className="max-h-full max-w-full object-contain rounded-lg" />
        {photos.length > 1 ? (
          <>
            <button type="button" onClick={() => step(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" aria-label="Anterior">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" onClick={() => step(1)} className="absolute right-2 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center" aria-label="Próxima">
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
