import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicScope } from "@/server/scope-forms";
import { ScopeHeader, ScopeIntro, ScopeSummary } from "@/components/scope-view";
import { ScopeAnswerForm } from "./answer-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/escopo/[token]">): Promise<Metadata> {
  const found = await getPublicScope((await params).token);
  return {
    title: { absolute: found ? `${found.form.title} · ${found.form.clientName} · MCX` : "Escopo · MCX" },
    robots: { index: false, follow: false },
  };
}

/** Página que o cliente abre pelo link: responde o checklist ou vê o escopo já confirmado. */
export default async function ScopePage({ params }: PageProps<"/escopo/[token]">) {
  const { token } = await params;
  const found = await getPublicScope(token);
  if (!found) notFound();
  const { form, current } = found;

  return (
    <div className="min-h-svh bg-[#f5f4f1] text-[#16203a] print:bg-white">
      <ScopeHeader siteUrl={process.env.MCX_SITE_URL?.trim() || null} />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        <ScopeIntro clientName={form.clientName} title={current?.snapshot.title ?? form.title} intro={current?.snapshot.intro ?? form.intro} details={current?.snapshot.details ?? form.details} />
        {current ? (
          <ScopeSummary response={current} />
        ) : (
          <ScopeAnswerForm token={token} sections={form.sections} closingText={form.closingText} />
        )}
      </main>
    </div>
  );
}
