/**
 * Custo mensal do promotor para a folha: o que estiver no cadastro dele vale;
 * o que estiver vazio vem do padrão da agência. Encargos vazios = % sobre o
 * salário (só vínculo fixo; freelancer não tem encargos).
 */
import type { PromoterCostDefaults } from "./settings";

export interface PromoterCostInput {
  employment: "fixed" | "freelancer" | null;
  costSalary: number | null;
  costMeal: number | null;
  costFuel: number | null;
  costCharges: number | null;
  costOther: number | null;
}

export interface PromoterCost {
  salary: number;
  meal: number;
  fuel: number;
  charges: number;
  other: number;
  total: number;
  /** Encargos calculados pelo % (não digitados no cadastro). */
  chargesAuto: boolean;
  /** Campos que vieram do padrão da agência. */
  fromDefault: ("salary" | "meal" | "fuel" | "other")[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function promoterCost(u: PromoterCostInput, d: PromoterCostDefaults): PromoterCost {
  const fromDefault: PromoterCost["fromDefault"] = [];
  const pick = (own: number | null, def: number | null, k: PromoterCost["fromDefault"][number]) => {
    if (own !== null) return own;
    if (def !== null) fromDefault.push(k);
    return def ?? 0;
  };
  const salary = pick(u.costSalary, d.salary, "salary");
  const meal = pick(u.costMeal, d.meal, "meal");
  const fuel = pick(u.costFuel, d.fuel, "fuel");
  const other = pick(u.costOther, d.other, "other");
  const chargesAuto = u.costCharges === null;
  const charges = chargesAuto ? (u.employment === "freelancer" ? 0 : r2((salary * d.chargesPct) / 100)) : u.costCharges!;
  return { salary: r2(salary), meal: r2(meal), fuel: r2(fuel), charges: r2(charges), other: r2(other), total: r2(salary + meal + fuel + charges + other), chargesAuto, fromDefault };
}
