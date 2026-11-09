"use client";

/** Cancela uma visita da rota avulsa (só antes de o promotor começar a visita). */
import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { cancelOnceVisitAction } from "../../actions";

export function CancelOnceButton({ scheduleId, promoterId }: { scheduleId: string; promoterId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!confirm)
    return (
      <button type="button" onClick={() => setConfirm(true)} className="text-[12.5px] font-semibold text-bad hover:underline inline-flex items-center gap-1">
        <X className="size-3.5" /> Cancelar
      </button>
    );
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelOnceVisitAction(scheduleId, promoterId);
              if (!r.ok) setError(r.error);
            })
          }
          className="h-8 px-3 rounded-lg bg-bad text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Confirmar cancelamento
        </button>
        <button type="button" onClick={() => setConfirm(false)} className="text-[12.5px] text-muted font-medium">
          Voltar
        </button>
      </span>
      {error ? <span className="text-[12px] text-bad">{error}</span> : null}
    </span>
  );
}
