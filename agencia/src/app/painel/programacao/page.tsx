import { redirect } from "next/navigation";

/**
 * A Programação saiu do menu: as lojas de cada dia (previstas pelo quadro da
 * semana do promotor) e o que aconteceu em cada uma estão em Visitas.
 */
export default async function SchedulePage({ searchParams }: PageProps<"/painel/programacao">) {
  const sp = await searchParams;
  const date = typeof sp.date === "string" ? sp.date : null;
  redirect(date ? `/painel/visitas?from=${date}&to=${date}` : "/painel/visitas");
}
