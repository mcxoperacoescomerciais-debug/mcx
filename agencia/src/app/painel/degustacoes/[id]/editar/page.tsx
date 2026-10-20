import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canManageTastings, getTasting, tastingFormOptions } from "@/server/tastings";
import { isUuid } from "@/lib/filters";
import { PageHeader } from "@/components/ui";
import { DegTabs } from "../../_components/deg-tabs";
import { TastingForm } from "../../_components/tasting-form";

export const metadata: Metadata = { title: "Editar degustação" };

export default async function EditTasting({ params }: PageProps<"/painel/degustacoes/[id]/editar">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const scope = await getScope();
  if (!canManageTastings(scope)) notFound();
  const [d, opts] = await Promise.all([getTasting(scope, id), tastingFormOptions(scope)]);
  if (!d) notFound();
  const t = d.tasting;
  return (
    <>
      <DegTabs />
      <PageHeader title="Editar degustação" subtitle={`${d.brand.name} · ${t.storeName}`} />
      <TastingForm brands={opts.brands} stores={opts.stores} users={opts.users} initial={{ ...t, id: t.id }} />
    </>
  );
}
