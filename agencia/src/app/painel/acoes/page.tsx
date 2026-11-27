import type { Metadata } from "next";
import { getScope } from "@/server/auth";
import { ActionsDashboard } from "./dashboard";

export const metadata: Metadata = { title: "Painel de ações" };

export default async function ActionsPage({ searchParams }: PageProps<"/painel/acoes">) {
  const scope = await getScope();
  return <ActionsDashboard scope={scope} sp={await searchParams} />;
}
