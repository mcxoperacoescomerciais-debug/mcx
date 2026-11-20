"use client";
import clsx from "clsx";
import { addDays, nextFriday } from "@/lib/dates";

/** Prazo com atalhos: Hoje / Amanhã / Sexta / Data / Sem prazo. */
export function DuePicker({ value, onChange, today, allowNone = true }: { value: string | null; onChange: (v: string | null) => void; today: string; allowNone?: boolean }) {
  const shortcuts = [
    { label: "Hoje", date: today },
    { label: "Amanhã", date: addDays(today, 1) },
    { label: "Sexta", date: nextFriday(today) },
  ];
  // "Sexta" some quando coincide com Hoje ou Amanhã.
  const unique = shortcuts.filter((s, i) => shortcuts.findIndex((x) => x.date === s.date) === i);
  const custom = value !== null && !unique.some((s) => s.date === value);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {unique.map((s) => (
        <button key={s.label} type="button" aria-pressed={value === s.date} className={clsx("chip", value === s.date && "chip-on")} onClick={() => onChange(s.date)}>
          {s.label}
        </button>
      ))}
      <input type="date" aria-label="Outra data" className={clsx("field w-auto", custom && "border-brand-800 ring-2 ring-brand-100")} value={custom ? (value ?? "") : ""} onChange={(e) => e.target.value && onChange(e.target.value)} />
      {allowNone && (
        <button type="button" aria-pressed={value === null} className={clsx("chip", value === null && "chip-on")} onClick={() => onChange(null)}>
          Sem prazo
        </button>
      )}
    </div>
  );
}
