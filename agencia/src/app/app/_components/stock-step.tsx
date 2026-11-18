"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Search, Trash2 } from "lucide-react";
import { ProductCard } from "./product-sheet";
import { Button } from "@/components/ui";
import { matchesQuery } from "@/lib/rules";
import type { BootstrapProduct } from "@/lib/sync-types";
import { deleteUnregistered, saveUnregistered, uuid, type LocalAttendance } from "../_lib/local-store";
import { useCatalog } from "../_lib/hooks";
import { Notice, Sheet, TextArea, toast } from "./primitives";

interface Props {
  visitId: string;
  visitDate: string;
  storeId: string;
  attendance: LocalAttendance;
  products: BootstrapProduct[];
  editable: boolean;
}

export function StockStep({ visitId, visitDate, storeId, attendance, products, editable }: Props) {
  const { lastStock } = useCatalog();
  const [query, setQuery] = useState("");
  const [addingUnregistered, setAddingUnregistered] = useState(false);

  const list = useMemo(() => products.filter((p) => matchesQuery(`${p.name} ${p.sku} ${p.ean ?? ""} ${p.variant ?? ""}`, query)), [products, query]);

  return (
    <div>
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2 mb-2">Estoque, ruptura e validade</h2>
      <p className="text-[13.5px] text-ink-2 mb-3">
        Toque só no que precisa informar. <strong>Sem nada para informar, siga para o próximo produto.</strong>
      </p>

      {products.length > 6 ? (
        <label className="relative block mb-2">
          <Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar produto, SKU ou EAN"
            className="w-full h-12 rounded-2xl border border-line-strong bg-surface pl-11 pr-4 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
          />
        </label>
      ) : null}
      <div className="bg-surface border border-line rounded-2xl divide-y divide-line overflow-hidden">
        {list.map((p) => (
          <ProductCard
            key={p.id}
            visitId={visitId}
            visitDate={visitDate}
            attendance={attendance}
            product={p}
            prev={lastStock[storeId]?.[p.id]}
            editable={editable}
          />
        ))}
        {list.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-muted">Nenhum produto encontrado.</p> : null}
      </div>

      <div className="mt-5">
        <h3 className="text-[13px] font-semibold text-ink-2 mb-2">Produto não cadastrado</h3>
        {Object.values(attendance.unregistered).map((u) => (
          <div key={u.id} className="bg-surface border border-line rounded-2xl px-4 py-3 mb-2 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[14px]">{u.description}</p>
              <p className="text-[12px] text-muted">{u.quantity !== null ? `${u.quantity} encontrados` : "Quantidade não informada"} · vai para conferência do gestor</p>
            </div>
            {editable ? (
              <button type="button" aria-label="Remover" onClick={() => void deleteUnregistered(visitId, attendance.id, u.id)} className="size-10 grid place-items-center text-bad">
                <Trash2 className="size-4" />
              </button>
            ) : null}
          </div>
        ))}
        {editable ? (
          <button type="button" onClick={() => setAddingUnregistered(true)} className="w-full h-12 rounded-2xl border border-dashed border-line-strong text-[14px] font-semibold text-ink-2 flex items-center justify-center gap-2">
            <PackagePlus className="size-4" /> Encontrei produto da marca fora da lista
          </button>
        ) : null}
      </div>

      {addingUnregistered ? (
        <UnregisteredSheet
          onClose={() => setAddingUnregistered(false)}
          onSave={async (description, quantity, note) => {
            await saveUnregistered(visitId, attendance.id, { id: uuid(), description, quantity, note: note || null });
            setAddingUnregistered(false);
            toast("Registrado para conferência do gestor.");
          }}
        />
      ) : null}
    </div>
  );
}

function UnregisteredSheet({ onClose, onSave }: { onClose: () => void; onSave: (description: string, quantity: number | null, note: string) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  return (
    <Sheet
      open
      onClose={onClose}
      title="Produto não cadastrado"
      footer={
        <Button size="xl" className="w-full" disabled={description.trim().length < 2} onClick={() => void onSave(description.trim(), qty === "" ? null : Number(qty), note.trim())}>
          Registrar
        </Button>
      }
    >
      <Notice tone="info">O gestor recebe para conferir e cadastrar. Não substitui os produtos da lista.</Notice>
      <label className="block mt-4">
        <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">Descrição do produto (como está na embalagem)</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} className="w-full h-12 rounded-xl border border-line-strong px-3.5 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </label>
      <label className="block mt-3">
        <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">Quantidade encontrada (opcional)</span>
        <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full h-12 rounded-xl border border-line-strong px-3.5 text-[15px] tnum focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100" />
      </label>
      <div className="mt-3">
        <TextArea value={note} onChange={setNote} placeholder="Observação (opcional)" rows={2} maxLength={300} />
      </div>
    </Sheet>
  );
}
