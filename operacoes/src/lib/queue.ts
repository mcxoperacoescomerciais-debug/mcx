/**
 * "Minha fila": atrasadas → hoje → cobrar hoje → próximas → aguardando.
 * Atraso é calculado na consulta (prazo < hoje e demanda aberta), sem job.
 */
import { PRIORITY_RANK, type Priority, type Status } from "./domain";

export interface QueueItem {
  status: Status;
  priority: Priority;
  dueDate: string | null;
  followUpDate: string | null;
}

export type QueueGroup = "overdue" | "today" | "followup" | "next" | "waiting";
export const QUEUE_GROUPS: QueueGroup[] = ["overdue", "today", "followup", "next", "waiting"];
export const QUEUE_LABEL: Record<QueueGroup, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  followup: "Cobrar hoje",
  next: "Próximas",
  waiting: "Aguardando retorno",
};

export function isOverdue(d: Pick<QueueItem, "status" | "dueDate">, today: string): boolean {
  return d.status !== "done" && d.status !== "cancelled" && !!d.dueDate && d.dueDate < today;
}

export function queueGroup(d: QueueItem, today: string): QueueGroup | null {
  if (d.status === "done" || d.status === "cancelled") return null;
  if (d.status === "waiting") return d.followUpDate && d.followUpDate <= today ? "followup" : "waiting";
  if (d.dueDate && d.dueDate < today) return "overdue";
  if (d.dueDate === today) return "today";
  return "next";
}

function compare(a: QueueItem, b: QueueItem): number {
  const da = a.status === "waiting" ? a.followUpDate : a.dueDate;
  const db = b.status === "waiting" ? b.followUpDate : b.dueDate;
  if (da !== db) return (da ?? "9999") < (db ?? "9999") ? -1 : 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

export function buildQueue<T extends QueueItem>(items: T[], today: string): { group: QueueGroup; items: T[] }[] {
  const buckets = new Map<QueueGroup, T[]>(QUEUE_GROUPS.map((g) => [g, []]));
  for (const item of items) {
    const g = queueGroup(item, today);
    if (g) buckets.get(g)!.push(item);
  }
  return QUEUE_GROUPS.map((group) => ({ group, items: buckets.get(group)!.sort(compare) })).filter((b) => b.items.length);
}
