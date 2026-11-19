"use client";

/**
 * Foto ampliada que cabe inteira na tela; zoom pela rodinha do mouse (no ponto do cursor),
 * arrastar para mover quando ampliada, duplo clique alterna, botões + / − / ajustar.
 * Cada foto nova começa ajustada à tela (o Lightbox remonta pelo key).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";

const MIN = 1;
const MAX = 8;

export function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Zoom mantendo parado o ponto (cx, cy), relativo ao centro da área. */
  const zoomAt = useCallback((factor: number, cx = 0, cy = 0) => {
    setView((v) => {
      const scale = Math.min(MAX, Math.max(MIN, v.scale * factor));
      if (scale === MIN) return { scale: 1, x: 0, y: 0 };
      const k = scale / v.scale;
      return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const zoomed = view.scale > 1;
  return (
    <div className="absolute inset-0">
      <div
        ref={box}
        className="absolute inset-x-0 top-0 bottom-14 overflow-hidden flex items-center justify-center select-none"
        style={{ cursor: zoomed ? (dragging ? "grabbing" : "grab") : "zoom-in", touchAction: "none" }}
        onPointerDown={(e) => {
          if (!zoomed) return;
          drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setView((v) => ({ ...v, x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          if (zoomed) setView({ scale: 1, x: 0, y: 0 });
          else zoomAt(2.5, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain rounded-lg"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: dragging ? "none" : "transform 120ms ease-out" }}
        />
      </div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-white/10 px-1.5 py-1 text-white">
        <button type="button" onClick={() => zoomAt(1 / 1.4)} disabled={!zoomed} className="size-9 grid place-items-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Diminuir zoom">
          <ZoomOut className="size-5" />
        </button>
        <span className="w-12 text-center text-[12.5px] font-semibold tabular-nums">{Math.round(view.scale * 100)}%</span>
        <button type="button" onClick={() => zoomAt(1.4)} disabled={view.scale >= MAX} className="size-9 grid place-items-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Aumentar zoom">
          <ZoomIn className="size-5" />
        </button>
        <button type="button" onClick={() => setView({ scale: 1, x: 0, y: 0 })} disabled={!zoomed} className="size-9 grid place-items-center rounded-full hover:bg-white/15 disabled:opacity-40" aria-label="Ajustar à tela" title="Ajustar à tela">
          <Maximize className="size-4" />
        </button>
      </div>
    </div>
  );
}
