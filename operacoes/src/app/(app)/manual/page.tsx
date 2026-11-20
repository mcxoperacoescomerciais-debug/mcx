import { PageHeader } from "@/components/ui";
import { addDays, todayIso } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { CAPABILITY_GROUPS, capabilitiesFor, LIMITS } from "@/server/capabilities";
import { ManualSearch } from "./search";

export const metadata = { title: "Manual" };

export default async function ManualPage() {
  const user = await requireUser();
  const mine = capabilitiesFor(user.role);
  const recent = addDays(todayIso(), -30);
  const groups = CAPABILITY_GROUPS.map((group) => ({
    group,
    limits: LIMITS[group] ?? [],
    items: mine.filter((c) => c.group === group).map((c) => ({ id: c.id, title: c.title, description: c.description, examples: c.examples, isNew: c.since >= recent })),
  })).filter((g) => g.items.length || g.limits.length);
  return (
    <>
      <PageHeader title="O que posso pedir?" subtitle="O que o sistema faz hoje, com exemplos — e o que ainda não faz. Esta página se atualiza sozinha a cada função nova." />
      <ManualSearch groups={groups} />
    </>
  );
}
