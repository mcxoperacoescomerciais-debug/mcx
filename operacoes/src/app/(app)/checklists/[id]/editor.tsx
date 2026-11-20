"use client";
/** Editor de modelo de checklist. Salvar cria uma versão nova; as demandas antigas mantêm a delas. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { duplicateTemplateAction, saveTemplateAction } from "@/app/actions";
import { useRun } from "@/components/use-run";
import type { FormOptions } from "@/server/demands";

interface Item {
  section: string;
  text: string;
  quantity: string;
  unit: string;
  perAction: boolean;
  required: boolean;
  note: string;
  toValidate: boolean;
  stockItemId: string;
}

interface Template {
  id: string;
  name: string;
  clientId: string | null;
  categoryId: string | null;
  typeId: string | null;
  doubleCheck: boolean;
  status: "draft" | "published" | "archived";
  items: Item[];
}

const blankItem = (section = ""): Item => ({ section, text: "", quantity: "", unit: "", perAction: false, required: false, note: "", toValidate: false, stockItemId: "" });
const UNITS = ["", "un", "pct", "cx", "kg", "L"];

export function TemplateEditor({ template, options, stockItems = [] }: { template?: Template; options: FormOptions; stockItems?: { id: string; clientId: string; name: string; unit: string }[] }) {
  const router = useRouter();
  const { run, pending, message } = useRun();
  const [name, setName] = useState(template?.name ?? "");
  const [clientId, setClientId] = useState(template?.clientId ?? "");
  const [categoryId, setCategoryId] = useState(template?.categoryId ?? "");
  const [typeId, setTypeId] = useState(template?.typeId ?? "");
  const [doubleCheck, setDoubleCheck] = useState(template?.doubleCheck ?? false);
  const [status, setStatus] = useState(template?.status ?? "draft");
  const [items, setItems] = useState<Item[]>(template?.items.length ? template.items : [blankItem()]);
  const types = options.types.filter((t) => t.categoryId === categoryId);
  const stockOptions = stockItems.filter((s) => s.clientId === clientId);
  const pendingValidation = items.filter((i) => i.toValidate).length;

  const update = (index: number, patch: Partial<Item>) => setItems((cur) => cur.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const move = (index: number, delta: number) =>
    setItems((cur) => {
      const to = index + delta;
      if (to < 0 || to >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  function save() {
    run(async () => {
      const r = await saveTemplateAction(template?.id ?? null, {
        name,
        clientId: clientId || null,
        categoryId: categoryId || null,
        typeId: types.some((t) => t.id === typeId) ? typeId : null,
        doubleCheck,
        status,
        items: items.filter((i) => i.text.trim()).map((i) => ({ section: i.section, text: i.text, quantity: i.quantity.trim() === "" ? null : Number(i.quantity), unit: i.unit, perAction: i.perAction, required: i.required, note: i.note, toValidate: i.toValidate, stockItemId: stockOptions.some((s) => s.id === i.stockItemId) ? i.stockItemId : null })),
      });
      if (r.ok && !template && "id" in r) router.push(`/checklists/${r.id}`);
      return r;
    });
  }

  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="tp-name">Nome do modelo</label>
          <input id="tp-name" className="field" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="tp-cli">Contratante</label>
          <select id="tp-cli" className="field" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Geral MCX</option>
            {options.clients.filter((c) => c.kind !== "internal").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tp-status">Situação</label>
          <select id="tp-status" className="field" value={status} onChange={(e) => setStatus(e.target.value as Template["status"])}>
            <option value="draft">Rascunho (só gestor e dono veem)</option>
            <option value="published">Publicado (a equipe pode usar)</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tp-cat">Categoria</label>
          <select id="tp-cat" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Qualquer</option>
            {options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tp-type">Tipo de demanda</label>
          <select id="tp-type" className="field" value={types.some((t) => t.id === typeId) ? typeId : ""} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Qualquer</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4" checked={doubleCheck} onChange={(e) => setDoubleCheck(e.target.checked)} /> Conferência dupla (colunas “Separado” e “Conferido”) — para kits que saem da MCX
      </label>

      {pendingValidation > 0 && (
        <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
          {pendingValidation} {pendingValidation === 1 ? "item sugerido ainda está" : "itens sugeridos ainda estão"} “a validar”. Confirme (desmarcando “A validar”) ou remova cada um antes de publicar.
        </p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-bold text-ink-2">Itens</legend>
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={index} className="rounded-lg border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr_5rem_5rem]">
                <input aria-label={`Seção do item ${index + 1}`} className="field" placeholder="Seção (opcional)" list="tp-sections" value={item.section} onChange={(e) => update(index, { section: e.target.value })} />
                <input aria-label={`Descrição do item ${index + 1}`} className="field" placeholder="Item" value={item.text} onChange={(e) => update(index, { text: e.target.value })} />
                <input aria-label={`Quantidade do item ${index + 1}`} className="field" placeholder="Qtd." inputMode="numeric" value={item.quantity} onChange={(e) => update(index, { quantity: e.target.value.replace(/\D/g, "") })} />
                <select aria-label={`Unidade do item ${index + 1}`} className="field" value={item.unit} onChange={(e) => update(index, { unit: e.target.value })}>
                  {[...new Set([...UNITS, item.unit])].map((u) => <option key={u} value={u}>{u || "—"}</option>)}
                </select>
              </div>
              <input aria-label={`Observação do item ${index + 1}`} className="field mt-2" placeholder="Observação (opcional)" value={item.note} onChange={(e) => update(index, { note: e.target.value })} />
              {stockOptions.length > 0 && (
                <select aria-label={`Item do estoque ligado ao item ${index + 1}`} className="field mt-2" value={stockOptions.some((s) => s.id === item.stockItemId) ? item.stockItemId : ""} onChange={(e) => update(index, { stockItemId: e.target.value })}>
                  <option value="">Sem vínculo com o estoque</option>
                  {stockOptions.map((s) => <option key={s.id} value={s.id}>Estoque: {s.name} ({s.unit})</option>)}
                </select>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
                <label className="flex min-h-9 items-center gap-2"><input type="checkbox" className="size-4" checked={item.perAction} onChange={(e) => update(index, { perAction: e.target.checked })} /> Quantidade por ação</label>
                <label className="flex min-h-9 items-center gap-2"><input type="checkbox" className="size-4" checked={item.required} onChange={(e) => update(index, { required: e.target.checked })} /> Obrigatório</label>
                <label className="flex min-h-9 items-center gap-2 text-warn"><input type="checkbox" className="size-4" checked={item.toValidate} onChange={(e) => update(index, { toValidate: e.target.checked })} /> A validar</label>
                <span className="ml-auto flex gap-1">
                  <button type="button" aria-label="Subir item" className="rounded-lg p-2 text-muted hover:bg-subtle" onClick={() => move(index, -1)}><ArrowUp aria-hidden className="size-4" /></button>
                  <button type="button" aria-label="Descer item" className="rounded-lg p-2 text-muted hover:bg-subtle" onClick={() => move(index, 1)}><ArrowDown aria-hidden className="size-4" /></button>
                  <button type="button" aria-label="Remover item" className="rounded-lg p-2 text-muted hover:bg-bad-bg hover:text-bad" onClick={() => setItems((cur) => cur.filter((_, i) => i !== index))}><Trash2 aria-hidden className="size-4" /></button>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <datalist id="tp-sections">
          {[...new Set(["Produtos", "Descartáveis", "Equipamentos", "Documentos", ...items.map((i) => i.section).filter(Boolean)])].map((s) => <option key={s} value={s} />)}
        </datalist>
        <button type="button" className="btn-ghost mt-3" onClick={() => setItems((cur) => [...cur, blankItem(cur.at(-1)?.section ?? "")])}>Adicionar item</button>
      </fieldset>

      {message}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{template ? "Salvar (cria versão nova)" : "Criar modelo"}</button>
        {template && (
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const r = await duplicateTemplateAction(template.id);
                if (r.ok && "id" in r) router.push(`/checklists/${r.id}`);
                return r;
              })
            }
          >
            Duplicar
          </button>
        )}
      </div>
    </form>
  );
}
