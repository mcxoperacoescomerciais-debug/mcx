"use client";

/**
 * Importar cronograma: 1) envia o arquivo (fica guardado); 2) confere e corrige
 * cada linha (datas, loja, cidade, valores); 3) salva só as marcadas.
 * Duplicadas e linhas com problema vêm desmarcadas.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import clsx from "clsx";
import { buttonClass, inputClass, selectClass } from "@/components/ui";
import type { PreviewRow } from "@/server/tasting-import";
import { commitScheduleAction, previewScheduleAction } from "../actions";

const BLOCKING = ["sem data", "sem loja", "sem cidade", "horário final antes do inicial"];

export function ScheduleImport({ brands }: { brands: { id: string; name: string }[] }) {
  const [brandId, setBrandId] = useState("");
  const [rows, setRows] = useState<(PreviewRow & { on: boolean })[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [info, setInfo] = useState<{ mapped: string[]; unmapped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: { line: number; reason: string }[] } | null>(null);
  const [pending, start] = useTransition();

  const patch = (i: number, p: Partial<PreviewRow & { on: boolean }>) => setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const issuesOf = (r: PreviewRow) => {
    const out: string[] = [];
    if (!r.date) out.push("sem data");
    if (!r.storeName && !r.chainName) out.push("sem loja");
    if (!r.city) out.push("sem cidade");
    if (r.startTime && r.endTime && r.endTime <= r.startTime) out.push("horário final antes do inicial");
    if (r.revenue === null) out.push("sem valor da marca (fica pendente)");
    return out;
  };

  return (
    <div className="space-y-5">
      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            setResult(null);
            const r = await previewScheduleAction(fd);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setBatchId(r.batchId!);
            setInfo({ mapped: r.mapped ?? [], unmapped: r.unmapped ?? [] });
            setRows(r.rows!.map((x) => ({ ...x, on: !x.duplicate && !x.issues.some((i) => BLOCKING.includes(i)) })));
          })
        }
        className="bg-surface border border-line rounded-[var(--radius-card)] p-5 grid sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-end"
      >
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Marca do cronograma *</span>
          <select name="brandId" required value={brandId} onChange={(e) => setBrandId(e.target.value)} className={selectClass}>
            <option value="" disabled>
              Escolha a marca
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Arquivo enviado pela marca (.xlsx ou .csv) *</span>
          <input name="file" type="file" required accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block w-full text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:font-semibold" />
        </label>
        <button disabled={pending} className={buttonClass("primary")}>
          {pending && !rows ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Ler arquivo
        </button>
      </form>
      {error ? <p className="text-[13.5px] text-bad font-medium">{error}</p> : null}

      {rows ? (
        <div className="bg-surface border border-line rounded-[var(--radius-card)]">
          <div className="px-5 py-4 border-b border-line">
            <h2 className="font-semibold text-[15px]">Conferência · {rows.length} linha(s) lida(s)</h2>
            <p className="text-[12.5px] text-muted mt-0.5">
              Colunas reconhecidas: {info?.mapped.join(", ") || "nenhuma"}
              {info?.unmapped.length ? ` · não usadas: ${info.unmapped.join(", ")}` : ""}. Corrija o que precisar; só as linhas marcadas serão salvas. O arquivo original fica guardado junto das degustações.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-subtle text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">Salvar</th>
                  <th className="px-2 py-2 text-left">Linha</th>
                  <th className="px-2 py-2 text-left">Data</th>
                  <th className="px-2 py-2 text-left">Início</th>
                  <th className="px-2 py-2 text-left">Fim</th>
                  <th className="px-2 py-2 text-left">Rede</th>
                  <th className="px-2 py-2 text-left">Loja</th>
                  <th className="px-2 py-2 text-left">Cidade</th>
                  <th className="px-2 py-2 text-left">Produto</th>
                  <th className="px-2 py-2 text-right">Valor marca</th>
                  <th className="px-2 py-2 text-right">Degustadora</th>
                  <th className="px-2 py-2 text-left">Conferir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => {
                  const issues = issuesOf(r);
                  const blocked = issues.some((x) => BLOCKING.includes(x));
                  const cell = (k: keyof PreviewRow, w = "w-32", type = "text") => (
                    <input
                      type={type}
                      value={(r[k] as string | null) ?? ""}
                      onChange={(e) => patch(i, { [k]: e.target.value || null } as Partial<PreviewRow>)}
                      className={clsx(inputClass, "!h-8 !text-[12.5px] !px-2", w)}
                    />
                  );
                  const num = (k: "revenue" | "tasterFee") => (
                    <input
                      inputMode="decimal"
                      value={r[k] === null ? "" : String(r[k]).replace(".", ",")}
                      onChange={(e) => {
                        const t = e.target.value.replace(/[R$\s]/g, "");
                        const n = t ? Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t) : null;
                        patch(i, { [k]: n !== null && Number.isFinite(n) ? n : null });
                      }}
                      className={clsx(inputClass, "!h-8 !text-[12.5px] !px-2 w-24 text-right")}
                    />
                  );
                  return (
                    <tr key={r.line} className={clsx(!r.on && "bg-canvas/70")}>
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={r.on} disabled={blocked} onChange={(e) => patch(i, { on: e.target.checked })} aria-label={`Salvar linha ${r.line}`} />
                      </td>
                      <td className="px-2 py-1.5 tnum text-muted">{r.line}</td>
                      <td className="px-2 py-1.5">{cell("date", "w-36", "date")}</td>
                      <td className="px-2 py-1.5">{cell("startTime", "w-24", "time")}</td>
                      <td className="px-2 py-1.5">{cell("endTime", "w-24", "time")}</td>
                      <td className="px-2 py-1.5">{cell("chainName", "w-24")}</td>
                      <td className="px-2 py-1.5">{cell("storeName", "w-44")}</td>
                      <td className="px-2 py-1.5">{cell("city", "w-32")}</td>
                      <td className="px-2 py-1.5">{cell("product", "w-40")}</td>
                      <td className="px-2 py-1.5">{num("revenue")}</td>
                      <td className="px-2 py-1.5">{num("tasterFee")}</td>
                      <td className="px-2 py-1.5 min-w-44">
                        {r.duplicate ? <span className="block text-bad font-semibold">possível duplicada</span> : null}
                        {r.storeId ? <span className="block text-ok">loja cadastrada</span> : null}
                        {issues.map((x) => (
                          <span key={x} className={clsx("block", BLOCKING.includes(x) ? "text-bad font-semibold" : "text-warn")}>
                            {x}
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-line flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || !rows.some((r) => r.on)}
              onClick={() =>
                start(async () => {
                  const r = await commitScheduleAction(batchId!, brandId, rows.filter((x) => x.on));
                  if (!r.ok) setError(r.error);
                  else {
                    setResult({ created: r.created ?? 0, skipped: r.skipped ?? [] });
                    setRows(null);
                  }
                })
              }
              className={buttonClass("primary")}
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Salvar {rows.filter((r) => r.on).length} degustação(ões)
            </button>
            <p className="text-[12px] text-muted">Elas entram como “Aguardando degustadora”. Valores que vieram em branco ficam pendentes.</p>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-ok/30 bg-ok-bg/50 p-4 text-[13.5px]">
          <p className="font-semibold text-ok flex items-center gap-1.5">
            <CheckCircle2 className="size-4" /> {result.created} degustação(ões) importada(s).
          </p>
          {result.skipped.length ? (
            <ul className="mt-2 space-y-0.5 text-ink-2">
              {result.skipped.map((x) => (
                <li key={x.line} className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-warn" /> Linha {x.line}: {x.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <Link href="/painel/degustacoes/agenda?view=lista" className="inline-block mt-2 font-semibold text-brand-700 hover:underline">
            Ver na agenda →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
