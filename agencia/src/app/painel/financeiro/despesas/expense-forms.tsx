"use client";

/** Lançamento e encerramento de despesas administrativas e fixas. */
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { buttonClass, inputClass, selectClass } from "@/components/ui";
import { endExpenseAction, saveExpenseAction } from "../actions";
import type { FormState } from "../../actions";

export interface ExpenseDraft {
  id: string | null;
  name: string;
  category: string;
  amount: number | null;
  startMonth: string;
  endMonth: string | null;
  notes: string | null;
}

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-[13px] font-medium inline-flex items-center gap-1.5 ${state.ok ? "text-ok" : "text-bad"}`}>
      {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
      {state.ok ? state.message ?? "Salvo." : state.error}
    </p>
  );
}

const label = "block text-[12.5px] font-semibold text-ink-2 mb-1";

export function ExpenseForm({ draft, categories, cancelHref }: { draft: ExpenseDraft; categories: Record<string, string>; cancelHref?: string }) {
  const router = useRouter();
  const [state, run, pending] = useActionState<FormState, FormData>(async (prev, fd) => {
    const r = await saveExpenseAction(prev, fd);
    if (r?.ok && draft.id && cancelHref) router.push(cancelHref);
    return r;
  }, null);
  const once = draft.id !== null && draft.endMonth === draft.startMonth;
  const [recurring, setRecurring] = useState(once ? "once" : "monthly");
  return (
    <form action={run} key={draft.id ?? "new"} className="space-y-3">
      {draft.id ? <input type="hidden" name="id" value={draft.id} /> : null}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Despesa</span>
          <input name="name" defaultValue={draft.name} placeholder="Ex.: Aluguel do escritório" className={inputClass} required />
        </label>
        <label className="block">
          <span className={label}>Categoria</span>
          <select name="category" defaultValue={draft.category} className={selectClass} required>
            <option value="">Escolha…</option>
            {Object.entries(categories).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className={label}>Valor por mês (R$)</span>
          <input name="amount" inputMode="decimal" defaultValue={draft.amount === null ? "" : draft.amount.toFixed(2).replace(".", ",")} placeholder="0,00" className={inputClass + " tnum"} required />
        </label>
        <label className="block">
          <span className={label}>Tipo</span>
          <select name="recurring" value={recurring} onChange={(e) => setRecurring(e.target.value)} className={selectClass}>
            <option value="monthly">Todo mês (recorrente)</option>
            <option value="once">Só neste mês</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>{recurring === "once" ? "Mês" : "A partir de"}</span>
          <input type="month" name="startMonth" defaultValue={draft.startMonth} className={inputClass} required />
        </label>
        {recurring === "monthly" ? (
          <label className="block">
            <span className={label}>Até (opcional)</span>
            <input type="month" name="endMonth" defaultValue={draft.endMonth ?? ""} className={inputClass} />
          </label>
        ) : null}
      </div>
      <label className="block">
        <span className={label}>Observação</span>
        <input name="notes" defaultValue={draft.notes ?? ""} placeholder="Opcional" className={inputClass} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} {draft.id ? "Salvar alterações" : "Lançar despesa"}
        </button>
        {draft.id && cancelHref ? (
          <a href={cancelHref} className={buttonClass("ghost")}>Cancelar</a>
        ) : null}
        <Status state={state} />
      </div>
    </form>
  );
}

/** Encerra a despesa a partir do mês exibido (meses anteriores continuam com ela). */
export function EndExpenseButton({ id, month, label: text }: { id: string; month: string; label: string }) {
  const [state, run, pending] = useActionState<FormState, FormData>(endExpenseAction, null);
  return (
    <form action={run} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="fromMonth" value={month} />
      <button type="submit" disabled={pending} className="text-[12.5px] font-semibold text-bad hover:underline disabled:opacity-50">
        {pending ? "…" : text}
      </button>
      {state && !state.ok ? <span className="text-[12px] text-bad">{state.error}</span> : null}
    </form>
  );
}
