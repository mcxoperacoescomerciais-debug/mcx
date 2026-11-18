"use client";

/**
 * Botão "Corrigir" de uma linha do atendimento: abre uma janela com o formulário de
 * correção do gestor (o formulário em si vem pronto do servidor, como children).
 */
import { useRef, type ReactNode } from "react";
import { PencilLine, X } from "lucide-react";

export function CorrectDialog({ title, label = "Corrigir", children }: { title: string; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline whitespace-nowrap">
        <PencilLine className="size-3.5" /> {label}
      </button>
      <dialog ref={ref} className="m-auto w-[min(560px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-0 text-left text-ink backdrop:bg-black/40">
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <p className="text-[15px] font-semibold leading-snug">{title}</p>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="size-8 grid place-items-center rounded-lg text-muted hover:bg-subtle">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 pb-5 pt-3">{children}</div>
      </dialog>
    </>
  );
}
