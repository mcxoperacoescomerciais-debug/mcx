/**
 * Progresso da carteira da semana NO APARELHO (funciona sem sinal): junta o que
 * o servidor já confirmou com os atendimentos finalizados neste celular.
 */
import { useMemo } from "react";
import { todayIso } from "@/lib/dates";
import { periodWindow, targetStatus, weekEnd, weekStart, weekTotals, type TargetPeriod, type TargetStatus, type WeekTotals } from "@/lib/portfolio";
import { useLocal } from "./hooks";

export interface PortfolioBrandRow {
  brandId: string;
  /** Vezes por período. */
  perWeek: number;
  period: TargetPeriod;
  done: number;
  status: TargetStatus;
}

export interface PortfolioStore {
  storeId: string;
  rows: PortfolioBrandRow[];
  perWeek: number;
  counted: number;
  complete: boolean;
  behind: boolean;
}

export interface PortfolioProgress {
  weekStart: string;
  weekEnd: string;
  today: string;
  stores: PortfolioStore[];
  totals: WeekTotals;
}

export function usePortfolio(): PortfolioProgress | null {
  const local = useLocal();
  const p = local.bootstrap?.portfolio ?? null;
  return useMemo(() => {
    if (!p) return null;
    const today = todayIso();
    const from = weekStart(today);
    const to = weekEnd(today);
    // Atendimentos finalizados neste celular (com a data), por loja × marca.
    const localDone = new Map<string, { id: string; date: string }[]>();
    for (const v of Object.values(local.visits)) {
      if (v.status === "cancelled") continue;
      for (const a of Object.values(v.attendances)) {
        if (a.status !== "completed" && a.status !== "correction_requested") continue;
        const key = `${v.storeId}:${a.brandId}`;
        localDone.set(key, [...(localDone.get(key) ?? []), { id: a.id, date: v.visitDate }]);
      }
    }
    const byStore = new Map<string, PortfolioBrandRow[]>();
    for (const t of p.targets) {
      const period = t.period ?? "week";
      const w = periodWindow(today, period);
      // Virou o período sem sinal: o que o servidor contou era do período anterior.
      const serverValid = (t.windowFrom ?? p.weekStart) === w.from;
      const mine = (localDone.get(`${t.storeId}:${t.brandId}`) ?? []).filter((x) => x.date >= w.from && x.date <= w.to).map((x) => x.id);
      const ids = new Set([...(serverValid ? t.doneAttendanceIds : []), ...mine]);
      const row = { brandId: t.brandId, perWeek: t.perWeek, period, done: ids.size, status: targetStatus(t.perWeek, ids.size, today, period) };
      byStore.set(t.storeId, [...(byStore.get(t.storeId) ?? []), row]);
    }
    const stores: PortfolioStore[] = [...byStore.entries()].map(([storeId, rows]) => ({
      storeId,
      rows,
      perWeek: rows.reduce((n, r) => n + r.perWeek, 0),
      counted: rows.reduce((n, r) => n + Math.min(r.done, r.perWeek), 0),
      complete: rows.every((r) => r.status === "done"),
      behind: rows.some((r) => r.status === "behind"),
    }));
    // Mais atrasadas primeiro; completas por último.
    stores.sort((a, b) => Number(a.complete) - Number(b.complete) || Number(b.behind) - Number(a.behind) || b.perWeek - b.counted - (a.perWeek - a.counted));
    return { weekStart: from, weekEnd: to, today, stores, totals: weekTotals(stores.flatMap((s) => s.rows), today) };
  }, [p, local.visits]);
}
