import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getScope } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { isUuid } from "@/lib/filters";

/** A ruptura não tem mais tratamento próprio (modo SUINCO): abre o atendimento onde foi registrada. */
export default async function RuptureRedirect({ params }: PageProps<"/painel/rupturas/[id]">) {
  const scope = await getScope();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const db = await getDb();
  const [r] = await db.select({ attendanceId: s.ruptures.attendanceId }).from(s.ruptures).where(and(eq(s.ruptures.id, id), eq(s.ruptures.agencyId, scope.agencyId)));
  if (!r) notFound();
  redirect(`/painel/atendimentos/${r.attendanceId}`);
}
