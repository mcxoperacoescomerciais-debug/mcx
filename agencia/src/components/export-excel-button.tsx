"use client";

/**
 * "Exportar Excel" de qualquer tela do painel: busca a mesma tela sem paginação
 * (?export=1), lê os indicadores e todas as tabelas e monta uma planilha
 * completa (uma aba de resumo + uma aba por tabela) no servidor.
 * Telas com listas que não são tabela marcam os itens com data-export-row.
 */
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";

type Sheet = { name: string; columns: string[]; rows: string[][] };

const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();

function cellText(el: Element): string {
  // Quebras visuais (linhas de detalhe) viram " · " para não colar palavras.
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) parts.push(n.textContent ?? "");
    else if (n.nodeType === Node.ELEMENT_NODE) {
      const e = n as Element;
      if (e.matches("svg, button, script, style, [data-export-skip]")) return;
      const block = /^(DIV|P|LI|BR|SPAN)$/.test(e.tagName) && (e.tagName === "BR" || getBlock(e));
      if (block) parts.push(" · ");
      e.childNodes.forEach(walk);
    }
  };
  walk(el);
  return clean(parts.join(" "))
    .replace(/^(· )+|( ·)+$/g, "")
    .replace(/( · )+/g, " · ")
    .replace(/\s·\s*$/g, "");
}

function getBlock(e: Element) {
  const cls = e.getAttribute("class") ?? "";
  return /\bblock\b|\bflex\b|\bgrid\b/.test(cls) || e.tagName === "P" || e.tagName === "DIV" || e.tagName === "LI";
}

function sectionName(el: Element, fallback: string): string {
  const sec = el.closest("section, [data-export-title]");
  const t = sec?.getAttribute("data-export-title") ?? sec?.querySelector("h2, h3")?.textContent;
  return clean(t).replace(/s*·s*d+$/, "") || fallback;
}

function collect(doc: Document, title: string): Sheet[] {
  const main = doc.querySelector("main") ?? doc.body;
  const sheets: Sheet[] = [];
  const kpis = [...main.querySelectorAll("[data-kpi]")].map((k) => [clean(k.querySelector("[data-kpi-label]")?.textContent), clean(k.querySelector("[data-kpi-value]")?.textContent), clean(k.querySelector("[data-kpi-sub]")?.textContent)]);
  if (kpis.length) sheets.push({ name: "Resumo", columns: ["Indicador", "Valor", "Detalhe"], rows: kpis });
  main.querySelectorAll("table").forEach((table, i) => {
    if (table.closest("[data-export-skip]")) return;
    const head = [...table.querySelectorAll("thead tr:last-child th, thead tr:last-child td")].map((th) => clean(th.textContent));
    const bodyRows = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((td) => cellText(td)));
    if (!bodyRows.length) return;
    const width = Math.max(head.length, ...bodyRows.map((r) => r.length));
    const columns = Array.from({ length: width }, (_, c) => head[c] || (c === 0 ? "Item" : `Coluna ${c + 1}`));
    // Coluna vazia de ações (botões/links) sai da planilha.
    const keep = columns.map((_, c) => bodyRows.some((r) => clean(r[c])) || Boolean(head[c]));
    sheets.push({ name: sectionName(table, `${title} ${i + 1}`), columns: columns.filter((_, c) => keep[c]), rows: bodyRows.map((r) => columns.map((_, c) => r[c] ?? "").filter((_, c) => keep[c])) });
  });
  sheets.push(...listSheets(main, title, false));
  return sheets;
}

/** Listas que não são tabela: cada item marcado vira uma linha. live = partes montadas no navegador (mapa ao vivo). */
function listSheets(root: Element, title: string, live: boolean): Sheet[] {
  const sheets: Sheet[] = [];
  const groups = new Map<Element, Element[]>();
  root.querySelectorAll("[data-export-row]").forEach((row) => {
    if (Boolean(row.closest("[data-export-live]")) !== live) return;
    const box = row.closest("[data-export-list]") ?? row.parentElement ?? root;
    groups.set(box, [...(groups.get(box) ?? []), row]);
  });
  for (const [box, rows] of groups) {
    const cols = (box.getAttribute("data-export-columns") ?? "").split("|").filter(Boolean);
    const data = rows.map((r) => {
      const cells = [...r.querySelectorAll("[data-export-cell]")];
      return cells.length ? cells.map((c) => cellText(c)) : [cellText(r)];
    });
    const width = Math.max(1, ...data.map((d) => d.length));
    sheets.push({ name: sectionName(box, title), columns: Array.from({ length: width }, (_, c) => cols[c] || (width === 1 ? "Registro" : `Coluna ${c + 1}`)), rows: data });
  }
  return sheets;
}

export function ExportExcelButton() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!pathname?.startsWith("/painel")) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams(params?.toString() ?? "");
      qs.set("export", "1");
      qs.delete("page");
      const html = await (await fetch(`${pathname}?${qs}`, { credentials: "include" })).text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const title = clean(doc.querySelector("main h1")?.textContent) || clean(document.title.split("·")[0]) || "Relatório";
      const subtitle = clean(doc.querySelector("main h1")?.parentElement?.querySelector("p")?.textContent);
      const sheets = [...collect(doc, title), ...listSheets(document.querySelector("main") ?? document.body, title, true)];
      if (!sheets.length) throw new Error("Esta tela não tem dados para exportar com os filtros atuais.");
      const res = await fetch("/api/export/page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, subtitle, path: pathname, query: params?.toString() ?? "", sheets }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Não foi possível gerar o Excel.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${title.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "_") || "Relatorio"}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" onClick={() => void run()} disabled={busy} className={buttonClass("secondary")} title="Baixa tudo o que esta tela mostra, com os filtros aplicados, sem paginação">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Exportar Excel
      </button>
      {error ? <span className="text-[12px] text-bad mt-1 max-w-64 text-right">{error}</span> : null}
    </span>
  );
}
