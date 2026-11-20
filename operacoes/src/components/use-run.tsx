"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

type ActionResult = { ok: boolean; error?: string; message?: string };

/** Roda uma action, mostra erro ou mensagem e atualiza a página. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  function run(fn: () => Promise<ActionResult>, after?: () => void) {
    setNote(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setNote({ ok: false, text: r.error ?? "Não foi possível salvar." });
      if (r.message) setNote({ ok: true, text: r.message });
      after?.();
      router.refresh();
    });
  }
  const message = note && (
    <p role={note.ok ? "status" : "alert"} className={clsx("rounded-lg px-3 py-2 text-sm", note.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad")}>
      {note.text}
    </p>
  );
  return { run, pending, message };
}
