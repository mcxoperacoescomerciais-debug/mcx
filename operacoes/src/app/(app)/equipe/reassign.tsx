"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDemandAction } from "@/app/actions";

/** Redistribuir uma demanda direto do painel da equipe. */
export function Reassign({ id, title, assigneeId, people }: { id: string; title: string; assigneeId: string; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`ra-${id}`}>Responsável de {title}</label>
      <select
        id={`ra-${id}`}
        className="field min-h-9 w-auto text-xs"
        value={assigneeId}
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value;
          setError(null);
          start(async () => {
            const r = await updateDemandAction(id, { assigneeId: to });
            if (!r.ok) setError(r.error);
            router.refresh();
          });
        }}
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {error && <span role="alert" className="text-xs text-bad">{error}</span>}
    </span>
  );
}
