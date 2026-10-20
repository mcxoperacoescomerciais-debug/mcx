import { inputClass, selectClass } from "@/components/ui";
import { ActionForm } from "../../_components/action-form";
import { saveTasterAction } from "../actions";

export interface TasterValues {
  id?: string;
  name: string;
  phone: string | null;
  city: string;
  state: string;
  region: string | null;
  area: string | null;
  availability: string | null;
  experience: string | null;
  usualFee: number | null;
  notes: string | null;
  status: "active" | "inactive";
}

/** Cadastro da degustadora (servidor; o envio usa o ActionForm). */
export function TasterForm({ v }: { v: TasterValues }) {
  const field = (name: keyof TasterValues, label: string, opts: { placeholder?: string; required?: boolean; hint?: string } = {}) => (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      <input name={name} required={opts.required} defaultValue={(v[name] as string | null) ?? ""} placeholder={opts.placeholder} className={inputClass} />
      {opts.hint ? <span className="block text-[11.5px] text-muted mt-1">{opts.hint}</span> : null}
    </label>
  );
  return (
    <ActionForm action={saveTasterAction} hidden={v.id ? { id: v.id } : {}} submitLabel={v.id ? "Salvar" : "Cadastrar"} resetOnSuccess={false}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {field("name", "Nome completo *", { required: true })}
        {field("phone", "WhatsApp (DDD + número)", { placeholder: "(37) 99999-0000", hint: "O código do país (55) entra sozinho." })}
        <div className="grid grid-cols-[1fr_80px] gap-2">
          {field("city", "Cidade *", { required: true })}
          {field("state", "UF")}
        </div>
        {field("region", "Região de atendimento", { placeholder: "Ex.: Centro-Oeste MG" })}
        {field("area", "Endereço ou área de atuação")}
        {field("availability", "Disponibilidade habitual", { placeholder: "Ex.: sex e sáb, manhã" })}
        {field("experience", "Marcas / tipos de degustação com experiência")}
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Valor habitual (R$)</span>
          <input name="usualFee" inputMode="decimal" defaultValue={v.usualFee === null ? "" : v.usualFee.toFixed(2).replace(".", ",")} placeholder="0,00" className={inputClass} />
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Situação</span>
          <select name="status" defaultValue={v.status} className={selectClass}>
            <option value="active">Ativa</option>
            <option value="inactive">Inativa</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Observações</span>
        <textarea name="notes" rows={2} defaultValue={v.notes ?? ""} className={inputClass + " !h-auto py-2"} />
      </label>
    </ActionForm>
  );
}
