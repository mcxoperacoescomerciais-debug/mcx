import { inputClass, selectClass } from "@/components/ui";
import { ActionForm } from "../../_components/action-form";
import { saveStoreAction } from "../actions";
import type { schema as s } from "@/server/db";

type Store = typeof s.stores.$inferSelect;

export function StoreForm({ store, brandIds, chains, brands }: { store: Store | null; brandIds: string[]; chains: { id: string; name: string }[]; brands: { id: string; name: string }[] }) {
  return (
    <ActionForm action={saveStoreAction} hidden={{ id: store?.id ?? "" }} submitLabel={store ? "Salvar loja" : "Cadastrar loja"} resetOnSuccess={false}>
      <div className="grid sm:grid-cols-2 gap-2">
        <input name="name" required defaultValue={store?.name} placeholder="Nome da loja" className={inputClass} />
        <select name="chainId" defaultValue={store?.chainId ?? ""} className={selectClass} aria-label="Rede">
          <option value="">Sem rede</option>
          {chains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="code" defaultValue={store?.code ?? ""} placeholder="Código interno / da rede" className={inputClass} />
        <input name="cnpj" defaultValue={store?.cnpj ?? ""} placeholder="CNPJ (opcional)" inputMode="numeric" className={inputClass} />
        <input name="address" defaultValue={store?.address ?? ""} placeholder="Endereço" className={inputClass + " sm:col-span-2"} />
        <input name="district" defaultValue={store?.district ?? ""} placeholder="Bairro" className={inputClass} />
        <div className="grid grid-cols-[1fr_72px] gap-2">
          <input name="city" required defaultValue={store?.city} placeholder="Cidade" className={inputClass} />
          <input name="state" defaultValue={store?.state ?? "MG"} maxLength={2} className={inputClass} aria-label="UF" />
        </div>
        <label className="sm:col-span-2 block">
          <input
            name="coords"
            defaultValue={store?.lat != null && store?.lng != null ? `${store.lat}, ${store.lng}` : ""}
            placeholder="Localização no mapa: latitude, longitude (ex.: -19.9245, -43.9352)"
            className={inputClass}
          />
          <span className="block text-[11.5px] text-muted mt-1">No Google Maps, clique com o botão direito sobre a loja e copie os números. Sem localização, a loja aparece na lista “sem localização” do mapa.</span>
        </label>
      </div>
      <fieldset>
        <legend className="text-[12.5px] font-semibold text-ink-2 mb-1.5">Marcas autorizadas nesta loja</legend>
        <div className="flex flex-wrap gap-3 text-[13px]">
          {brands.map((b) => (
            <label key={b.id} className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="brandIds" value={b.id} defaultChecked={brandIds.includes(b.id)} /> {b.name}
            </label>
          ))}
        </div>
      </fieldset>
      <input name="rules" defaultValue={store?.rules ?? ""} placeholder="Regras específicas (ex.: entrada pelo depósito antes das 9h)" className={inputClass} />
      <div className="grid sm:grid-cols-[1fr_160px] gap-2">
        <input name="notes" defaultValue={store?.notes ?? ""} placeholder="Observações" className={inputClass} />
        <select name="status" defaultValue={store?.status ?? "active"} className={selectClass} aria-label="Status">
          <option value="active">Ativa</option>
          <option value="inactive">Inativa</option>
        </select>
      </div>
    </ActionForm>
  );
}
