"use server";

import { revalidatePath } from "next/cache";
import { getScope } from "@/server/auth";
import { saveSettings } from "@/server/admin";
import type { FormState } from "../actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** "25/12/2026", "25/12/26" ou "2026-12-25" → AAAA-MM-DD; inválida → null. */
function parseHoliday(t: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(t);
  const [y, m, d] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : br ? [Number(br[3].length === 2 ? `20${br[3]}` : br[3]), Number(br[2]), Number(br[1])] : [0, 0, 0];
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const out = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return new Date(`${out}T12:00:00Z`).toISOString().slice(0, 10) === out ? out : null;
}

/** Valor por visita válida e feriados do relatório mensal. */
export async function saveMonthlyParamsAction(_: FormState, fd: FormData): Promise<FormState> {
  const scope = await getScope();
  if (scope.role !== "admin") return { ok: false, error: "Somente administradores." };
  const lines = str(fd, "holidays")
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const holidays = lines.map(parseHoliday);
  const bad = lines.filter((_, i) => !holidays[i]);
  if (bad.length) return { ok: false, error: `Data inválida: ${bad.slice(0, 3).join(", ")}. Use dd/mm/aaaa, uma por linha.` };
  const raw = str(fd, "visitValue").replace(/[R$\s]/g, "");
  const value = raw ? Number(raw.includes(",") ? raw.split(".").join("").replace(",", ".") : raw) : null;
  if (value !== null && !(Number.isFinite(value) && value >= 0)) return { ok: false, error: "Valor por visita inválido." };
  const r = await saveSettings(scope, { holidays: holidays as string[], visitValue: value });
  if (r.ok) revalidatePath("/painel/sistematica");
  return r.ok ? { ok: true, message: "Parâmetros salvos." } : r;
}
