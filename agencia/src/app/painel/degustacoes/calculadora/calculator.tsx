"use client";

/**
 * Calculadora de degustação: monta o pedido da marca cidade a cidade e mostra,
 * em tempo real, o preço mínimo (sem prejuízo), o preço com a margem desejada
 * e quanto cada cidade deixa — inclusive se a marca exigir um preço único.
 */
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Fuel, Loader2, Plus, Save, Trash2, Truck, Users } from "lucide-react";
import clsx from "clsx";
import { buttonClass, inputClass, selectClass } from "@/components/ui";
import { DEFAULT_FUEL_PRICE, calcTasting, type CalcCity, type CalcGlobals, type CityResult } from "@/lib/tasting-calc";
import { brl, pct } from "@/lib/tasting";
import { deleteQuoteAction, saveQuoteAction } from "../actions";

export interface QuoteData {
  id: string | null;
  name: string;
  brandId: string | null;
  globals: CalcGlobals;
  cities: CalcCity[];
  notes: string | null;
}

type NumKey = Exclude<keyof CalcCity, "city" | "offeredPrice">;

const PER_PERSON: [NumKey, string][] = [
  ["tasterFee", "Cachê por ação"],
  ["meal", "Alimentação por ação"],
];
const PER_ACTION: [NumKey, string][] = [
  ["consumables", "Descartáveis"],
  ["product", "Produto (se a agência compra)"],
  ["equipment", "Desgaste de equipamentos"],
];
const PER_CITY: [NumKey, string][] = [
  ["lodging", "Hospedagem e diárias"],
  ["supervision", "Supervisão"],
];

const toText = (v: number | null) => (v === null || v === 0 ? "" : String(v).replace(".", ","));
const toNum = (t: string) => {
  const v = t.replace(/[R$\s]/g, "");
  if (!v) return 0;
  const n = Number(v.includes(",") ? v.split(".").join("").replace(",", ".") : v);
  return Number.isFinite(n) ? n : 0;
};

export function Calculator({
  initial,
  brands,
  refs,
  quotes,
}: {
  initial: QuoteData;
  brands: { id: string; name: string }[];
  refs: { fees: Record<string, { avgFee: number | null; tasters: number }>; cities: string[] };
  quotes: { id: string; name: string; brandName: string | null; count: number; updatedAt: string }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState<QuoteData>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const r = useMemo(() => calcTasting(q.globals, q.cities), [q.globals, q.cities]);

  const setCity = (i: number, patch: Partial<CalcCity>) => setQ((x) => ({ ...x, cities: x.cities.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const fuel = q.globals.fuelPrice ?? DEFAULT_FUEL_PRICE;
  const setG = (k: keyof CalcGlobals, v: string) => setQ((x) => ({ ...x, globals: { ...x.globals, [k]: toNum(v) } }));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveQuoteAction(q.id, { name: q.name, brandId: q.brandId, globals: q.globals, cities: q.cities, notes: q.notes });
      if (!res.ok) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: "Orçamento salvo." });
        if (!q.id && res.id) {
          setQ((x) => ({ ...x, id: res.id! }));
          router.replace(`/painel/degustacoes/calculadora?orcamento=${res.id}`);
        }
      }
    });
  }

  const best = Math.max(...r.cities.map((c) => c.suggestedPerAction), 1);

  return (
    <div className="space-y-6">
      {/* Orçamento e premissas */}
      <section className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr_1.2fr_1fr] gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Nome do orçamento</span>
            <input id="q-name" value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} placeholder="Ex.: Suinco · novembro · 5 cidades" className={inputClass} />
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Marca</span>
            <select id="q-brand" value={q.brandId ?? ""} onChange={(e) => setQ({ ...q, brandId: e.target.value || null })} className={selectClass}>
              <option value="">— escolha —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <Pct id="g-tax" label="Impostos sobre a nota (%)" value={q.globals.taxPct} onChange={(v) => setG("taxPct", v)} hint="Simples, ISS…" />
          <Pct id="g-margin" label="Margem de contribuição desejada (%)" value={q.globals.marginPct} onChange={(v) => setG("marginPct", v)} hint="Antes das despesas administrativas (DRE)" />
          <Field id="g-fuel" label="Combustível (R$ por litro)" value={fuel} onChange={(v) => setG("fuelPrice", v)} money />
        </div>
        {r.invalid ? <p className="text-[13px] text-bad font-medium">Impostos + margem passam de 100%: não existe preço que feche a conta. Reduza algum percentual.</p> : null}
      </section>

      <div className="grid xl:grid-cols-5 gap-6 items-start">
        {/* Cidades */}
        <div className="xl:col-span-3 space-y-4">
          {q.cities.map((c, i) => {
            const ref = refs.fees[c.city.trim()];
            const res = r.cities[i];
            return (
              <article key={i} className="bg-surface border border-line rounded-[var(--radius-card)] p-4 space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block flex-1 min-w-44">
                    <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Cidade</span>
                    <input id={`c-${i}-city`} list="calc-cities" value={c.city} onChange={(e) => setCity(i, { city: e.target.value })} placeholder="Ex.: Divinópolis" className={inputClass} />
                  </label>
                  <Field id={`c-${i}-actions`} label="Ações" value={c.actions} onChange={(v) => setCity(i, { actions: Math.round(toNum(v)) })} w="w-24" />
                  <Field id={`c-${i}-tasters`} label="Degustadoras/ação" value={c.tasters} onChange={(v) => setCity(i, { tasters: Math.max(1, Math.round(toNum(v))) })} w="w-32" />
                  <button type="button" onClick={() => setQ((x) => ({ ...x, cities: [...x.cities.slice(0, i + 1), { ...c, city: `${c.city} (cópia)` }, ...x.cities.slice(i + 1)] }))} className={buttonClass("ghost", "sm")} aria-label="Duplicar cidade" title="Duplicar cidade">
                    <Copy className="size-4" />
                  </button>
                  <button type="button" disabled={q.cities.length === 1} onClick={() => setQ((x) => ({ ...x, cities: x.cities.filter((_, j) => j !== i) }))} className={buttonClass("ghost", "sm") + " !text-bad"} aria-label="Remover cidade" title="Remover cidade">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {ref ? (
                  <p className="text-[12px] text-muted flex items-center gap-1.5">
                    <Users className="size-3.5" /> {ref.tasters} degustadora(s) cadastrada(s) aqui{ref.avgFee !== null ? ` · cachê médio ${brl(ref.avgFee)}` : ""}
                    {ref.avgFee !== null && c.tasterFee !== ref.avgFee ? (
                      <button type="button" onClick={() => setCity(i, { tasterFee: ref.avgFee! })} className="font-semibold text-brand-700 hover:underline">
                        usar
                      </button>
                    ) : null}
                  </p>
                ) : c.city.trim() ? (
                  <p className="text-[12px] text-warn">Nenhuma degustadora cadastrada nesta cidade: conte com deslocamento de outra cidade.</p>
                ) : null}
                <Group title="Por degustadora, em cada ação">
                  {PER_PERSON.map(([k, l]) => (
                    <Field key={k} id={`c-${i}-${k}`} label={l} value={c[k]} onChange={(v) => setCity(i, { [k]: toNum(v) })} money />
                  ))}
                </Group>
                <Group title="Por ação">
                  {PER_ACTION.map(([k, l]) => (
                    <Field key={k} id={`c-${i}-${k}`} label={l} value={c[k]} onChange={(v) => setCity(i, { [k]: toNum(v) })} money />
                  ))}
                </Group>
                {res ? <Logistics i={i} c={c} res={res} fuel={fuel} setCity={(p) => setCity(i, p)} /> : null}
                <Group title="Da cidade (rateado nas ações)">
                  {PER_CITY.map(([k, l]) => (
                    <Field key={k} id={`c-${i}-${k}`} label={l} value={c[k]} onChange={(v) => setCity(i, { [k]: toNum(v) })} money />
                  ))}
                </Group>
                <div className="grid sm:grid-cols-[1fr_2fr] gap-3 items-end">
                  <Field id={`c-${i}-offer`} label="Preço da marca por ação (se já houver)" value={c.offeredPrice ?? 0} onChange={(v) => setCity(i, { offeredPrice: toNum(v) || null })} money />
                  <div className="rounded-xl bg-canvas px-3 py-2 grid grid-cols-3 gap-2 text-[12.5px]">
                    <Out label="Custo por ação" value={brl(res?.costPerAction ?? 0)} />
                    <Out label="Mínimo por ação" value={brl(res?.breakEvenPerAction ?? 0)} />
                    <Out label="Sugerido por ação" value={brl(res?.suggestedPerAction ?? 0)} strong />
                  </div>
                </div>
              </article>
            );
          })}
          <datalist id="calc-cities">
            {refs.cities.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <button type="button" onClick={() => setQ((x) => ({ ...x, cities: [...x.cities, { ...x.cities[x.cities.length - 1], city: "", offeredPrice: null }] }))} className={buttonClass("secondary") + " w-full"}>
            <Plus className="size-4" /> Adicionar cidade (copia os custos da última)
          </button>
        </div>

        {/* Resultado */}
        <div className="xl:col-span-2 space-y-4 xl:sticky xl:top-4">
          <section className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-3">
            <h2 className="font-semibold text-[15px]">Preço por cidade</h2>
            <div className="space-y-2.5">
              {r.cities.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between gap-2 text-[13px]">
                    <span className="font-semibold truncate">{c.city}</span>
                    <span className="tnum">
                      {c.actions} ação(ões) · <strong>{brl(c.suggestedPerAction)}</strong>/ação
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-canvas mt-1 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${(c.suggestedPerAction / best) * 100}%` }} />
                  </div>
                  <p className="text-[11.5px] text-muted mt-0.5 tnum">
                    mínimo {brl(c.breakEvenPerAction)} · custo {brl(c.directCost)} (transporte {brl(c.transportTotal)} · frete e fixos {brl(c.fixedCost)})
                    {c.offered ? (
                      <>
                        {" "}
                        · com {brl(c.offered.perAction)}:{" "}
                        <strong className={c.offered.result < 0 ? "text-bad" : "text-ok"}>
                          {brl(c.offered.result)} ({pct(c.offered.margin)})
                        </strong>
                      </>
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
            <dl className="border-t border-line pt-3 grid grid-cols-2 gap-y-1.5 text-[13px]">
              <dt className="text-ink-2">Ações no pedido</dt>
              <dd className="text-right tnum font-semibold">{r.totals.actions}</dd>
              <dt className="text-ink-2">Custo direto total</dt>
              <dd className="text-right tnum font-semibold">{brl(r.totals.directCost)}</dd>
              <dt className="text-ink-2">Mínimo do pedido (sem prejuízo)</dt>
              <dd className="text-right tnum font-semibold">{brl(r.totals.breakEvenTotal)}</dd>
              <dt className="font-bold">Valor sugerido do pedido</dt>
              <dd className="text-right tnum font-bold">{brl(r.totals.suggestedTotal)}</dd>
              {r.totals.offeredRevenue !== null ? (
                <>
                  <dt className="text-ink-2">Com os preços da marca</dt>
                  <dd className={clsx("text-right tnum font-bold", (r.totals.offeredResult ?? 0) < 0 ? "text-bad" : "text-ok")}>
                    {brl(r.totals.offeredResult)} ({pct(r.totals.offeredMargin)})
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          <section className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-3">
            <h2 className="font-semibold text-[15px]">Se a marca pedir preço único</h2>
            <p className="text-[13px] text-ink-2">
              Preço por ação para o pedido inteiro dar {pct(q.globals.marginPct)} de margem de contribuição: <strong className="tnum text-[15px]">{brl(r.totals.uniquePrice)}</strong>
            </p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted">
                  <th className="text-left font-semibold py-1">Cidade</th>
                  <th className="text-right font-semibold py-1">Resultado</th>
                  <th className="text-right font-semibold py-1">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.totals.uniqueByCity.map((u, i) => (
                  <tr key={i}>
                    <td className="py-1.5 truncate max-w-40">{u.city}</td>
                    <td className={clsx("py-1.5 text-right tnum font-semibold", u.result < 0 ? "text-bad" : "text-ok")}>{brl(u.result)}</td>
                    <td className="py-1.5 text-right tnum">{pct(u.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[12px] text-muted">Cidade em vermelho dá prejuízo com o preço único e é sustentada pelas outras. Para não depender delas, cobre o preço sugerido daquela cidade ou junte mais ações nela para diluir o deslocamento.</p>
          </section>

          <section className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-3">
            <label className="block">
              <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Observações</span>
              <textarea id="q-notes" rows={2} value={q.notes ?? ""} onChange={(e) => setQ({ ...q, notes: e.target.value })} className={inputClass + " !h-auto py-2"} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={pending} onClick={save} className={buttonClass("primary")}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar orçamento
              </button>
              {msg ? <p className={clsx("text-[13px] font-medium", msg.ok ? "text-ok" : "text-bad")}>{msg.text}</p> : null}
            </div>
          </section>

          {quotes.length ? (
            <section className="bg-surface border border-line rounded-[var(--radius-card)] p-5 space-y-2">
              <h2 className="font-semibold text-[15px]">Orçamentos salvos</h2>
              <ul className="divide-y divide-line">
                {quotes.map((x) => (
                  <li key={x.id} className="py-2 flex items-center gap-2 text-[13px]">
                    <Link href={`/painel/degustacoes/calculadora?orcamento=${x.id}`} className={clsx("flex-1 min-w-0 truncate hover:underline", x.id === q.id && "font-bold")}>
                      {x.name}
                      <span className="text-muted font-normal">
                        {" "}
                        · {x.brandName ?? "sem marca"} · {x.count} cidade(s) · {x.updatedAt}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        start(async () => {
                          const res = await deleteQuoteAction(x.id);
                          if (res.ok && x.id === q.id) router.replace("/painel/degustacoes/calculadora");
                        })
                      }
                      className="size-8 grid place-items-center rounded-lg text-bad hover:bg-subtle"
                      aria-label={`Apagar ${x.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/painel/degustacoes/calculadora?novo=1" className="inline-block text-[13px] font-semibold text-brand-700 hover:underline">
                + Novo orçamento
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const fmtNum = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/**
 * Logística da cidade em duas partes, cada uma calculada pelo km (km rodados ÷ km
 * por litro × combustível) ou digitada em reais quando não há km:
 * transporte (se repete a cada ação) e frete (por viagem, muitas vezes só 1).
 */
function Logistics({ i, c, res, fuel, setCity }: { i: number; c: CalcCity; res: CityResult; fuel: number; setCity: (p: Partial<CalcCity>) => void }) {
  const tByKm = c.transportKm > 0;
  const fByKm = c.freightKm > 0;
  const liters = (km: number, kml: number) => (kml > 0 ? km / kml : 0);
  return (
    <>
      <fieldset className="rounded-xl border border-line p-3 space-y-2">
        <legend className="px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted inline-flex items-center gap-1.5">
          <Fuel className="size-3.5" /> Transporte da equipe (em cada ação)
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
          <Field id={`c-${i}-tkm`} label="Km por ação (ida e volta)" value={c.transportKm} onChange={(v) => setCity({ transportKm: toNum(v) })} />
          <Field id={`c-${i}-tkml`} label="Km/litro do veículo" value={c.transportKml} onChange={(v) => setCity({ transportKml: toNum(v) })} />
          {tByKm ? (
            <Calc label="Transporte por ação" detail={`${fmtNum(liters(c.transportKm, c.transportKml))} L × ${brl(fuel)}`} value={brl(res.transportPerAction)} />
          ) : (
            <Field id={`c-${i}-transport`} label="Transporte por ação (sem km)" value={c.transport} onChange={(v) => setCity({ transport: toNum(v) })} money />
          )}
        </div>
        <p className="text-[12.5px] text-ink-2 tnum">
          Transporte total: {brl(res.transportPerAction)} × {res.actions} ação(ões) = <strong>{brl(res.transportTotal)}</strong>
          {!tByKm ? <span className="text-muted"> · informe o km para calcular pelo combustível</span> : null}
        </p>
      </fieldset>
      <fieldset className="rounded-xl border border-line p-3 space-y-2">
        <legend className="px-1 text-[11.5px] font-bold uppercase tracking-wide text-muted inline-flex items-center gap-1.5">
          <Truck className="size-3.5" /> Frete do material (balcão → loja)
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <Field id={`c-${i}-fkm`} label="Km por viagem (ida e volta)" value={c.freightKm} onChange={(v) => setCity({ freightKm: toNum(v) })} />
          <Field id={`c-${i}-fkml`} label="Km/litro do veículo" value={c.freightKml} onChange={(v) => setCity({ freightKml: toNum(v) })} />
          <Field id={`c-${i}-ftrips`} label="Viagens" value={c.freightTrips} onChange={(v) => setCity({ freightTrips: Math.max(1, Math.round(toNum(v))) })} />
          {fByKm ? (
            <Calc label="Frete por viagem" detail={`${fmtNum(liters(c.freightKm, c.freightKml))} L × ${brl(fuel)}`} value={brl(res.freightPerTrip)} />
          ) : (
            <Field id={`c-${i}-freight`} label="Frete por viagem (sem km)" value={c.freight} onChange={(v) => setCity({ freight: toNum(v) })} money />
          )}
        </div>
        <p className="text-[12.5px] text-ink-2 tnum">
          Frete total: {brl(res.freightPerTrip)} × {Math.max(1, c.freightTrips)} viagem(ns) = <strong>{brl(res.freightTotal)}</strong> <span className="text-muted">(rateado nas ações)</span>
        </p>
      </fieldset>
    </>
  );
}

function Calc({ label, detail, value }: { label: string; detail: string; value: string }) {
  return (
    <div>
      <span className="block text-[12px] font-semibold text-ink-2 mb-1 leading-tight">{label}</span>
      <div className="h-10 rounded-lg bg-canvas px-3 flex items-center justify-between gap-2">
        <span className="text-[11.5px] text-muted tnum truncate">{detail}</span>
        <span className="font-bold tnum text-[14px]">{value}</span>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[11.5px] font-bold uppercase tracking-wide text-muted mb-1.5">{title}</legend>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
    </fieldset>
  );
}

function Field({ id, label, value, onChange, money, w }: { id: string; label: string; value: number; onChange: (v: string) => void; money?: boolean; w?: string }) {
  const [text, setText] = useState(toText(value));
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (toNum(text) !== value) setText(toText(value));
  }
  return (
    <label className={clsx("block", w)}>
      <span className="block text-[12px] font-semibold text-ink-2 mb-1 leading-tight">{label}</span>
      <div className="relative">
        {money ? <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted">R$</span> : null}
        <input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="0"
          className={clsx(inputClass, "tnum", money && "!pl-8")}
        />
      </div>
    </label>
  );
}

function Pct({ id, label, value, onChange, hint }: { id: string; label: string; value: number; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
      <input id={id} inputMode="decimal" defaultValue={String(value).replace(".", ",")} onChange={(e) => onChange(e.target.value)} className={inputClass + " tnum"} />
      <span className="block text-[11px] text-muted mt-0.5">{hint}</span>
    </label>
  );
}

function Out({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-muted leading-tight">{label}</p>
      <p className={clsx("tnum", strong ? "font-bold text-[14px]" : "font-semibold")}>{value}</p>
    </div>
  );
}
