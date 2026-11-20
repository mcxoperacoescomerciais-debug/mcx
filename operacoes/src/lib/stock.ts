/** Estoque de materiais dos clientes: vocabulário e cálculos puros (sem banco). */

export const STOCK_CATEGORIES = ["product", "disposable", "pdv", "equipment"] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];
export const STOCK_CATEGORY_LABEL: Record<StockCategory, string> = { product: "Produto", disposable: "Descartável", pdv: "Material de PDV", equipment: "Equipamento" };

export const STOCK_UNITS = ["un", "pct", "cx", "kg", "L"] as const;

export const MOVEMENT_KINDS = ["in", "out", "return", "adjust", "loss"] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];
export const MOVEMENT_LABEL: Record<MovementKind, string> = { in: "Entrada", out: "Saída", return: "Devolução", adjust: "Ajuste de inventário", loss: "Perda/Vencido" };

export const UNIT_STATUSES = ["available", "in_use", "maintenance"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = { available: "Disponível", in_use: "Em uso", maintenance: "Manutenção" };

/** Lotes que vencem em até N dias geram alerta. */
export const EXPIRY_ALERT_DAYS = 30;

export interface Move {
  kind: MovementKind;
  delta: number;
  day: string;
  lot: string | null;
  expiresOn: string | null;
  counterpart?: string | null;
  city?: string | null;
}

export const balanceOf = (moves: { delta: number }[]) => moves.reduce((sum, m) => sum + m.delta, 0);

export interface LotBalance {
  lot: string | null;
  expiresOn: string | null;
  quantity: number;
}

/** Saldo por lote/validade (só o que ainda tem saldo), do que vence primeiro para o que vence depois. */
export function lotBalances(moves: Move[]): LotBalance[] {
  const map = new Map<string, LotBalance>();
  for (const m of moves) {
    const key = `${m.lot ?? ""}|${m.expiresOn ?? ""}`;
    const cur = map.get(key) ?? { lot: m.lot, expiresOn: m.expiresOn, quantity: 0 };
    cur.quantity += m.delta;
    map.set(key, cur);
  }
  return [...map.values()].filter((l) => l.quantity > 0).sort((a, b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999") || (a.lot ?? "").localeCompare(b.lot ?? ""));
}

/**
 * FEFO: consome primeiro o lote que vence antes. Devolve de quais lotes sair e
 * quanto faltou (shortfall > 0 = não há saldo suficiente).
 */
export function fefo(lots: LotBalance[], quantity: number): { picks: LotBalance[]; shortfall: number } {
  let left = quantity;
  const picks: LotBalance[] = [];
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(lot.quantity, left);
    if (take > 0) picks.push({ lot: lot.lot, expiresOn: lot.expiresOn, quantity: take });
    left -= take;
  }
  return { picks, shortfall: Math.max(0, left) };
}

/** Lotes com saldo que vencem até `limit` (inclui os já vencidos). */
export function expiringLots(lots: LotBalance[], limit: string): LotBalance[] {
  return lots.filter((l) => l.expiresOn && l.expiresOn <= limit);
}

/** Extrato: cada movimentação com o saldo acumulado (ordem cronológica). */
export function statement<T extends { delta: number }>(moves: T[]): (T & { balance: number })[] {
  let balance = 0;
  return moves.map((m) => ({ ...m, balance: (balance += m.delta) }));
}

export interface MonthSummary {
  opening: number;
  entries: number;
  outputs: number;
  returns: number;
  losses: number;
  adjustments: number;
  closing: number;
  /** Saídas por destino (ação/cidade), em quantidade positiva. */
  byDestination: { destination: string; quantity: number }[];
}

/** Prestação de contas do mês: saldo inicial, entradas, saídas por destino, perdas e saldo final. */
export function monthSummary(moves: Move[], from: string, to: string): MonthSummary {
  const s: MonthSummary = { opening: 0, entries: 0, outputs: 0, returns: 0, losses: 0, adjustments: 0, closing: 0, byDestination: [] };
  const dest = new Map<string, number>();
  for (const m of moves) {
    if (m.day < from) s.opening += m.delta;
    else if (m.day <= to) {
      if (m.kind === "in") s.entries += m.delta;
      else if (m.kind === "out") {
        s.outputs += -m.delta;
        const key = [m.counterpart, m.city].filter(Boolean).join(" — ") || "Sem destino informado";
        dest.set(key, (dest.get(key) ?? 0) + -m.delta);
      } else if (m.kind === "return") s.returns += m.delta;
      else if (m.kind === "loss") s.losses += -m.delta;
      else s.adjustments += m.delta;
    }
  }
  s.closing = s.opening + s.entries - s.outputs + s.returns - s.losses + s.adjustments;
  s.byDestination = [...dest.entries()].map(([destination, quantity]) => ({ destination, quantity })).sort((a, b) => b.quantity - a.quantity);
  return s;
}

export const formatQty = (n: number, unit: string) => `${n.toLocaleString("pt-BR")} ${unit}`;
