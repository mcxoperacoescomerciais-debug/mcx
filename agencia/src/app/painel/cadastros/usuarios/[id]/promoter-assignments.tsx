"use client";

/**
 * Carteira do promotor no cadastro: SELECIONA A LOJA (busca por nome e cidade) →
 * ESCOLHE AS MARCAS → DIAS E VEZES de cada marca. Abaixo, o quadro da semana
 * (seg a sáb + "sem dia fixo") com as lojas de cada dia; tocar na loja mostra as
 * marcas e quantas vezes cada uma é atendida.
 */
import { useMemo, useState, useTransition } from "react";
import { CalendarDays, Loader2, MapPin, Pencil, Plus, Search, Store, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { buttonClass, inputClass, selectClass } from "@/components/ui";
import { frequencyLabel, weekdaysLabel, type TargetPeriod } from "@/lib/portfolio";
import { matchesQuery } from "@/lib/rules";
import { saveAssignmentAction } from "../../actions";

export interface StoreOption {
  id: string;
  name: string;
  code: string | null;
  chain: string | null;
  city: string;
  brands: { id: string; name: string }[];
}
export interface AssignmentRow {
  brandId: string;
  brandName: string;
  perWeek: number;
  period: TargetPeriod;
  weekdays: number[];
}
export interface StoreAssignment {
  storeId: string;
  brands: AssignmentRow[];
}

const DAYS = [
  { d: 1, label: "Seg" },
  { d: 2, label: "Ter" },
  { d: 3, label: "Qua" },
  { d: 4, label: "Qui" },
  { d: 5, label: "Sex" },
  { d: 6, label: "Sáb" },
];

export function PromoterAssignments({ promoterId, stores, assignments }: { promoterId: string; stores: StoreOption[]; assignments: StoreAssignment[] }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [editing, setEditing] = useState<StoreOption | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const byId = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const assigned = useMemo(() => new Map(assignments.map((a) => [a.storeId, a])), [assignments]);
  const found = useMemo(() => {
    if (!query.trim() && !city.trim()) return [];
    return stores.filter((s) => matchesQuery(`${s.name} ${s.code ?? ""} ${s.chain ?? ""}`, query) && matchesQuery(s.city, city)).slice(0, 40);
  }, [stores, query, city]);
  const totalVisits = assignments.reduce((n, a) => n + a.brands.filter((b) => b.period === "week").reduce((m, b) => m + b.perWeek, 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Selecionar a loja */}
      <div>
        <p className="text-[13px] font-semibold text-ink-2 mb-2">Adicionar loja ao promotor</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou código da loja" className={inputClass + " !pl-9"} />
          </label>
          <label className="relative">
            <MapPin className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade (ex.: Divinópolis)" className={inputClass + " !pl-9"} />
          </label>
        </div>
        {found.length ? (
          <ul className="mt-2 border border-line rounded-xl divide-y divide-line max-h-72 overflow-y-auto bg-surface">
            {found.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="w-full text-left px-3.5 py-2.5 flex items-center gap-3 hover:bg-subtle">
                  <Store className="size-4 text-muted shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13.5px] font-semibold truncate">{s.name}</span>
                    <span className="block text-[11.5px] text-muted truncate">
                      {[s.chain, s.city, s.code].filter(Boolean).join(" · ")} · {s.brands.length} marca(s)
                    </span>
                  </span>
                  <span className={clsx("text-[12px] font-semibold inline-flex items-center gap-1", assigned.has(s.id) ? "text-ok" : "text-brand-700")}>
                    {assigned.has(s.id) ? (
                      <>
                        <Pencil className="size-3.5" /> Editar
                      </>
                    ) : (
                      <>
                        <Plus className="size-3.5" /> Adicionar
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : query || city ? (
          <p className="text-[12.5px] text-muted mt-2">Nenhuma loja encontrada.</p>
        ) : (
          <p className="text-[12px] text-muted mt-2">Digite parte do nome da loja e/ou a cidade para ver as lojas.</p>
        )}
      </div>

      {/* 2. Quadro da semana */}
      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-[13px] font-semibold text-ink-2 flex items-center gap-1.5">
            <CalendarDays className="size-4" /> Semana do promotor
          </p>
          <p className="text-[12px] text-muted">
            {assignments.length} loja(s) · {totalVisits} atendimento(s) de marca por semana
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
          {[...DAYS, { d: -1, label: "Sem dia fixo" }].map((col) => {
            const items = assignments
              .map((a) => ({ a, brands: a.brands.filter((b) => (col.d === -1 ? b.weekdays.length === 0 : b.weekdays.includes(col.d))) }))
              .filter((x) => x.brands.length);
            return (
              <div key={col.d} className="rounded-xl bg-canvas border border-line min-h-28">
                <div className="flex items-center justify-between px-2.5 py-2 border-b border-line">
                  <span className="text-[12.5px] font-bold">{col.label}</span>
                  <span className="text-[11px] font-bold rounded-full bg-warn-bg text-warn px-1.5">{items.length}</span>
                </div>
                <div className="p-1.5 space-y-1.5">
                  {items.map(({ a, brands }) => {
                    const st = byId.get(a.storeId);
                    const key = `${col.d}:${a.storeId}`;
                    return (
                      <div key={a.storeId} className="rounded-lg bg-surface border border-line">
                        <button type="button" onClick={() => setPeek(peek === key ? null : key)} className="w-full text-left px-2 py-1.5 flex items-start gap-1.5">
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12px] font-semibold text-brand-800 leading-snug">{st?.name ?? "Loja"}</span>
                            <span className="block text-[10.5px] text-muted truncate">{st?.city}</span>
                          </span>
                          <span className="text-[10.5px] font-bold rounded-full bg-ok-bg text-ok px-1.5 shrink-0">{brands.length}</span>
                        </button>
                        {peek === key ? (
                          <div className="px-2 pb-2 space-y-1">
                            {a.brands.map((b) => (
                              <p key={b.brandId} className="text-[11px] leading-snug">
                                <strong>{b.brandName}</strong>
                                <span className="block text-muted">
                                  {frequencyLabel(b.perWeek, b.period)} · {weekdaysLabel(b.weekdays)}
                                </span>
                              </p>
                            ))}
                            {st ? (
                              <button type="button" onClick={() => setEditing(st)} className="text-[11px] font-semibold text-brand-700 inline-flex items-center gap-1 mt-0.5">
                                <Pencil className="size-3" /> Editar
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing ? <AssignmentDialog promoterId={promoterId} store={editing} current={assigned.get(editing.id) ?? null} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

interface Draft {
  on: boolean;
  weekdays: number[];
  free: boolean;
  perWeek: number;
  period: TargetPeriod;
}

/** Passo 2 e 3: marcas da loja → dias e vezes de cada marca. */
function AssignmentDialog({ promoterId, store, current, onClose }: { promoterId: string; store: StoreOption; current: StoreAssignment | null; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      store.brands.map((b) => {
        const c = current?.brands.find((x) => x.brandId === b.id);
        return [b.id, c ? { on: true, weekdays: c.weekdays, free: c.weekdays.length === 0, perWeek: c.perWeek, period: c.period } : { on: false, weekdays: [], free: false, perWeek: 2, period: "week" as TargetPeriod }];
      }),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  const chosen = store.brands.filter((b) => drafts[b.id].on);
  const invalid = chosen.find((b) => !drafts[b.id].free && drafts[b.id].weekdays.length === 0);

  function save(rows: { brandId: string; perWeek: number; period: TargetPeriod; weekdays: number[] }[]) {
    setError(null);
    start(async () => {
      const r = await saveAssignmentAction(promoterId, store.id, rows);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl">
        <header className="flex items-start gap-3 px-5 py-4 border-b border-line">
          <div className="flex-1 min-w-0">
            <p className="text-[11.5px] uppercase tracking-wide font-semibold text-muted">Marcas, dias e vezes</p>
            <h2 className="text-[17px] font-semibold leading-snug">{store.name}</h2>
            <p className="text-[12.5px] text-muted">{[store.chain, store.city, store.code].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="size-9 grid place-items-center rounded-lg hover:bg-subtle">
            <X className="size-5" />
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-4 space-y-3">
          {!store.brands.length ? <p className="text-[13.5px] text-muted">Esta loja ainda não tem marcas. Cadastre as marcas da loja em Redes e lojas.</p> : null}
          {store.brands.map((b) => {
            const d = drafts[b.id];
            return (
              <div key={b.id} className={clsx("rounded-xl border p-3", d.on ? "border-brand-600 bg-brand-50/40" : "border-line")}>
                <label className="flex items-center gap-2.5 font-semibold text-[14.5px]">
                  <input type="checkbox" checked={d.on} onChange={(e) => set(b.id, { on: e.target.checked })} className="size-4" /> {b.name}
                </label>
                {d.on ? (
                  <div className="mt-3 space-y-3 pl-6">
                    <div>
                      <p className="text-[12px] font-semibold text-ink-2 mb-1.5">Quais dias ele atende?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {DAYS.map((x) => {
                          const on = d.weekdays.includes(x.d);
                          return (
                            <button
                              key={x.d}
                              type="button"
                              disabled={d.free}
                              onClick={() => {
                                const weekdays = on ? d.weekdays.filter((y) => y !== x.d) : [...d.weekdays, x.d].sort();
                                set(b.id, { weekdays, perWeek: d.period === "week" ? Math.max(1, weekdays.length) : d.perWeek });
                              }}
                              className={clsx("h-9 px-3 rounded-lg border text-[13px] font-semibold disabled:opacity-40", on && !d.free ? "bg-brand-800 text-white border-brand-800" : "bg-surface border-line-strong text-ink-2")}
                            >
                              {x.label}
                            </button>
                          );
                        })}
                      </div>
                      <label className="mt-2 inline-flex items-center gap-2 text-[13px]">
                        <input type="checkbox" checked={d.free} onChange={(e) => set(b.id, { free: e.target.checked, weekdays: e.target.checked ? [] : d.weekdays })} />
                        Sem dia fixo — seguir só com a quantidade (o promotor escolhe o dia)
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold text-ink-2">Quantas vezes?</span>
                      <input type="number" min={1} max={31} value={d.perWeek} onChange={(e) => set(b.id, { perWeek: Math.max(1, Number(e.target.value) || 1) })} className={inputClass + " !w-20 !h-9"} />
                      <select value={d.period} onChange={(e) => set(b.id, { period: e.target.value as TargetPeriod })} className={selectClass + " !w-auto !h-9"}>
                        <option value="week">por semana</option>
                        <option value="fortnight">por quinzena</option>
                        <option value="month">por mês</option>
                      </select>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <footer className="px-5 py-4 border-t border-line space-y-2">
          {error ? <p className="text-[13px] text-bad font-medium">{error}</p> : null}
          {invalid ? <p className="text-[12.5px] text-warn font-medium">{invalid.name}: escolha os dias ou marque “sem dia fixo”.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending || Boolean(invalid)}
              onClick={() => save(chosen.map((b) => ({ brandId: b.id, perWeek: drafts[b.id].perWeek, period: drafts[b.id].period, weekdays: drafts[b.id].free ? [] : drafts[b.id].weekdays })))}
              className={buttonClass("primary")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {chosen.length ? `Salvar (${chosen.length} marca${chosen.length > 1 ? "s" : ""})` : current ? "Tirar a loja do promotor" : "Salvar"}
            </button>
            {current ? (
              <button type="button" disabled={pending} onClick={() => save([])} className={buttonClass("ghost") + " !text-bad"}>
                <Trash2 className="size-4" /> Tirar a loja
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={buttonClass("secondary")}>
              Cancelar
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
