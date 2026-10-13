import { redirect } from "next/navigation";
import { activeAgencyId, getScope, logout, requireRole, STAFF } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { asc, eq, inArray } from "drizzle-orm";
import { PanelShell } from "./_components/shell";
import { enterAgencyAction, leaveAgencyAction } from "./mcx/actions";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function PanelLayout({ children }: LayoutProps<"/painel">) {
  const user = await requireRole(STAFF);
  const db = await getDb();
  // Equipe MCX: pode estar sem agência escolhida (visão MCX) ou dentro de uma.
  const agencyId = await activeAgencyId(user);
  const scope = agencyId ? await getScope() : null;
  const agencies = user.platform
    ? await db.select({ id: s.agencies.id, name: s.agencies.name, status: s.agencies.status }).from(s.agencies).where(eq(s.agencies.kind, "client")).orderBy(asc(s.agencies.name))
    : [];

  let scopeNote: string | null = null;
  if (scope?.brandIds) {
    const rows = scope.brandIds.length ? await db.select({ name: s.brands.name }).from(s.brands).where(inArray(s.brands.id, scope.brandIds)) : [];
    scopeNote = rows.length ? `Acesso: ${rows.map((r) => r.name).join(", ")}` : "Sem marcas liberadas";
  } else if (scope?.promoterIds) {
    scopeNote = `Equipe: ${scope.promoterIds.length} promotor(es)`;
  }
  return (
    <PanelShell
      user={{ name: user.name, role: user.role }}
      agency={scope ? { id: scope.agencyId, name: scope.agencyName, logoUrl: scope.agencyLogoUrl } : null}
      platform={user.platform ? { agencies, enter: enterAgencyAction, leave: leaveAgencyAction } : null}
      fullScope={scope ? scope.brandIds === null : true}
      scopeNote={user.platform ? "Equipe MCX" : scopeNote}
      logout={logoutAction}
    >
      {children}
    </PanelShell>
  );
}
