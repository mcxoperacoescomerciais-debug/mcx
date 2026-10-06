"use client";

/**
 * Gráficos do painel (Recharts).
 *
 * Cores: severidade usa a paleta de STATUS (reservada) e cada barra leva
 * rótulo e valor diretos — a cor nunca é a única pista. Séries por tipo usam
 * os três primeiros slots categóricos validados (azul, laranja, água) e
 * aparecem sempre na mesma ordem e cor, independentemente do filtro.
 */
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SEVERITY_COLOR, SEVERITY_LABEL, type Severity } from "@/lib/domain";

const AXIS = { fontSize: 12, fill: "#6B7290" };
const GRID = "#EEF0F5";

export const SERIES = {
  nearExpiry: { color: "#2a78d6", label: "Validade (vencidos e próximos)" },
  ruptures: { color: "#eb6834", label: "Rupturas" },
  damages: { color: "#1baf7a", label: "Avarias" },
} as const;

function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string | number }[] }) {
  return (
    <div className="rounded-lg bg-surface border border-line shadow-[var(--shadow-pop)] px-3 py-2 text-[12.5px]">
      <p className="font-semibold text-ink mb-1">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color ? <span className="size-2.5 rounded-sm" style={{ background: r.color }} /> : null}
          <span className="flex-1">{r.label}</span>
          <span className="font-semibold text-ink tnum">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function SeverityChart({ data }: { data: { severity: Severity; items: number; units: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: SEVERITY_LABEL[d.severity] }));
  return (
    <div className="h-[260px]" role="img" aria-label="Itens por faixa de validade">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "#3C4462", fontWeight: 600 }} axisLine={false} tickLine={false} width={110} />
          <Tooltip
            cursor={{ fill: "rgba(11,18,54,0.04)" }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <TooltipBox
                  title={String(payload[0].payload.label)}
                  rows={[
                    { label: "Itens registrados", value: payload[0].payload.items },
                    { label: "Unidades", value: payload[0].payload.units.toLocaleString("pt-BR") },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="items" radius={[0, 4, 4, 0]} maxBarSize={26}>
            {rows.map((r) => (
              <Cell key={r.severity} fill={SEVERITY_COLOR[r.severity].solid} />
            ))}
            <LabelList dataKey="items" position="right" style={{ fontSize: 12, fontWeight: 700, fill: "#0E1430" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ data }: { data: { day: string; nearExpiry: number; ruptures: number; damages: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}` }));
  const keys = ["nearExpiry", "ruptures", "damages"] as const;
  return (
    <div className="h-[260px]" role="img" aria-label="Ocorrências por dia">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: "#CFD4E0", strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={String(label)} rows={keys.map((k) => ({ color: SERIES[k].color, label: SERIES[k].label, value: payload[0].payload[k] }))} />
              ) : null
            }
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: "#3C4462", paddingTop: 6 }} />
          {keys.map((k) => (
            <Line key={k} type="linear" dataKey={k} name={SERIES[k].label} stroke={SERIES[k].color} strokeWidth={2} dot={rows.length <= 16 ? { r: 3, strokeWidth: 2, fill: "#fff" } : false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Evolução semanal (página de loja e produto) — barras empilhadas por tipo. */
export function WeeklyStack({ data }: { data: { week: string; nearExpiry: number; ruptures: number; damages: number }[] }) {
  const keys = ["nearExpiry", "ruptures", "damages"] as const;
  return (
    <div className="h-[240px]" role="img" aria-label="Ocorrências por semana">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="week" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(11,18,54,0.04)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox title={`Semana de ${label}`} rows={keys.map((k) => ({ color: SERIES[k].color, label: SERIES[k].label, value: payload[0].payload[k] }))} />
              ) : null
            }
          />
          <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: "#3C4462", paddingTop: 6 }} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} name={SERIES[k].label} stackId="a" fill={SERIES[k].color} stroke="#fff" strokeWidth={2} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
