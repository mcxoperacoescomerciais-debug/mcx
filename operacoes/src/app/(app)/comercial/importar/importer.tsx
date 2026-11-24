"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importLeadsAction } from "@/app/actions";

interface Row {
  line: number;
  company: string;
  contact: string;
  whatsapp: string;
  city: string;
  type: string;
  source: string;
  focus: string;
  problem: string | null;
  duplicateOf: string | null;
}

export function Importer({ people, userId }: { people: { id: string; name: string }[]; userId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [ownerId, setOwnerId] = useState(people.some((p) => p.id === userId) ? userId : (people[0]?.id ?? ""));
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const valid = rows?.filter((r) => !r.duplicateOf && r.company.trim().length >= 2).length ?? 0;

  function send(dryRun: boolean) {
    setError(null);
    setDone(null);
    start(async () => {
      const result = await importLeadsAction(csv, dryRun, ownerId);
      if (!result.ok) return setError(result.error);
      if (dryRun) return setRows(result.rows);
      setRows(null);
      setCsv("");
      setDone(result.message ?? "Importação concluída.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="im-file">Arquivo CSV</label>
          <input
            id="im-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            className="field py-2"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRows(null);
              setCsv(await file.text());
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="im-owner">Responsável pelos leads</label>
          <select id="im-owner" className="field" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="im-text">…ou cole as linhas aqui (a 1ª linha é o cabeçalho)</label>
        <textarea
          id="im-text"
          className="field min-h-32 py-2 font-mono text-xs"
          value={csv}
          onChange={(e) => {
            setRows(null);
            setCsv(e.target.value);
          }}
          placeholder={"empresa;contato;whatsapp;cidade;tipo;foco;origem\nAgência Tal;Fulano;31 90000-0000;Contagem;Agência de promotoria;App + serviço;Prospecção ativa"}
        />
      </div>
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {done && <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">{done}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={pending || !csv.trim()} onClick={() => send(true)}>Conferir antes de importar</button>
        {rows && valid > 0 && (
          <button type="button" className="btn-primary" disabled={pending} onClick={() => send(false)}>
            Importar {valid} {valid === 1 ? "lead" : "leads"}
          </button>
        )}
      </div>

      {rows && (
        <div className="overflow-x-auto">
          <p className="mb-2 text-sm text-ink-2">
            {rows.length} {rows.length === 1 ? "linha lida" : "linhas lidas"}: <strong>{valid}</strong> para importar, <strong>{rows.length - valid}</strong> para pular.
          </p>
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-1 font-semibold">Linha</th>
                <th className="pb-1 font-semibold">Empresa</th>
                <th className="pb-1 font-semibold">Contato</th>
                <th className="pb-1 font-semibold">Cidade</th>
                <th className="pb-1 font-semibold">Tipo</th>
                <th className="pb-1 font-semibold">Foco</th>
                <th className="pb-1 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className="border-t border-line align-top">
                  <td className="py-1.5 text-muted">{r.line}</td>
                  <td className="py-1.5 text-ink">{r.company}</td>
                  <td className="py-1.5 text-ink-2">{[r.contact, r.whatsapp].filter(Boolean).join(" · ")}</td>
                  <td className="py-1.5 text-ink-2">{r.city}</td>
                  <td className="py-1.5 text-ink-2">{r.type}</td>
                  <td className="py-1.5 text-ink-2">{r.focus}</td>
                  <td className="py-1.5">
                    {r.duplicateOf ? <span className="font-semibold text-warn">Pular — já existe: {r.duplicateOf}</span> : r.problem ? <span className="text-warn">{r.problem}</span> : <span className="text-ok">Entra</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
