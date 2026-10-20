"use client";

/**
 * Custos mensais do promotor (folha de pagamento). Os campos já vêm com o padrão
 * da agência (Configurações); o que for igual ao padrão continua acompanhando o
 * padrão. Encargos = % sobre o salário (vínculo fixo), salvo se digitar outro valor.
 */
import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { brl } from "@/lib/tasting";
import { savePromoterCostAction } from "../../actions";
import type { FormState } from "../../../actions";

type Field = "salary" | "meal" | "fuel" | "other";
const LABEL: Record<Field, string> = { salary: "Salário", meal: "Alimentação", fuel: "Combustível", other: "Outros" };

const text = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));
const num = (t: string) => {
  const v = t.replace(/[R$\s]/g, "");
  if (!v) return 0;
  const n = Number(v.includes(",") ? v.split(".").join("").replace(",", ".") : v);
  return Number.isFinite(n) ? n : 0;
};

export function PromoterCostForm({
  userId,
  fixed,
  own,
  defaults,
}: {
  userId: string;
  fixed: boolean;
  own: { salary: number | null; meal: number | null; fuel: number | null; charges: number | null; other: number | null };
  defaults: { salary: number | null; meal: number | null; fuel: number | null; other: number | null; chargesPct: number };
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(savePromoterCostAction, null);
  const [v, setV] = useState<Record<Field, string>>({
    salary: text(own.salary ?? defaults.salary),
    meal: text(own.meal ?? defaults.meal),
    fuel: text(own.fuel ?? defaults.fuel),
    other: text(own.other ?? defaults.other),
  });
  const autoCharges = (salary: number) => (fixed ? Math.round(salary * defaults.chargesPct) / 100 : 0);
  const [charges, setCharges] = useState(own.charges === null ? "" : text(own.charges));
  const effCharges = charges.trim() ? num(charges) : autoCharges(num(v.salary));
  const total = useMemo(() => num(v.salary) + num(v.meal) + num(v.fuel) + num(v.other) + effCharges, [v, effCharges]);

  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {(Object.keys(LABEL) as Field[]).map((k) => (
          <label key={k} className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{LABEL[k]} (R$)</span>
            <input name={k} inputMode="decimal" value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} placeholder="0,00" className={inputClass + " tnum"} />
            {own[k] === null && defaults[k] !== null ? <span className="block text-[11px] text-muted mt-0.5">padrão da agência</span> : null}
          </label>
        ))}
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Encargos (R$)</span>
          <input name="charges" inputMode="decimal" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder={text(autoCharges(num(v.salary)))} className={inputClass + " tnum"} />
          <span className="block text-[11px] text-muted mt-0.5">{charges.trim() ? "valor digitado" : fixed ? `automático: ${String(defaults.chargesPct).replace(".", ",")}% do salário` : "freelancer: sem encargos"}</span>
        </label>
      </div>
      <div className="rounded-xl bg-canvas px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-ink-2">Custo total deste promotor por mês (entra na folha do Financeiro)</span>
        <span className="text-[20px] font-bold tnum">{brl(Math.round(total * 100) / 100)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Salvar custos
        </button>
        {state ? (
          <p role="status" className={`text-[13px] font-medium inline-flex items-center gap-1.5 ${state.ok ? "text-ok" : "text-bad"}`}>
            {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {state.ok ? state.message ?? "Salvo." : state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
