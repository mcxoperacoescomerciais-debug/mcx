import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getScope } from "@/server/auth";
import { canManageTastings, tastingFormOptions } from "@/server/tastings";
import { isIsoDate, todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { DegTabs } from "../_components/deg-tabs";
import { TastingForm } from "../_components/tasting-form";

export const metadata: Metadata = { title: "Nova degustação" };

export default async function NewTasting({ searchParams }: PageProps<"/painel/degustacoes/nova">) {
  const scope = await getScope();
  if (!canManageTastings(scope)) notFound();
  const sp = await searchParams;
  const date = typeof sp.data === "string" && isIsoDate(sp.data) ? sp.data : todayIso();
  const opts = await tastingFormOptions(scope);
  return (
    <>
      <DegTabs />
      <PageHeader noExport title="Nova degustação" subtitle="Cadastre o evento com o que a marca enviou; o que faltar pode ficar pendente." />
      <TastingForm
        brands={opts.brands}
        stores={opts.stores}
        users={opts.users}
        initial={{
          brandId: "",
          storeId: null,
          chainName: null,
          storeName: "",
          city: "",
          state: "MG",
          date,
          startTime: null,
          endTime: null,
          product: null,
          description: null,
          materialsNote: null,
          notes: null,
          responsibleId: scope.platform ? null : scope.userId,
          orderRef: null,
          actionCode: null,
          billingTerms: null,
          brandPaymentDue: null,
          tasterPaymentDue: null,
          photoProof: false,
          requiredEvidence: null,
          revenue: null,
          taxes: null,
          tasterFee: null,
          transport: null,
          food: null,
          materialsCost: null,
          otherCost: null,
        }}
      />
    </>
  );
}
