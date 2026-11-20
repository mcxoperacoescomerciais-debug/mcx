"use client";
import { useState } from "react";
import { normalizeText } from "@/lib/similarity";

interface Group {
  group: string;
  limits: string[];
  items: { id: string; title: string; description: string; examples: string[]; isNew: boolean }[];
}

export function ManualSearch({ groups }: { groups: Group[] }) {
  const [q, setQ] = useState("");
  const words = normalizeText(q).split(" ").filter(Boolean);
  const match = (text: string) => words.every((w) => normalizeText(text).includes(w));
  const shown = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => match([i.title, i.description, ...i.examples].join(" "))) }))
    .filter((g) => g.items.length || (!words.length && g.limits.length));
  return (
    <>
      <label className="label" htmlFor="m-q">Buscar no manual</label>
      <input id="m-q" className="field mb-5 max-w-md" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: prazo, checklist, contratante" />
      {shown.length === 0 && <p className="card px-4 py-8 text-center text-sm text-muted">Nada encontrado. Tente outra palavra.</p>}
      {shown.map((g) => (
        <section key={g.group} className="mb-7" aria-labelledby={`m-${g.group}`}>
          <h2 id={`m-${g.group}`} className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-2">{g.group}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.items.map((c) => (
              <article key={c.id} className="card p-4">
                <h3 className="font-semibold text-ink">
                  {c.title}
                  {c.isNew && <span className="ml-2 rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">Novidade</span>}
                </h3>
                <p className="mt-0.5 text-sm text-ink-2">{c.description}</p>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {c.examples.map((e) => (
                    <li key={e}>“{e}”</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          {!words.length && g.limits.length > 0 && (
            <p className="mt-3 text-sm text-muted">
              <strong className="text-ink-2">Ainda não dá para:</strong> {g.limits.join("; ")}.
            </p>
          )}
        </section>
      ))}
    </>
  );
}
