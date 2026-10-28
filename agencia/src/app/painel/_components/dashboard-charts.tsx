"use client";

/**
 * Gráficos interativos dos indicadores (recharts). Passar o mouse mostra os
 * números; clicar numa barra de rede ou loja filtra a tela por ela.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";

export interface ChartSlice {
  id: string;
  name: string;
  checks: number;
  ruptures: number;
  index: number | null;
}

const C = {
  brand: "#1f6b79",
  brandDark: "#11414b",
  bad: "#c0392b",
  warn: "#d98200",
  ok: "#1d7348",
  info: "#1d5ea6",
  grid: "#e3e8ea",
  text: "#5b6b70",
};

const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${String(v).replace(".", ",")}%`);
const short = (t: string, n = 22) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

function useFilterLink() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };
}

function TipBox({ title, lines }: { title: string; lines: [string, string][] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 shadow-lg text-[12.5px]">
      <p className="font-semibold mb-0.5">{title}</p>
      {lines.map(([k, v]) => (
        <p key={k} className="text-ink-2">
          {k}: <strong className="tnum">{v}</strong>
        </p>
      ))}
    </div>
  );
}

/** Índice de ruptura por rede ou loja (barras horizontais, clique filtra). */
export function IndexBars({ data, filterKey, height }: { data: ChartSlice[]; filterKey?: "chain" | "store"; height?: number }) {
  const go = useFilterLink();
  const rows = data.filter((d) => d.checks > 0 || d.ruptures > 0).slice(0, 12);
  if (!rows.length) return <Empty />;
  const h = height ?? Math.max(160, rows.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={rows.map((r) => ({ ...r, label: short(r.name), value: r.index ?? 0 }))} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fill: C.text, fontSize: 11 }} />
        <YAxis type="category" dataKey="label" width={150} tick={{ fill: C.text, fontSize: 11.5 }} />
        <Tooltip
          cursor={{ fill: "rgba(31,107,121,.08)" }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (ChartSlice & { value: number }) | undefined;
            return p ? <TipBox title={p.name} lines={[["Índice de ruptura", fmtPct(p.index)], ["SKUs em ruptura", String(p.ruptures)], ["SKUs verificados", String(p.checks)]]} /> : null;
          }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: C.text, formatter: (v: unknown) => fmtPct(Number(v)) }} cursor={filterKey ? "pointer" : undefined} onClick={(d) => filterKey && d && go(filterKey, (d as unknown as ChartSlice).id)}>
          {rows.map((r) => (
            <Cell key={r.id} fill={(r.index ?? 0) >= 20 ? C.bad : (r.index ?? 0) >= 10 ? C.warn : C.brand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** SKUs com mais ruptura (quantidade de vezes). */
export function CountBars({ data, color = C.bad, unit = "ruptura(s)" }: { data: { id: string; name: string; value: number; extra?: string }[]; color?: string; unit?: string }) {
  const rows = data.filter((d) => d.value > 0).slice(0, 12);
  if (!rows.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34 + 30)}>
      <BarChart data={rows.map((r) => ({ ...r, label: short(r.name, 30) }))} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: C.text, fontSize: 11 }} />
        <YAxis type="category" dataKey="label" width={190} tick={{ fill: C.text, fontSize: 11 }} />
        <Tooltip
          cursor={{ fill: "rgba(192,57,43,.06)" }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as { name: string; value: number; extra?: string } | undefined;
            return p ? <TipBox title={p.name} lines={[[unit, String(p.value)], ...(p.extra ? ([["Detalhe", p.extra]] as [string, string][]) : [])]} /> : null;
          }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} label={{ position: "right", fontSize: 11, fill: C.text }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Evolução diária: SKUs em ruptura (barras) e índice de ruptura (linha). */
export function TrendChart({ data }: { data: ChartSlice[] }) {
  if (!data.length) return <Empty />;
  const rows = data.map((d) => ({ ...d, label: `${d.id.slice(8, 10)}/${d.id.slice(5, 7)}`, idx: d.index ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" tick={{ fill: C.text, fontSize: 11 }} />
        <YAxis yAxisId="n" allowDecimals={false} tick={{ fill: C.text, fontSize: 11 }} />
        <YAxis yAxisId="p" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fill: C.text, fontSize: 11 }} />
        <Tooltip
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (ChartSlice & { label: string }) | undefined;
            return p ? <TipBox title={p.label} lines={[["Índice de ruptura", fmtPct(p.index)], ["SKUs em ruptura", String(p.ruptures)], ["SKUs verificados", String(p.checks)]]} /> : null;
          }}
        />
        <Bar yAxisId="n" dataKey="ruptures" fill={C.bad} fillOpacity={0.75} radius={[4, 4, 0, 0]} name="Rupturas" />
        <Line yAxisId="p" type="linear" dataKey="idx" stroke={C.brandDark} strokeWidth={2.5} dot={{ r: 3 }} name="Índice" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Rosca com legenda (ex.: área de vendas × estoque; avarias por tipo). */
export function Donut({ data, center }: { data: { name: string; value: number; color?: string }[]; center?: string }) {
  const rows = data.filter((d) => d.value > 0);
  if (!rows.length) return <Empty />;
  const palette = [C.bad, C.warn, C.brand, C.info, C.ok, "#7c4d9e", "#8a6d3b"];
  const total = rows.reduce((t, r) => t + r.value, 0);
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="relative" style={{ width: 170, height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80} paddingAngle={2} stroke="none">
              {rows.map((r, i) => (
                <Cell key={r.name} fill={r.color ?? palette[i % palette.length]} />
              ))}
            </Pie>
            <Tooltip content={({ payload }) => (payload?.[0] ? <TipBox title={String(payload[0].name)} lines={[["Quantidade", String(payload[0].value)], ["Participação", fmtPct(Math.round((Number(payload[0].value) / total) * 1000) / 10)]]} /> : null)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
          <span className="text-[22px] font-bold tnum leading-none">
            {total}
            {center ? <span className="block text-[11px] font-medium text-muted mt-1">{center}</span> : null}
          </span>
        </div>
      </div>
      <ul className="space-y-1.5 text-[13px] min-w-0 flex-1">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="size-3 rounded-sm shrink-0" style={{ background: r.color ?? palette[i % palette.length] }} />
            <span className="truncate flex-1">{r.name}</span>
            <strong className="tnum">{r.value}</strong>
            <span className="text-muted tnum w-12 text-right">{fmtPct(Math.round((r.value / total) * 1000) / 10)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra de progresso grande (cobertura de lojas atendidas). */
export function Gauge({ value, label }: { value: number | null; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const color = v >= 90 ? C.ok : v >= 70 ? C.warn : C.bad;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-ink-2">{label}</span>
        <strong className="text-[22px] tnum" style={{ color }}>
          {fmtPct(value)}
        </strong>
      </div>
      <div className="h-3 rounded-full bg-canvas mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: color }} />
      </div>
    </div>
  );
}

/** Tempo real: atualiza os dados da tela sozinho (padrão a cada 60 s). */
export function LiveRefresh({ seconds = 60, generatedAt }: { seconds?: number; generatedAt: string }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [paused, seconds, router]);
  const at = new Date(generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] text-muted" data-export-skip>
      <span className="relative flex size-2.5">
        {!paused ? <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 animate-ping motion-reduce:hidden" /> : null}
        <span className={`relative inline-flex size-2.5 rounded-full ${paused ? "bg-line-strong" : "bg-ok"}`} />
      </span>
      {paused ? "Atualização pausada" : `Ao vivo · atualizado às ${at}`}
      <button type="button" onClick={() => setPaused((p) => !p)} className="font-semibold text-brand-700 hover:underline">
        {paused ? "Retomar" : "Pausar"}
      </button>
      <button type="button" onClick={() => router.refresh()} className="text-brand-700" aria-label="Atualizar agora" title="Atualizar agora">
        <RefreshCw className="size-3.5" />
      </button>
    </span>
  );
}

function Empty() {
  return <p className="text-[13px] text-muted py-8 text-center">Sem registros neste filtro.</p>;
}
