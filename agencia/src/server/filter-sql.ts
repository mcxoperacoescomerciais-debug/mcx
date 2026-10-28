/** Filtros com vários itens marcados (lista separada por vírgula) nas consultas. */
import "server-only";
import { eq, inArray, sql, type Column, type SQL } from "drizzle-orm";
import { filterValues } from "@/lib/filters";

/** Lista SQL dos itens marcados, para subconsultas escritas à mão: `x in ${sqlList(f.brand)}`. */
export function sqlList(value: string | null | undefined): SQL {
  return sql`(${sql.join(filterValues(value).map((v) => sql`${v}`), sql`, `)})`;
}

/** coluna = item (um marcado) ou coluna in (itens marcados). */
export function filterIn(col: Column | SQL.Aliased, value: string | null | undefined): SQL | undefined {
  const items = filterValues(value);
  if (!items.length) return undefined;
  return items.length === 1 ? eq(col as Column, items[0]) : inArray(col as Column, items);
}
