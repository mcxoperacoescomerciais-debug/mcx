import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canManageTastings } from "@/server/tastings";
import { PageHeader } from "@/components/ui";
import { SectionCard } from "../../../_components/widgets";
import { DegTabs } from "../../_components/deg-tabs";
import { TasterForm } from "../../_components/taster-form";

export const metadata: Metadata = { title: "Nova degustadora" };

export default async function NewTaster() {
  const scope = await getScope();
  if (!canManageTastings(scope)) notFound();
  return (
    <>
      <DegTabs />
      <PageHeader title="Nova degustadora" />
      <SectionCard title="Cadastro" bodyClass="px-5 pb-5">
        <TasterForm v={{ name: "", phone: null, city: "", state: "MG", region: null, area: null, availability: null, experience: null, usualFee: null, notes: null, status: "active" }} />
      </SectionCard>
    </>
  );
}
