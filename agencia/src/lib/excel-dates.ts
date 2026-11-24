/**
 * Datas no Excel: texto "24/11/2026" (ou "24/11/2026 14:05", "24/11/2026, 14:05")
 * vira DATA de verdade na planilha — assim o filtro do Excel agrupa por ano e
 * mês e a ordenação segue o calendário. Qualquer outro texto fica como está.
 */
const DATE = /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

export const EXCEL_DATE_FMT = "dd/mm/yyyy";
export const EXCEL_DATETIME_FMT = "dd/mm/yyyy hh:mm";

/** Devolve a data (em UTC, como o Excel grava) ou null se o texto não for uma data válida. */
export function excelDate(text: string): { value: Date; numFmt: string } | null {
  const m = DATE.exec(text.trim());
  if (!m) return null;
  const [d, mo, y, h, mi, s] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
  if (y < 1900 || y > 9999) return null;
  const value = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // 31/02, 25:00 etc. "rolam" para outro dia: não é data válida, fica texto.
  if (value.getUTCFullYear() !== y || value.getUTCMonth() !== mo - 1 || value.getUTCDate() !== d || value.getUTCHours() !== h || value.getUTCMinutes() !== mi) return null;
  return { value, numFmt: m[4] === undefined ? EXCEL_DATE_FMT : EXCEL_DATETIME_FMT };
}
