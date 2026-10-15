"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarClock, MoreHorizontal, PackagePlus, PackageX, Search, Trash2 } from "lucide-react";
import { ProductSheet } from "./product-sheet";
import clsx from "clsx";
import { Button, StatusBadge } from "@/components/ui";
import { STOCK_COUNT_UNITS, STOCK_STATE_SHORT, STOCK_STATE_TONE, UNIT_LABEL, type StockState, type Unit } from "@/lib/domain";
import { fmtDate } from "@/lib/dates";
import { matchesQuery, suggestsRupture, validateStock } from "@/lib/rules";
import type { BootstrapProduct } from "@/lib/sync-types";
import { clearStock, deleteUnregistered, saveStock, saveUnregistered, toggleRupture, uuid, type LocalAttendance } from "../_lib/local-store";
import { haptic, useCatalog } from "../_lib/hooks";
import { Chip, Notice, Sheet, TextArea, toast } from "./primitives";

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
  const [filter, setFilter] = useState<"all" | "pending" | "done">("all");
  const [editing, setEditing] = useState<BootstrapProduct | null>(null);
  const [detail, setDetail] = useState<BootstrapProduct | null>(null);
  const [addingUnregistered, setAddingUnregistered] = useState(false);
  const informed = products.filter((p) => attendance.stock[p.id]).length;

  const list = useMemo(
    () =>
      products
        .filter((p) => (filter === "pending" ? !attendance.stock[p.id] : filter === "done" ? Boolean(attendance.stock[p.id]) : true))
        .filter((p) => matchesQuery(`${p.name} ${p.sku} ${p.ean ?? ""} ${p.variant ?? ""}`, query)),
    [products, filter, attendance.stock, query],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-2">Estoque, ruptura e validade</h2>
        <span className={clsx("text-[12px] font-semibold rounded-full px-2 py-0.5", informed === products.length ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>
          {informed}/{products.length} informados
        </span>
      </div>
      <p className="text-[13px] text-muted mb-3">Toque no produto para tratar tudo de uma vez: ruptura, quantidade na área de vendas e as validades (área de vendas e estoque). Para só contar, digite a quantidade na linha.</p>

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
      <div className="flex gap-2 mb-3 overflow-x-auto">
        <Chip selected={filter === "all"} onClick={() => setFilter("all")}>
          Todos
        </Chip>
        <Chip selected={filter === "pending"} onClick={() => setFilter("pending")}>
          Pendentes ({products.length - informed})
        </Chip>
        <Chip selected={filter === "done"} onClick={() => setFilter("done")}>
          Informados ({informed})
        </Chip>
      </div>

      <div className="bg-surface border border-line rounded-2xl divide-y divide-line overflow-hidden">
        {list.map((p) => (
          <StockRow
            key={p.id}
            visitId={visitId}
            attendance={attendance}
            product={p}
            prev={lastStock[storeId]?.[p.id]}
            editable={editable}
            onMore={() => setEditing(p)}
            onOpen={() => setDetail(p)}
          />
        ))}
        {list.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-muted">Nenhum produto neste filtro.</p> : null}
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

      {editing ? (
        <StockSheet
          product={editing}
          current={attendance.stock[editing.id]}
          onClose={() => setEditing(null)}
          onSave={async (state, quantity, note, unit) => {
            await saveStock(visitId, attendance.id, { productId: editing.id, state, quantity, unit, note: note || null, recordedAt: new Date().toISOString() });
            haptic(15);
            setEditing(null);
            toast("Estoque salvo.");
          }}
          onClear={async () => {
            await clearStock(visitId, attendance.id, editing.id);
            setEditing(null);
          }}
        />
      ) : null}
      {detail ? <ProductSheet visitId={visitId} visitDate={visitDate} attendance={attendance} product={detail} onClose={() => setDetail(null)} /> : null}
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

/** Linha do produto: quantidade + unidade + ruptura, sem abrir outra tela. */
function StockRow({
  visitId,
  attendance,
  product: p,
  prev,
  editable,
  onMore,
  onOpen,
}: {
  visitId: string;
  attendance: LocalAttendance;
  product: BootstrapProduct;
  prev: { state: string; quantity: number | null; unit?: string; date: string } | undefined;
  editable: boolean;
  onMore: () => void;
  onOpen: () => void;
}) {
  const validities = Object.values(attendance.validities ?? {}).filter((v) => v.productId === p.id).length;
  const entry = attendance.stock[p.id];
  const rupture = Object.values(attendance.ruptures).find((r) => r.productId === p.id);
  const unitOptions: Unit[] = [...STOCK_COUNT_UNITS];
  const savedQty = entry?.state === "quantity" && entry.quantity !== null ? String(entry.quantity) : "";
  const [qty, setQty] = useState(savedQty);
  const [unit, setUnit] = useState<Unit>(countUnit(entry?.unit, p.unit));
  // Valor salvo mudou por fora (folha de opções, ruptura): o campo acompanha.
  const [lastSaved, setLastSaved] = useState(savedQty);
  if (savedQty !== lastSaved) {
    setLastSaved(savedQty);
    setQty(savedQty);
  }
  const otherState = entry && entry.state !== "quantity" && entry.state !== "zero" ? entry.state : null;
  // Salva sozinho logo depois de parar de digitar (e também ao sair do campo).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function commit(nextQty = qty, nextUnit = unit) {
    const n = nextQty === "" ? null : Number(nextQty);
    if (n === null || !Number.isFinite(n)) return;
    const now = new Date().toISOString();
    if (n === 0) {
      await saveStock(visitId, attendance.id, { productId: p.id, state: "zero", quantity: 0, unit: nextUnit, note: entry?.note ?? null, recordedAt: now });
      return;
    }
    if (entry?.state === "quantity" && entry.quantity === n && (entry.unit ?? p.unit) === nextUnit) return;
    await saveStock(visitId, attendance.id, { productId: p.id, state: "quantity", quantity: n, unit: nextUnit, note: entry?.note ?? null, recordedAt: now });
    // Produto encontrado na gôndola: não está em ruptura.
    if (rupture) await toggleRupture(visitId, attendance.id, p.id);
    haptic(10);
  }

  async function ruptureTap() {
    const on = await toggleRupture(visitId, attendance.id, p.id, suggestsRupture(entry?.state));
    if (on && (!entry || entry.state === "quantity")) {
      // Ruptura = nada na gôndola: o estoque fica registrado como zero.
      await saveStock(visitId, attendance.id, { productId: p.id, state: "zero", quantity: 0, unit, note: entry?.note ?? null, recordedAt: new Date().toISOString() });
      setQty("");
    }
    haptic(on ? 25 : 10);
    toast(on ? `Ruptura: ${p.name}` : "Ruptura desmarcada.", on ? "warn" : "ok");
  }

  return (
    <div className={clsx("px-4 py-3", rupture && "bg-bad-bg/40")}>
      <div className="flex items-start gap-2">
        <button type="button" disabled={!editable} onClick={onOpen} className="flex-1 min-w-0 text-left">
          <p className="text-[15px] font-semibold leading-snug">{p.name}</p>
          <p className="text-[12px] text-muted mt-0.5">
            SKU {p.sku}
            {p.package ? ` · ${p.package}` : ""}
            {prev ? ` · última: ${prev.state === "quantity" ? `${prev.quantity} ${prev.unit ?? p.unit}` : (STOCK_STATE_SHORT[prev.state as StockState] ?? "—")} (${fmtDate(prev.date).slice(0, 5)})` : ""}
          </p>
          <span className={clsx("inline-flex items-center gap-1 mt-1 text-[12px] font-semibold rounded-md px-1.5 py-0.5", validities ? "bg-info-bg text-info" : "text-brand-700")}>
            <CalendarClock className="size-3.5" /> {validities ? `${validities} validade(s)` : "Validades e mais"} ›
          </span>
        </button>
        {editable ? (
          <button type="button" onClick={onMore} aria-label="Mais opções" className="size-9 -mr-2 grid place-items-center rounded-lg text-muted active:bg-canvas">
            <MoreHorizontal className="size-5" />
          </button>
        ) : null}
      </div>

      {otherState ? (
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge tone={STOCK_STATE_TONE[otherState]} size="sm">
            {STOCK_STATE_SHORT[otherState]}
          </StatusBadge>
          {editable ? (
            <button type="button" onClick={onMore} className="text-[13px] font-semibold text-brand-700">
              alterar
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 flex items-stretch gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={!editable}
            value={qty}
            placeholder={entry?.state === "zero" ? "0" : "Qtd."}
            aria-label={`Quantidade de ${p.name}`}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setQty(v);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => void commit(v), 900);
            }}
            onBlur={() => {
              if (timer.current) clearTimeout(timer.current);
              void commit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-20 h-12 rounded-xl border-2 border-line-strong bg-surface px-2 text-center text-[20px] font-bold tnum focus:border-brand-600 focus:outline-none disabled:bg-canvas"
          />
          <div className="flex rounded-xl border-2 border-line-strong overflow-hidden" role="radiogroup" aria-label="Unidade">
            {unitOptions.map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                disabled={!editable}
                onClick={() => {
                  setUnit(u);
                  if (qty !== "") void commit(qty, u);
                }}
                className={clsx("px-2.5 text-[12px] font-bold uppercase", unit === u ? "bg-brand-800 text-white" : "bg-surface text-ink-2")}
              >
                {u === "un" ? "UN" : u === "cx" ? "CX" : u.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!editable}
            aria-pressed={Boolean(rupture)}
            onClick={() => void ruptureTap()}
            className={clsx(
              "flex-1 min-w-[92px] rounded-xl border-2 text-[12.5px] font-bold inline-flex items-center justify-center gap-1",
              rupture ? "bg-bad border-bad text-white" : "border-bad/40 text-bad bg-surface",
            )}
          >
            <PackageX className="size-4" /> {rupture ? "RUPTURA ✓" : "RUPTURA"}
          </button>
        </div>
      )}
    </div>
  );
}

function StockSheet({
  product,
  current,
  onClose,
  onSave,
  onClear,
}: {
  product: BootstrapProduct;
  current: LocalAttendance["stock"][string] | undefined;
  onClose: () => void;
  onSave: (state: StockState, quantity: number | null, note: string, unit: Unit) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  // Unidade da contagem: só unidade ou caixa.
  const unitOptions: Unit[] = [...STOCK_COUNT_UNITS];
  const [unit, setUnit] = useState<Unit>(countUnit(current?.unit, product.unit));
  const [qty, setQty] = useState(current?.state === "quantity" && current.quantity !== null ? String(current.quantity) : "");
  const [note, setNote] = useState(current?.note ?? "");
  const [showNote, setShowNote] = useState(Boolean(current?.note));
  const n = qty === "" ? null : Number(qty);
  const qtyError = qty !== "" ? validateStock("quantity", n) : null;

  return (
    <Sheet open onClose={onClose} title={<span className="leading-snug">{product.name}</span>}>
      <p className="text-[13px] text-muted -mt-2 mb-4">
        SKU {product.sku}
        {product.ean ? ` · EAN ${product.ean}` : ""}
        {product.package ? ` · ${product.package}` : ""}
      </p>
      <label className="block">
        <span className="block text-[13px] font-semibold text-ink-2 mb-1.5">Quantidade encontrada</span>
        <div className="flex items-stretch gap-2">
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && n && !qtyError) void onSave("quantity", n, note, unit);
            }}
            className="flex-1 min-w-0 h-16 rounded-2xl border-2 border-line-strong bg-surface px-4 text-[28px] font-bold tnum focus:border-brand-600 focus:outline-none"
            placeholder="0"
          />
        </div>
      </label>
      <div className={clsx("grid gap-2 mt-2", unitOptions.length === 3 ? "grid-cols-3" : "grid-cols-2")} role="radiogroup" aria-label="Unidade da contagem">
        {unitOptions.map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            onClick={() => setUnit(u)}
            className={clsx(
              "h-12 rounded-xl border-2 text-[14px] font-bold uppercase tracking-wide",
              unit === u ? "border-brand-700 bg-brand-800 text-white" : "border-line-strong bg-surface text-ink-2",
            )}
          >
            {UNIT_LABEL[u].replace(/s$/, "")}
          </button>
        ))}
      </div>
      {qtyError ? <p className="text-[13px] text-bad mt-1.5 font-medium">{qtyError}</p> : null}
      <Button size="xl" className="w-full mt-3" disabled={!n || Boolean(qtyError)} onClick={() => n && void onSave("quantity", n, note, unit)}>
        SALVAR ESTOQUE
      </Button>

      <p className="text-[13px] font-semibold text-ink-2 mt-6 mb-2">Ou informe a situação</p>
      <div className="grid grid-cols-1 gap-2">
        <SituationButton tone="bad" label="Estoque zero" help="Verifiquei: não há nenhuma unidade" active={current?.state === "zero"} onClick={() => void onSave("zero", 0, note, unit)} />
        <SituationButton tone="warn" label="Produto não encontrado" help="Não localizei o produto na loja" active={current?.state === "not_found"} onClick={() => void onSave("not_found", null, note, unit)} />
        <SituationButton tone="muted" label="Não se aplica a esta loja" help="A loja não trabalha com este item" active={current?.state === "not_applicable"} onClick={() => void onSave("not_applicable", null, note, unit)} />
      </div>

      <div className="mt-4">
        {showNote ? (
          <TextArea value={note} onChange={setNote} placeholder="Observação curta (opcional)" rows={2} maxLength={300} />
        ) : (
          <button type="button" onClick={() => setShowNote(true)} className="text-[14px] font-semibold text-brand-700">
            + Adicionar observação
          </button>
        )}
      </div>
      {current ? (
        <button type="button" onClick={() => void onClear()} className="mt-5 text-[13px] font-semibold text-muted">
          Limpar (voltar para pendente)
        </button>
      ) : null}
    </Sheet>
  );
}

function SituationButton({ tone, label, help, active, onClick }: { tone: "bad" | "warn" | "muted"; label: string; help: string; active: boolean; onClick: () => void }) {
  const ring = { bad: "border-bad bg-bad-bg", warn: "border-warn bg-warn-bg", muted: "border-ink-2 bg-canvas" }[tone];
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={clsx("w-full min-h-14 rounded-2xl border-2 px-4 py-2.5 text-left", active ? ring : "border-line-strong bg-surface active:bg-canvas")}>
      <p className="font-semibold text-[15px]">{label}</p>
      <p className="text-[12.5px] text-muted">{help}</p>
    </button>
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

/** Só UNIDADE ou CAIXA: o que foi gravado, senão a do cadastro (caixa) ou unidade. */
function countUnit(saved: string | null | undefined, productUnit: Unit): Unit {
  if (saved === "un" || saved === "cx") return saved;
  return productUnit === "cx" ? "cx" : "un";
}
