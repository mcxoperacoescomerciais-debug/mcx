"use client";
/* Downloads de arquivos (rotas de API), não navegação entre páginas. */
/* eslint-disable @next/next/no-html-link-for-pages */

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { buttonClass, selectClass } from "@/components/ui";
import { importAction, type ImportState } from "../actions";

export function ImportForm() {
  const [state, run, pending] = useActionState<ImportState, FormData>(importAction, null);
  const r = state?.report;
  return (
    <div className="space-y-5">
      <form action={run} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">O que importar</span>
            <select name="kind" className={selectClass} defaultValue="produtos">
              <option value="produtos">Produtos</option>
              <option value="lojas">Lojas (com redes e marcas autorizadas)</option>
              <option value="promotores">Promotores (com marcas e lojas)</option>
              <option value="metas">Atribuições: promotor × loja × marca × dias × vezes (planilha padrão)</option>
              <option value="mix">Mix de produtos (por formato da rede ou por loja)</option>
              <option value="roteiros">Roteiros (promotor, dias e lojas)</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[12.5px] font-semibold text-ink-2 mb-1">Arquivo (.xlsx ou .csv)</span>
            <input name="file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="block w-full text-[13px] file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:font-semibold" />
          </label>
        </div>
        <label className="inline-flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="dryRun" defaultChecked /> Somente validar (não grava nada — recomendado na primeira vez)
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Processar planilha
          </button>
          <a href="/api/templates/produtos" className={buttonClass("ghost")}>
            <Download className="size-4" /> Modelo de produtos
          </a>
          <a href="/api/templates/lojas" className={buttonClass("ghost")}>
            <Download className="size-4" /> Modelo de lojas
          </a>
          <a href="/api/templates/promotores" className={buttonClass("ghost")}>
            <Download className="size-4" /> Modelo de promotores
          </a>
          <a href="/api/templates/metas" className={buttonClass("ghost")}>
            <Download className="size-4" /> Modelo de atribuições
          </a>
          <a href="/api/templates/mix" className={buttonClass("ghost")}>
            <Download className="size-4" /> Modelo de mix
          </a>
          <a href="/api/templates/roteiros" className={buttonClass("ghost")}>
            <Download className="size-4" /> Modelo de roteiros
          </a>
        </div>
      </form>

      {state?.error ? (
        <p className="flex items-center gap-2 text-[13.5px] text-bad bg-bad-bg rounded-xl px-4 py-3">
          <AlertTriangle className="size-4" /> {state.error}
        </p>
      ) : null}
      {r ? (
        <div className="rounded-xl border border-line p-4" role="status">
          <p className="font-semibold text-[14px] flex items-center gap-2">
            {r.errors.length ? <AlertTriangle className="size-4 text-warn" /> : <CheckCircle2 className="size-4 text-ok" />}
            {r.dryRun ? "Validação concluída (nada foi gravado)" : "Importação concluída"}
          </p>
          <p className="text-[13.5px] mt-1">
            {r.rows} linha(s) lida(s) · {r.created} {r.dryRun ? "seriam criadas" : "criada(s)"} · {r.updated} {r.dryRun ? "seriam atualizadas" : "atualizada(s)"} · <strong className={r.errors.length ? "text-bad" : ""}>{r.errors.length} erro(s)</strong>
          </p>
          {r.errors.length ? (
            <ul className="mt-3 max-h-72 overflow-y-auto text-[13px] space-y-1">
              {r.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-semibold tnum">Linha {e.line}:</span> {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          {r.dryRun && !r.errors.length ? <p className="text-[13px] text-ok mt-2">Tudo certo. Desmarque “Somente validar” e processe de novo para gravar.</p> : null}
          {r.dryRun && r.errors.length ? <p className="text-[13px] text-muted mt-2">Linhas com erro são ignoradas na importação; as demais são gravadas.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
