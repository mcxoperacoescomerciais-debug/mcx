import { redirect } from "next/navigation";

/** O antigo "Monitoramento das lojas" agora é o relatório de Visitas. */
export default async function StoresRedirect({ searchParams }: PageProps<"/painel/lojas">) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  redirect(`/painel/visitas${qs.size ? `?${qs}` : ""}`);
}
