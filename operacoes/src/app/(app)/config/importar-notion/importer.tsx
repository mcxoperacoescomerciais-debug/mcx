"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { importNotionAction } from "@/app/actions";
import { formatBr } from "@/lib/dates";
import type { NotionImportResult } from "@/server/notion-import";

type Option = { id: string; name: string };

export function NotionImporter({ categories, clients }: { categories: Option[]; clients: Option[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [noClient, setNoClient] = useState(false);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<NotionImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function send(dryRun: boolean, map = clientMap) {
    setError(null);
    setDone(null);
    start(async () => {
      const result = await importNotionAction(csv, { dryRun, categoryId: categoryId || null, clientMap: map, noClient: noClient ? "internal" : "skip" });
      if (!result.ok) return setError(result.error);
      if (dryRun) return setPreview(result);
      setPreview(null);
      setCsv("");
      setDone(`${result.message ?? "Importação concluída."}${result.unassigned ? ` ${result.unassigned} sem responsável (“A distribuir”).` : ""}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ni-file">CSV exportado do Notion (banco “Projetos e Tarefas”)</label>
          <input
            id="ni-file"
            type="file"
            accept=".csv,text/csv"
            className="field py-2"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setPreview(null);
              setCsv(await file.text());
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="ni-cat">Categoria das demandas importadas</label>
          <select id="ni-cat" className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Escolha… (o Notion não tem categoria)</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" className="size-4" checked={noClient} onChange={(e) => { setNoClient(e.target.checked); setPreview(null); }} /> Tarefas sem cliente no Notion vão para “Interno MCX” (desmarcado: não entram)
      </label>
      {error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{error}</p>}
      {done && (
        <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm text-ok">
          {done} <Link href="/demandas?responsavel=none" className="font-semibold underline underline-offset-2">Ver as sem responsável</Link>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" disabled={pending || !csv.trim()} onClick={() => send(true)}>Conferir antes de importar</button>
        {preview && preview.toImport > 0 && (
          <button type="button" className="btn-primary" disabled={pending || !categoryId} onClick={() => send(false)}>
            Importar {preview.toImport} {preview.toImport === 1 ? "demanda" : "demandas"}
          </button>
        )}
      </div>
      {preview && preview.toImport > 0 && !categoryId && <p className="text-xs font-semibold text-warn">Escolha a categoria para liberar a importação.</p>}

      {preview && (
        <>
          <p className="text-sm text-ink-2">
            {preview.rows.length} {preview.rows.length === 1 ? "linha lida" : "linhas lidas"}: <strong>{preview.toImport}</strong> para importar ({preview.unassigned} sem responsável) e <strong>{preview.skipped}</strong> que não entram.
            {preview.unknownColumns.length > 0 && <span className="text-muted"> Colunas ignoradas: {preview.unknownColumns.join(", ")}.</span>}
          </p>

          {preview.unmatchedClients.length > 0 && (
            <section className="rounded-lg border border-warn/30 bg-warn-bg p-3" aria-label="Clientes não reconhecidos">
              <p className="mb-2 text-sm font-bold text-warn">Clientes do Notion que não reconheci — diga para qual contratante cada um vai:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.unmatchedClients.map((name) => (
                  <div key={name}>
                    <label className="label" htmlFor={`nm-${name}`}>{name}</label>
                    <select id={`nm-${name}`} className="field" value={clientMap[name] ?? ""} onChange={(e) => setClientMap({ ...clientMap, [name]: e.target.value })}>
                      <option value="">Não importar</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-ghost mt-3" disabled={pending} onClick={() => send(true)}>Conferir de novo com este de-para</button>
            </section>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-1 font-semibold">#</th>
                  <th className="pb-1 font-semibold">Tarefa</th>
                  <th className="pb-1 font-semibold">Contratante</th>
                  <th className="pb-1 font-semibold">Responsável</th>
                  <th className="pb-1 font-semibold">Status</th>
                  <th className="pb-1 font-semibold">Prazo</th>
                  <th className="pb-1 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="py-1.5 text-muted">{r.line}</td>
                    <td className="py-1.5 text-ink">{r.title}</td>
                    <td className="py-1.5 text-ink-2">{r.clientName ?? "—"}{r.brand ? ` · ${r.brand}` : ""}</td>
                    <td className={r.action === "import" && !r.assigneeName ? "py-1.5 font-semibold text-warn" : "py-1.5 text-ink-2"}>{r.action === "import" ? (r.assigneeName ?? "A distribuir") : "—"}</td>
                    <td className="py-1.5 text-ink-2">{r.statusLabel ?? "—"}</td>
                    <td className="py-1.5 text-ink-2">{r.dueDate ? formatBr(r.dueDate) : "—"}</td>
                    <td className="py-1.5">
                      {r.action === "skip" ? <span className="font-semibold text-warn">Não entra — {r.reason}</span> : <span className="text-ok">Entra</span>}
                      {r.action === "import" && r.warnings.map((w) => <span key={w} className="block text-xs text-muted">{w}</span>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
