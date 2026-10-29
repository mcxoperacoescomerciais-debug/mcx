import { redirect } from "next/navigation";

/**
 * "Atendimentos por marca" saiu do menu: os atendimentos de cada marca estão em
 * Visitas (filtro de marca) e o relatório da marca em Exportações.
 */
export default async function BrandExecutionPage({ searchParams }: PageProps<"/painel/marcas">) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const k of ["brand", "from", "to", "chain", "city", "promoter"]) if (typeof sp[k] === "string") qs.set(k, sp[k] as string);
  redirect(`/painel/visitas${qs.size ? `?${qs}` : ""}`);
}
