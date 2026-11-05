import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { isUuid } from "@/lib/filters";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { canSeeBrand } from "@/server/scope";
import { ExecutiveOverview } from "../../_components/executive-overview";

export const metadata: Metadata = { title: "Painel da marca" };

/**
 * Painel da marca: a visão executiva (ruptura, datas críticas, avarias, lojas
 * não atendidas) só desta marca — para mostrar à marca ou acompanhar uma conta.
 */
export default async function BrandPanelPage({ params, searchParams }: PageProps<"/painel/marca/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  if (!canSeeBrand(scope, id)) notFound();
  const db = await getDb();
  const [brand] = await db.select({ id: s.brands.id, name: s.brands.name }).from(s.brands).where(and(eq(s.brands.id, id), eq(s.brands.agencyId, scope.agencyId)));
  if (!brand) notFound();
  return <ExecutiveOverview scope={scope} sp={await searchParams} brand={brand} />;
}
