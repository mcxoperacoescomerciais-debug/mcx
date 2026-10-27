/**
 * Tempo de trabalho do promotor a partir das visitas (início e fim registrados
 * no aparelho). Funções puras: painel e testes.
 *
 * - Tempo em loja: fim − início de cada visita encerrada (a aberta de hoje conta até agora).
 * - Deslocamento: início da visita seguinte − fim da anterior, no mesmo dia.
 * - Horas trabalhadas no dia: da primeira entrada ao fim da última loja (jornada)
 *   e, separado, a soma do tempo dentro das lojas.
 * Visita de dia anterior que ficou aberta (promotor esqueceu de encerrar) não
 * entra nas horas: aparece como pendência.
 */
import { minutesOfDay } from "./dates";

export interface WorkVisit {
  promoterId: string;
  date: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: string;
}

export interface Stat {
  avg: number | null;
  min: number | null;
  max: number | null;
  n: number;
}

export interface WorkDay {
  date: string;
  visits: number;
  /** Minutos do dia (fuso da operação) da primeira entrada e do fim da última loja. */
  firstStart: number | null;
  lastEnd: number | null;
  /** Soma do tempo dentro das lojas (min). */
  storeMinutes: number;
  /** Da primeira entrada ao fim da última loja (min). */
  shiftMinutes: number;
  travelMinutes: number;
  avgStore: number | null;
  avgTravel: number | null;
  openForgotten: number;
}

export interface WorkSummary {
  days: WorkDay[];
  storeMinutes: number;
  shiftMinutes: number;
  store: Stat;
  travel: Stat;
  start: Stat;
  end: Stat;
  shift: Stat;
  openForgotten: number;
}

const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

export function stat(values: number[]): Stat {
  if (!values.length) return { avg: null, min: null, max: null, n: 0 };
  return { avg: Math.round(values.reduce((t, v) => t + v, 0) / values.length), min: Math.min(...values), max: Math.max(...values), n: values.length };
}

export function workSummary(visits: WorkVisit[], today: string, now: Date = new Date()): WorkSummary {
  const byDay = new Map<string, WorkVisit[]>();
  for (const v of visits) {
    if (v.status === "cancelled") continue;
    byDay.set(v.date, [...(byDay.get(v.date) ?? []), v]);
  }
  const days: WorkDay[] = [];
  const storeDurations: number[] = [];
  const travelGaps: number[] = [];
  for (const [date, list] of [...byDay].sort(([a], [b]) => b.localeCompare(a))) {
    list.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
    let storeMinutes = 0;
    let openForgotten = 0;
    const durations: number[] = [];
    const gaps: number[] = [];
    let lastEndAt: Date | null = null;
    let prevEnd: Date | null = null;
    for (const v of list) {
      const end = v.finishedAt ?? (date === today ? now : null);
      if (!v.finishedAt && date !== today) openForgotten++;
      if (prevEnd) {
        const gap = minutesBetween(prevEnd, v.startedAt);
        if (v.startedAt >= prevEnd) gaps.push(gap);
      }
      if (end) {
        const d = minutesBetween(v.startedAt, end);
        storeMinutes += d;
        if (v.finishedAt) durations.push(d);
        prevEnd = end;
        if (!lastEndAt || end > lastEndAt) lastEndAt = end;
      } else prevEnd = null;
    }
    const first = list[0].startedAt;
    const shiftMinutes = lastEndAt ? minutesBetween(first, lastEndAt) : 0;
    storeDurations.push(...durations);
    travelGaps.push(...gaps);
    days.push({
      date,
      visits: list.length,
      firstStart: minutesOfDay(first),
      lastEnd: lastEndAt && list.some((v) => v.finishedAt) ? minutesOfDay(lastEndAt) : null,
      storeMinutes,
      shiftMinutes,
      travelMinutes: gaps.reduce((t, g) => t + g, 0),
      avgStore: stat(durations).avg,
      avgTravel: stat(gaps).avg,
      openForgotten,
    });
  }
  return {
    days,
    storeMinutes: days.reduce((t, d) => t + d.storeMinutes, 0),
    shiftMinutes: days.reduce((t, d) => t + d.shiftMinutes, 0),
    store: stat(storeDurations),
    travel: stat(travelGaps),
    start: stat(days.map((d) => d.firstStart).filter((x): x is number => x !== null)),
    end: stat(days.map((d) => d.lastEnd).filter((x): x is number => x !== null)),
    shift: stat(days.filter((d) => d.shiftMinutes > 0).map((d) => d.shiftMinutes)),
    openForgotten: days.reduce((t, d) => t + d.openForgotten, 0),
  };
}

/** 135 → "2h15"; 40 → "40 min". */
export function fmtMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

/** Minutos do dia → "07:45". */
export function fmtClock(m: number | null | undefined): string {
  if (m === null || m === undefined) return "—";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
