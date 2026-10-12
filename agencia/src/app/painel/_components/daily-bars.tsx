"use client";

/**
 * Evolução diária (uma série): barras finas ancoradas na base, valor no
 * tooltip ao passar o mouse/tocar, eixo discreto. Dias sem registro aparecem
 * como zero real (o período inteiro é mostrado, sem lacunas enganosas).
 */
import { useState } from "react";
import { addDays, fmtDate } from "@/lib/dates";

export function DailyBars({ data, from, to, label }: { data: { date: string; n: number }[]; from: string; to: string; label: string }) {
  const days: { date: string; n: number }[] = [];
  for (let d = from; d <= to && days.length < 120; d = addDays(d, 1)) days.push({ date: d, n: data.find((x) => x.date === d)?.n ?? 0 });
  const max = Math.max(1, ...days.map((d) => d.n));
  const [hover, setHover] = useState<number | null>(null);
  const h = 140;
  return (
    <figure>
      <div className="relative">
        <div className="flex items-end gap-[2px] h-[140px] border-b border-line" role="img" aria-label={`${label}: ${days.map((d) => `${fmtDate(d.date)} ${d.n}`).join(", ")}`}>
          {days.map((d, i) => (
            <div
              key={d.date}
              className="flex-1 h-full flex items-end cursor-default"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(i)}
            >
              <div className={`w-full rounded-t-[4px] ${hover === i ? "bg-brand-800" : "bg-brand-600"}`} style={{ height: d.n ? Math.max(3, (d.n / max) * h) : 0 }} />
            </div>
          ))}
        </div>
        {hover !== null ? (
          <div className="absolute -top-2 pointer-events-none bg-ink text-white text-[12px] rounded-lg px-2.5 py-1.5 shadow-[var(--shadow-pop)] whitespace-nowrap" style={{ left: `${((hover + 0.5) / days.length) * 100}%`, transform: "translate(-50%, -100%)" }}>
            {fmtDate(days[hover].date)} · <strong>{days[hover].n}</strong> {label.toLowerCase()}
          </div>
        ) : null}
      </div>
      <figcaption className="flex justify-between text-[11.5px] text-muted mt-1.5 tnum">
        <span>{fmtDate(from)}</span>
        <span>máx. {max === 1 && !days.some((d) => d.n) ? 0 : max} por dia</span>
        <span>{fmtDate(to)}</span>
      </figcaption>
    </figure>
  );
}
