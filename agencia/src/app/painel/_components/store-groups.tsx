/**
 * Lista agrupada por loja (estoque, ruptura, validade, avaria): cada loja
 * aparece uma vez, com quantos itens tem; clicar abre os itens dela logo
 * abaixo. Sem JavaScript (details/summary). A paginação é por loja.
 *
 * O "Exportar Excel" da página lê uma tabela escondida com uma linha por item
 * (com a loja), em vez das tabelas de cada loja.
 */
import type { ReactNode } from "react";
import { ChevronRight, Store } from "lucide-react";
import { Pagination, Table, Th } from "./widgets";

export interface StoreRef {
  id: string;
  name: string;
  city?: string | null;
}

export function StoreGroups<T>({
  rows,
  storeOf,
  head,
  renderRow,
  exportTitle,
  exportHead,
  exportRow,
  countLabel = (n) => `${n} produto(s)`,
  extra,
  page,
  pageSize = 50,
  hrefFor,
  openFirst = false,
}: {
  rows: T[];
  storeOf: (r: T) => StoreRef;
  /** Cabeçalho da tabela de itens (sem a coluna Loja). */
  head: ReactNode;
  /** Linha <tr> de um item (sem a coluna Loja). */
  renderRow: (r: T, i: number) => ReactNode;
  exportTitle: string;
  exportHead: string[];
  exportRow: (r: T) => (string | number | null | undefined)[];
  countLabel?: (n: number) => string;
  /** Resumo extra ao lado do nome da loja (ex.: "3 acabaram"). */
  extra?: (items: T[]) => ReactNode;
  page: number;
  pageSize?: number;
  hrefFor: (page: number) => string;
  openFirst?: boolean;
}) {
  const groups: { store: StoreRef; items: T[] }[] = [];
  const at = new Map<string, number>();
  for (const r of rows) {
    const st = storeOf(r);
    let i = at.get(st.id);
    if (i === undefined) {
      i = groups.length;
      at.set(st.id, i);
      groups.push({ store: st, items: [] });
    }
    groups[i].items.push(r);
  }
  const shown = groups.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <ul className="divide-y divide-line border-t border-line" data-export-skip>
        {shown.map((g, gi) => (
          <li key={g.store.id}>
            <details className="group" open={openFirst && gi === 0 && page === 1 ? true : undefined}>
              <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer list-none hover:bg-subtle [&::-webkit-details-marker]:hidden">
                <span className="tnum text-[12px] text-muted w-6 text-right shrink-0">{(page - 1) * pageSize + gi + 1}</span>
                <ChevronRight className="size-4 text-muted shrink-0 transition-transform group-open:rotate-90" />
                <Store className="size-4 text-brand-700 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-[14px]">{g.store.name}</span>
                  {g.store.city ? <span className="text-[12px] text-muted"> · {g.store.city}</span> : null}
                </span>
                {extra ? <span className="hidden sm:inline text-[12.5px]">{extra(g.items)}</span> : null}
                <span className="shrink-0 rounded-full bg-brand-50 text-brand-800 text-[12px] font-semibold px-2.5 py-0.5 tnum">{countLabel(g.items.length)}</span>
              </summary>
              <div className="bg-subtle/60 border-t border-line pl-6 sm:pl-14">
                <Table>
                  <thead>{head}</thead>
                  <tbody>{g.items.map((r, i) => renderRow(r, i))}</tbody>
                </Table>
              </div>
            </details>
          </li>
        ))}
      </ul>
      {groups.length > pageSize ? <Pagination page={page} total={groups.length} pageSize={pageSize} hrefFor={hrefFor} /> : null}

      {/* Para o Excel: uma linha por item, com a loja. */}
      <table hidden data-export-title={exportTitle}>
        <thead>
          <tr>
            <Th>Loja</Th>
            <Th>Cidade</Th>
            {exportHead.map((h) => (
              <Th key={h}>{h}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const st = storeOf(r);
            return (
              <tr key={i}>
                <td>{st.name}</td>
                <td>{st.city ?? ""}</td>
                {exportRow(r).map((c, j) => (
                  <td key={j}>{c ?? ""}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
