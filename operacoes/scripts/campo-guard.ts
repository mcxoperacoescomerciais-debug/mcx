/** Tabelas que só existem no banco do MCX Campo. */
export const CAMPO_TABLES = ["visits", "attendances", "agencies", "schedules"] as const;

export function looksLikeCampo(tables: string[]): boolean {
  return tables.some((t) => (CAMPO_TABLES as readonly string[]).includes(t));
}
