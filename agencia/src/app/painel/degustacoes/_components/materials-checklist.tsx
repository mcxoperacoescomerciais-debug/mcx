"use client";

/** Checklist de materiais (fácil de marcar no celular). Cada toque grava na hora. */
import { useOptimistic, useTransition } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { materialAction } from "../actions";

export function MaterialsChecklist({ tastingId, items, editable }: { tastingId: string; items: { item: string; checked: boolean }[]; editable: boolean }) {
  const [list, setList] = useOptimistic(items, (cur, p: { item: string; checked: boolean }) => cur.map((i) => (i.item === p.item ? { ...i, checked: p.checked } : i)));
  const [, start] = useTransition();
  const done = list.filter((i) => i.checked).length;
  if (!list.length) return <p className="text-[13px] text-muted">Sem checklist para esta marca.</p>;
  return (
    <div>
      <p className={clsx("text-[12.5px] font-semibold mb-2", done === list.length ? "text-ok" : done ? "text-warn" : "text-bad")}>
        {done === list.length ? "Checklist concluído" : done ? `Materiais separados: ${done} de ${list.length}` : "Checklist pendente"}
      </p>
      <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
        {list.map((i) => (
          <li key={i.item}>
            <button
              type="button"
              disabled={!editable}
              aria-pressed={i.checked}
              onClick={() =>
                start(async () => {
                  setList({ item: i.item, checked: !i.checked });
                  await materialAction(tastingId, i.item, !i.checked);
                })
              }
              className="w-full min-h-12 px-3.5 flex items-center gap-3 text-left text-[14px] hover:bg-subtle disabled:cursor-default"
            >
              <span className={clsx("size-6 rounded-md border-2 grid place-items-center shrink-0", i.checked ? "bg-ok border-ok text-white" : "border-line-strong")}>{i.checked ? <Check className="size-4" /> : null}</span>
              <span className={i.checked ? "font-semibold" : ""}>{i.item}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
