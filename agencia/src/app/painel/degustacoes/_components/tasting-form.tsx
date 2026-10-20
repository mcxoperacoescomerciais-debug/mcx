"use client";

/**
 * Cadastro/edição de uma degustação. A loja pode ser uma loja já cadastrada
 * (preenche rede, nome e cidade) ou só o texto que veio no cronograma.
 * Campos que a marca não informou podem ficar em branco (pendentes).
 */
import { useActionState, useMemo, useState } from "react";
import { Loader2, XCircle } from "lucide-react";
import { buttonClass, inputClass, selectClass } from "@/components/ui";
import { materialsFor, tastingResult, brl, pct } from "@/lib/tasting";
import { saveTastingAction } from "../actions";
import type { FormState } from "../../actions";

export interface TastingFormValues {
  id?: string;
  brandId: string;
  storeId: string | null;
  chainName: string | null;
  storeName: string;
  city: string;
  state: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  product: string | null;
  description: string | null;
  materialsNote: string | null;
  notes: string | null;
  responsibleId: string | null;
  orderRef: string | null;
  actionCode: string | null;
  billingTerms: string | null;
  brandPaymentDue: string | null;
  tasterPaymentDue: string | null;
  photoProof: boolean;
  requiredEvidence: string | null;
  revenue: number | null;
  taxes: number | null;
  tasterFee: number | null;
  transport: number | null;
  food: number | null;
  materialsCost: number | null;
  otherCost: number | null;
}

const moneyText = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","));
const parseMoney = (t: string) => {
  const v = t.replace(/[R$\s]/g, "");
  if (!v) return null;
  const n = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
};

export function TastingForm({
  initial,
  brands,
  stores,
  users,
}: {
  initial: TastingFormValues;
  brands: { id: string; name: string; code: string }[];
  stores: { id: string; name: string; chain: string | null; city: string; state: string }[];
  users: { id: string; name: string }[];
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(saveTastingAction, null);
  const [brandId, setBrandId] = useState(initial.brandId);
  const [storeId, setStoreId] = useState(initial.storeId ?? "");
  const [chain, setChain] = useState(initial.chainName ?? "");
  const [storeName, setStoreName] = useState(initial.storeName);
  const [city, setCity] = useState(initial.city);
  const [uf, setUf] = useState(initial.state || "MG");
  const [money, setMoney] = useState({
    revenue: moneyText(initial.revenue),
    taxes: moneyText(initial.taxes),
    tasterFee: moneyText(initial.tasterFee),
    transport: moneyText(initial.transport),
    food: moneyText(initial.food),
    materialsCost: moneyText(initial.materialsCost),
    otherCost: moneyText(initial.otherCost),
  });
  const brand = brands.find((b) => b.id === brandId);
  const preview = useMemo(
    () =>
      tastingResult({
        revenue: parseMoney(money.revenue),
        taxes: parseMoney(money.taxes),
        tasterFee: parseMoney(money.tasterFee),
        transport: parseMoney(money.transport),
        food: parseMoney(money.food),
        materialsCost: parseMoney(money.materialsCost),
        otherCost: parseMoney(money.otherCost),
      }),
    [money],
  );
  const moneyInput = (k: keyof typeof money, label: string) => (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      <input name={k} inputMode="decimal" value={money[k]} onChange={(e) => setMoney((m) => ({ ...m, [k]: e.target.value }))} placeholder="0,00" className={inputClass + " tnum"} />
    </label>
  );
  const text = (name: keyof TastingFormValues, label: string, opts: { placeholder?: string; type?: string; required?: boolean } = {}) => (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      <input name={name} type={opts.type ?? "text"} required={opts.required} defaultValue={(initial[name] as string | null) ?? ""} placeholder={opts.placeholder} className={inputClass} />
    </label>
  );

  return (
    <form action={run} className="space-y-6">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <fieldset className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-4">
        <legend className="px-1 text-[13px] font-bold uppercase tracking-wide text-ink-2">Evento</legend>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Marca contratante *</span>
            <select name="brandId" required value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selectClass}>
              <option value="" disabled>
                Escolha a marca
              </option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {text("date", "Data *", { type: "date", required: true })}
          <div className="grid grid-cols-2 gap-2">
            {text("startTime", "Início", { type: "time" })}
            {text("endTime", "Fim", { type: "time" })}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block sm:col-span-2">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Loja cadastrada (opcional)</span>
            <select
              name="storeId"
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                const st = stores.find((x) => x.id === e.target.value);
                if (st) {
                  setChain(st.chain ?? "");
                  setStoreName(st.name);
                  setCity(st.city);
                  setUf(st.state || "MG");
                }
              }}
              className={selectClass}
            >
              <option value="">— Loja fora do cadastro (digite ao lado) —</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} · {st.city}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Rede varejista</span>
            <input name="chainName" value={chain} onChange={(e) => setChain(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Loja / ponto de venda *</span>
            <input name="storeName" required value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputClass} />
          </label>
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Cidade *</span>
            <input name="city" required value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Estado</span>
            <input name="state" value={uf} maxLength={2} onChange={(e) => setUf(e.target.value.toUpperCase())} className={inputClass} />
          </label>
          {text("product", "Produto utilizado")}
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Responsável interno</span>
            <select name="responsibleId" defaultValue={initial.responsibleId ?? ""} className={selectClass}>
              <option value="">—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Descrição da ação</span>
          <textarea name="description" rows={2} defaultValue={initial.description ?? ""} className={inputClass + " !h-auto py-2"} />
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Materiais e orientações (texto livre)</span>
            <textarea name="materialsNote" rows={2} defaultValue={initial.materialsNote ?? ""} className={inputClass + " !h-auto py-2"} />
            <span className="block text-[11.5px] text-muted mt-1">Checklist automático da marca: {brand ? materialsFor(brand).join(", ") || "—" : "escolha a marca"}.</span>
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Observações</span>
            <textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} className={inputClass + " !h-auto py-2"} />
          </label>
        </div>
      </fieldset>

      <fieldset className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-4">
        <legend className="px-1 text-[13px] font-bold uppercase tracking-wide text-ink-2">Valores previstos</legend>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {moneyInput("revenue", "Marca paga à agência (R$)")}
          {moneyInput("taxes", "Impostos / deduções (R$)")}
          {moneyInput("tasterFee", "Agência paga à degustadora (R$)")}
          {moneyInput("transport", "Transporte (R$)")}
          {moneyInput("food", "Alimentação / reembolsos (R$)")}
          {moneyInput("materialsCost", "Materiais (R$)")}
          {moneyInput("otherCost", "Outros custos (R$)")}
        </div>
        <div className="rounded-xl bg-canvas px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[13px]">
          <Stat label="Receita prevista" value={brl(preview.revenue)} />
          <Stat label="Custo direto previsto" value={brl(preview.directCost)} />
          <Stat label="Resultado de contribuição" value={brl(preview.contribution)} strong />
          <Stat label="Margem" value={preview.margin === null ? "—" : pct(preview.margin)} strong />
        </div>
        <p className="text-[12px] text-muted">Deixe em branco o que a marca ainda não informou — fica pendente para preencher depois.</p>
      </fieldset>

      <fieldset className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-4">
        <legend className="px-1 text-[13px] font-bold uppercase tracking-wide text-ink-2">Pedido, faturamento e comprovação</legend>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {text("orderRef", "Nº do pedido / campanha")}
          {text("actionCode", "Código da ação")}
          {text("brandPaymentDue", "Prazo de pagamento da marca", { type: "date" })}
          {text("tasterPaymentDue", "Prazo de pagamento da degustadora", { type: "date" })}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {text("billingTerms", "Condições de faturamento")}
          {text("requiredEvidence", "Documentos ou evidências exigidos pela marca")}
        </div>
        <label className="inline-flex items-center gap-2 text-[13.5px]">
          <input type="checkbox" name="photoProof" defaultChecked={initial.photoProof} /> Exige comprovação fotográfica
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {initial.id ? "Salvar alterações" : "Cadastrar degustação"}
        </button>
        {state && !state.ok ? (
          <>
            <p role="status" className="text-[13px] font-medium text-bad inline-flex items-center gap-1.5">
              <XCircle className="size-4" /> {state.error}
            </p>
            {state.error.includes("Já existe") ? (
              <label className="inline-flex items-center gap-2 text-[13px] font-semibold">
                <input type="checkbox" name="allowDuplicate" /> Cadastrar mesmo assim
              </label>
            ) : null}
          </>
        ) : null}
      </div>
    </form>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className={`tnum ${strong ? "font-bold text-[15px]" : "font-semibold"}`}>{value}</p>
    </div>
  );
}
