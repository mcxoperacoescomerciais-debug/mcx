/**
 * Resumo do produto na etapa de estoque (três botões: ruptura, área de vendas, estoque)
 * e o preço único do produto no atendimento. Funções puras, usadas pela tela e pelos testes.
 */
type Stock = { state: string; quantity: number | null; unit?: string | null; price?: number | null };
type Validity = { productId: string; location: string; quantity: number; unit: string; price: number | null };
type Att = { stock: Record<string, Stock | undefined>; ruptures: Record<string, { productId: string }>; validities?: Record<string, Validity> };

const unitShort = (u: string | null | undefined) => (u === "cx" ? "CX" : "UN");

/** Um preço por produto: o da contagem; senão, o de alguma validade dele. */
export function productPrice(a: Att, productId: string): number | null {
  const own = a.stock[productId]?.price;
  if (own !== null && own !== undefined) return own;
  return Object.values(a.validities ?? {}).find((v) => v.productId === productId && v.price !== null)?.price ?? null;
}

/** Texto dos botões já preenchidos: "12 CX" na área de vendas, "3 CX + 2 UN" no estoque. */
export function stockSummary(a: Att, productId: string): { rupture: boolean; sales: string | null; stock: string | null } {
  const rupture = Object.values(a.ruptures).some((r) => r.productId === productId);
  const st = a.stock[productId];
  const counted = st && (st.state === "quantity" || st.state === "zero");
  const sales = !rupture && counted ? `${st.state === "zero" ? 0 : (st.quantity ?? 0)} ${unitShort(st.unit)}` : null;
  const byUnit = new Map<string, number>();
  for (const v of Object.values(a.validities ?? {})) if (v.productId === productId && v.location === "stock") byUnit.set(unitShort(v.unit), (byUnit.get(unitShort(v.unit)) ?? 0) + v.quantity);
  const stock = byUnit.size ? [...byUnit].sort(([x], [y]) => x.localeCompare(y)).map(([u, n]) => `${n} ${u}`).join(" + ") : null;
  return { rupture, sales, stock };
}
