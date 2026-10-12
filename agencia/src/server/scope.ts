/**
 * Filtros de escopo reutilizados por todas as consultas do painel. Uma
 * consulta operacional SEMPRE combina: agência + promotores visíveis + marcas
 * visíveis. Lista vazia significa "nada" (sql false), nunca "tudo".
 */
import "server-only";
import { inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Scope } from "./auth";

export function brandFilter(scope: Scope, column: AnyPgColumn): SQL | undefined {
  if (scope.brandIds === null) return undefined;
  return scope.brandIds.length ? inArray(column, scope.brandIds) : sql`false`;
}

export function promoterFilter(scope: Scope, column: AnyPgColumn): SQL | undefined {
  if (scope.promoterIds === null) return undefined;
  return scope.promoterIds.length ? inArray(column, scope.promoterIds) : sql`false`;
}

export function canSeeBrand(scope: Scope, brandId: string): boolean {
  return scope.brandIds === null || scope.brandIds.includes(brandId);
}

export function canSeePromoter(scope: Scope, promoterId: string): boolean {
  return scope.promoterIds === null || scope.promoterIds.includes(promoterId);
}

export function isStaff(scope: Scope): boolean {
  return scope.role === "admin" || scope.role === "manager";
}
