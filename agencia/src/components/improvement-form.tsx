"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Lightbulb, Loader2, XCircle } from "lucide-react";
import clsx from "clsx";
import { buttonClass, inputClass } from "@/components/ui";
import { IMPROVEMENT_LIMITS } from "@/lib/improvements";
import { submitImprovementAction } from "@/app/_actions/improvements";

/** Formulário de sugestão de melhoria (painel e app do promotor). */
export function ImprovementForm({ origin, onSent, large = false }: { origin: string; onSent?: () => void; large?: boolean }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setResult({ ok: false, text: "Sem internet agora. Tente de novo quando tiver sinal." });
      return;
    }
    start(async () => {
      try {
        const r = await submitImprovementAction({ title, description, origin });
        if (r.ok) {
          setTitle("");
          setDescription("");
          setResult({ ok: true, text: r.message ?? "Sugestão enviada." });
          onSent?.();
        } else setResult({ ok: false, text: r.error });
      } catch {
        setResult({ ok: false, text: "Não foi possível enviar agora. Confira a internet e tente de novo." });
      }
    });
  };

  const field = clsx(inputClass, large && "!h-12 text-[15px]");
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-2">O que você quer melhorar?</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={IMPROVEMENT_LIMITS.title} placeholder="Ex.: Avisar quando faltar foto do depois" className={field + " mt-1"} />
      </label>
      <label className="block">
        <span className="text-[13px] font-semibold text-ink-2">Conte os detalhes</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={IMPROVEMENT_LIMITS.description}
          rows={large ? 5 : 4}
          placeholder="O que acontece hoje, o que atrapalha e como ficaria melhor."
          className={inputClass + " !h-auto py-2 mt-1 leading-relaxed" + (large ? " text-[15px]" : "")}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", large ? "lg" : "md", large ? "w-full" : undefined)}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Lightbulb className="size-4" />}
          Enviar sugestão
        </button>
        {result ? (
          <p role="status" className={clsx("text-[13px] font-medium inline-flex items-center gap-1.5", result.ok ? "text-ok" : "text-bad")}>
            {result.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <XCircle className="size-4 shrink-0" />}
            {result.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
