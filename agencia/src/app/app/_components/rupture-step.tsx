"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, Camera, Check, Pencil, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import { RUPTURE_SITUATION_LABEL, RUPTURE_SITUATIONS, STOCK_STATE_SHORT, type RuptureSituation } from "@/lib/domain";
import { fmtDateTime } from "@/lib/dates";
import { matchesQuery, suggestsRupture } from "@/lib/rules";
import type { BootstrapBrand, BootstrapProduct, RuptureInput } from "@/lib/sync-types";
import { deleteRupture, saveRupture, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic, useCatalog, useLocal } from "../_lib/hooks";
import { Chip, Notice, Sheet, TextArea, toast } from "./primitives";
import { PhotoCapture } from "./photo-capture";

interface Props {
  visitId: string;
  storeName: string;
  attendance: LocalAttendance;
  brand: BootstrapBrand;
  products: BootstrapProduct[];
  editable: boolean;
  /** Abre direto o formulário para este produto (sugestão vinda do estoque). */
  suggestProductId: string | null;
  onSuggestHandled: () => void;
}

export function RuptureStep({ visitId, storeName, attendance, brand, products, editable, suggestProductId, onSuggestHandled }: Props) {
  const { productById } = useCatalog();
  const [editing, setEditing] = useState<{ rupture: RuptureInput | null; productId: string | null; fromSuggestion: boolean } | null>(
    suggestProductId ? { rupture: null, productId: suggestProductId, fromSuggestion: true } : null,
  );
  const ruptures = Object.values(attendance.ruptures);
  const suggestions = products.filter((p) => {
    const st = attendance.stock[p.id];
    return st && suggestsRupture(st.state) && !ruptures.some((r) => r.productId === p.id);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Relatório de ruptura</h2>
        <span className="text-[12px] text-muted">{ruptures.length} registrada(s)</span>
      </div>
      <p className="text-[13px] text-muted mb-3">Produto que deveria estar à venda e não está na condição esperada. Se não tiver certeza, use “Ainda não confirmada”.</p>

      {editable && suggestions.length ? (
        <div className="mb-4 space-y-2">
          <p className="text-[13px] font-semibold text-ink-2">Sugestões a partir do estoque — confirme antes de registrar</p>
          {suggestions.map((p) => (
            <div key={p.id} className="bg-bad-bg rounded-2xl px-4 py-3 flex items-center gap-3">
              <AlertOctagon className="size-5 text-bad shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[14px] text-ink leading-snug">{p.name}</p>
                <p className="text-[12px] text-bad">Estoque: {STOCK_STATE_SHORT[attendance.stock[p.id].state]}</p>
              </div>
              <button type="button" onClick={() => setEditing({ rupture: null, productId: p.id, fromSuggestion: true })} className="h-10 px-3 rounded-xl bg-bad text-white text-[13px] font-bold">
                Confirmar
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        {ruptures.map((r) => {
          const p = productById.get(r.productId);
          const photos = attendance.photos.filter((x) => x.ruptureId === r.id).length;
          return (
            <div key={r.id} className="bg-surface border border-line rounded-2xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] leading-snug">{p?.name ?? "Produto"}</p>
                  <p className="text-[12px] text-muted">SKU {p?.sku}</p>
                </div>
                {editable ? (
                  <div className="flex gap-1">
                    <button type="button" aria-label="Editar" onClick={() => setEditing({ rupture: r, productId: r.productId, fromSuggestion: r.fromStockSuggestion })} className="size-10 grid place-items-center rounded-xl text-ink-2 active:bg-canvas">
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Excluir"
                      onClick={async () => {
                        await deleteRupture(visitId, attendance.id, r.id);
                        toast("Ruptura removida.");
                      }}
                      className="size-10 grid place-items-center rounded-xl text-bad active:bg-canvas"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <StatusBadge tone={r.situation === "unconfirmed" ? "warning" : "danger"} size="sm">
                  {RUPTURE_SITUATION_LABEL[r.situation]}
                </StatusBadge>
                {r.knownStock !== null ? <StatusBadge tone="neutral" size="sm" icon={false}>Estoque: {r.knownStock}</StatusBadge> : null}
                <StatusBadge tone={photos ? "success" : brand.rupturePhotoRequired ? "danger" : "muted"} size="sm">
                  {photos ? `${photos} foto(s)` : brand.rupturePhotoRequired ? "Falta foto" : "Sem foto"}
                </StatusBadge>
              </div>
              {r.note ? <p className="text-[13px] text-ink-2 mt-2">“{r.note}”</p> : null}
            </div>
          );
        })}
        {!ruptures.length ? <p className="text-[14px] text-muted bg-surface border border-line rounded-2xl p-4">Nenhuma ruptura registrada neste atendimento.</p> : null}
      </div>

      {editable ? (
        <Button size="xl" variant="danger" className="w-full mt-4" onClick={() => setEditing({ rupture: null, productId: null, fromSuggestion: false })}>
          <AlertOctagon className="size-5" /> REGISTRAR RUPTURA
        </Button>
      ) : null}

      {editing ? (
        <RuptureSheet
          visitId={visitId}
          storeName={storeName}
          attendance={attendance}
          brand={brand}
          products={products}
          initial={editing}
          onClose={() => {
            setEditing(null);
            onSuggestHandled();
          }}
        />
      ) : null}
    </div>
  );
}

function RuptureSheet({
  visitId,
  storeName,
  attendance,
  brand,
  products,
  initial,
  onClose,
}: {
  visitId: string;
  storeName: string;
  attendance: LocalAttendance;
  brand: BootstrapBrand;
  products: BootstrapProduct[];
  initial: { rupture: RuptureInput | null; productId: string | null; fromSuggestion: boolean };
  onClose: () => void;
}) {
  const { productById } = useCatalog();
  const local = useLocal();
  const [id] = useState(initial.rupture?.id ?? uuid());
  const [productId, setProductId] = useState<string | null>(initial.productId);
  const [situation, setSituation] = useState<RuptureSituation | null>(initial.rupture?.situation ?? null);
  const stockEntry = productId ? attendance.stock[productId] : undefined;
  const [known, setKnown] = useState(initial.rupture?.knownStock !== undefined && initial.rupture?.knownStock !== null ? String(initial.rupture.knownStock) : stockEntry?.state === "zero" ? "0" : "");
  const [note, setNote] = useState(initial.rupture?.note ?? "");
  const [query, setQuery] = useState("");
  const saved = Boolean(attendance.ruptures[id]);
  const [stage, setStage] = useState<"form" | "photo">(saved && !initial.rupture ? "photo" : "form");
  const taken = new Set(Object.values(attendance.ruptures).filter((r) => r.id !== id).map((r) => r.productId));
  const filtered = useMemo(() => products.filter((p) => matchesQuery(`${p.name} ${p.sku} ${p.ean ?? ""}`, query)), [products, query]);
  const product = productId ? productById.get(productId) : undefined;
  const photos = attendance.photos.filter((p) => p.ruptureId === id);

  async function save() {
    if (!productId || !situation) return;
    await saveRupture(visitId, attendance.id, {
      id,
      productId,
      situation,
      knownStock: known === "" ? null : Number(known),
      note: note.trim() || null,
      fromStockSuggestion: initial.fromSuggestion,
      recordedAt: initial.rupture?.recordedAt ?? new Date().toISOString(),
    });
    haptic(20);
    setStage("photo");
  }

  if (stage === "photo") {
    return (
      <Sheet
        open
        onClose={onClose}
        title="Evidência da ruptura"
        footer={
          <Button
            size="xl"
            className="w-full"
            disabled={brand.rupturePhotoRequired && photos.length === 0}
            onClick={() => {
              toast("Ruptura registrada.");
              onClose();
            }}
          >
            <Check className="size-5" /> Concluir
          </Button>
        }
      >
        <Notice tone={brand.rupturePhotoRequired ? "warn" : "info"} icon={<Camera className="size-5" />}>
          {brand.rupturePhotoRequired ? "Esta marca exige foto de evidência da ruptura." : "Foto opcional — ajuda o gestor a tratar a ocorrência."}
        </Notice>
        <p className="font-semibold text-[15px] mt-4 mb-3">{product?.name}</p>
        <PhotoCapture
          visitId={visitId}
          attendanceId={attendance.id}
          kind="rupture"
          photos={photos}
          min={brand.rupturePhotoRequired ? 1 : 0}
          allowGallery={brand.allowGallery}
          editable
          title="Foto da gôndola"
          cta="FOTOGRAFAR A GÔNDOLA"
          link={{ ruptureId: id }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={initial.rupture ? "Editar ruptura" : "Registrar ruptura"}
      footer={
        <Button size="xl" variant="danger" className="w-full" disabled={!productId || !situation} onClick={() => void save()}>
          Salvar ruptura
        </Button>
      }
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px] bg-canvas rounded-xl px-3 py-2.5 mb-4">
        <dt className="text-muted">Loja</dt>
        <dd className="font-medium truncate">{storeName}</dd>
        <dt className="text-muted">Marca</dt>
        <dd className="font-medium">{brand.name}</dd>
        <dt className="text-muted">Promotor</dt>
        <dd className="font-medium truncate">{local.bootstrap?.user.name}</dd>
        <dt className="text-muted">Data e hora</dt>
        <dd className="font-medium tnum">{fmtDateTime(initial.rupture?.recordedAt ?? new Date())}</dd>
      </dl>

      <p className="text-[13px] font-semibold text-ink-2 mb-2">Produto</p>
      {product && (initial.productId || initial.rupture) ? (
        <div className="rounded-xl border-2 border-brand-700 px-4 py-3">
          <p className="font-semibold text-[15px]">{product.name}</p>
          <p className="text-[12px] text-muted">
            SKU {product.sku}
            {stockEntry ? ` · estoque informado: ${stockEntry.state === "quantity" ? stockEntry.quantity : STOCK_STATE_SHORT[stockEntry.state]}` : ""}
          </p>
        </div>
      ) : (
        <>
          <label className="relative block mb-2">
            <Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar produto da marca"
              className="w-full h-12 rounded-xl border border-line-strong bg-surface pl-11 pr-4 text-[15px] focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <div className="max-h-56 overflow-y-auto border border-line rounded-xl divide-y divide-line">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={taken.has(p.id)}
                onClick={() => setProductId(p.id)}
                className={clsx("w-full text-left px-3.5 py-2.5 text-[14px] disabled:opacity-45", productId === p.id ? "bg-brand-50 font-semibold" : "active:bg-canvas")}
              >
                {p.name}
                <span className="block text-[12px] text-muted">{taken.has(p.id) ? "Já registrada neste atendimento" : `SKU ${p.sku}`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="text-[13px] font-semibold text-ink-2 mt-5 mb-2">Situação encontrada</p>
      <div className="grid grid-cols-1 gap-2">
        {RUPTURE_SITUATIONS.map((s) => (
          <Chip key={s} selected={situation === s} onClick={() => setSituation(s)} tone={s === "unconfirmed" ? "warn" : "bad"}>
            {RUPTURE_SITUATION_LABEL[s]}
          </Chip>
        ))}
      </div>

      <label className="block mt-5">
        <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">Quantidade em estoque, se souber</span>
        <input
          inputMode="numeric"
          value={known}
          onChange={(e) => setKnown(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="Não sei"
          className="w-full h-12 rounded-xl border border-line-strong px-3.5 text-[16px] tnum focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100"
        />
      </label>
      <div className="mt-4">
        <TextArea value={note} onChange={setNote} placeholder="Observação curta (opcional)" rows={2} maxLength={300} />
      </div>
    </Sheet>
  );
}
