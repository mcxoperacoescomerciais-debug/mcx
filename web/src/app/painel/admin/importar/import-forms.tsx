"use client";

import { useActionState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import clsx from "clsx";
import { importMixAction, importTableAction, type ImportState } from "./actions";

function Result({ state }: { state: ImportState }) {
  if (!state.message) return null;
  return (
    <div className={clsx("rounded-lg px-3 py-2 text-[13px]", state.ok ? "bg-[#E7F6EC] text-[#1D6B3A]" : "bg-[#FDECEC] text-[#B42318]")}>
      <p className="font-semibold">{state.message}</p>
      {state.details?.length ? (
        <ul className="mt-1 list-disc list-inside text-[12.5px] font-normal space-y-0.5">
          {state.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const fileClass =
  "block w-full text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-navy-50 file:text-navy-800 file:font-semibold hover:file:bg-navy-100";

export function MixImportForm({ networks }: { networks: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(importMixAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid sm:grid-cols-[200px_1fr] gap-3">
        <label>
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Rede</span>
          <select name="networkId" required className="w-full h-10 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px]">
            {networks.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Planilha de mix (.xlsx)</span>
          <input type="file" name="file" accept=".xlsx" required className={fileClass} />
        </label>
      </div>
      <Result state={state} />
      <button disabled={pending} className="h-10 px-4 rounded-lg bg-navy-900 text-white text-[13.5px] font-semibold inline-flex items-center gap-2 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Importar mix
      </button>
    </form>
  );
}

export function TableImportForm({ kind, label }: { kind: "lojas" | "promotores"; label: string }) {
  const [state, action, pending] = useActionState(importTableAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <label className="block">
        <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">{label}</span>
        <input type="file" name="file" accept=".xlsx,.csv" required className={fileClass} />
      </label>
      <Result state={state} />
      <button disabled={pending} className="h-10 px-4 rounded-lg bg-navy-900 text-white text-[13.5px] font-semibold inline-flex items-center gap-2 disabled:opacity-60">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Importar
      </button>
    </form>
  );
}
