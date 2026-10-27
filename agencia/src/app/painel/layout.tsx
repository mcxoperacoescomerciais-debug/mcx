import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { effectivePermissions, PANELS, panelForPath } from "@/lib/permissions";
import { activeAgencyId, getScope, logout, requireRole, STAFF } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { countImprovementsToReview } from "@/server/improvements";
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
  // Perfis: a equipe MCX vê tudo; gestor e supervisor, só os painéis liberados.
  const allowed = user.platform ? null : effectivePermissions(user.role, user.permissions);
  const pathname = (await headers()).get("x-pathname") ?? "";
  const panel = panelForPath(pathname);
  if (allowed && panel && !allowed.has(panel.key)) {
    const first = PANELS.find((p) => allowed.has(p.key));
    redirect(first && first.key !== panel.key ? first.paths[0] : "/painel/senha");
  }
  // Equipe MCX: pode estar sem agência escolhida (visão MCX) ou dentro de uma.
  const agencyId = await activeAgencyId(user);
  const scope = agencyId ? await getScope() : null;
  const agencies = user.platform
    ? await db.select({ id: s.agencies.id, name: s.agencies.name, status: s.agencies.status }).from(s.agencies).where(eq(s.agencies.kind, "client")).orderBy(asc(s.agencies.name))
    : [];
  const improvementsToReview = await countImprovementsToReview(user);

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
      platform={user.platform ? { agencies, improvementsToReview, enter: enterAgencyAction, leave: leaveAgencyAction } : null}
      fullScope={scope ? scope.brandIds === null : true}
      allowed={allowed ? [...allowed] : null}
      owner={user.platformRole === "owner"}
      scopeNote={user.platform ? "Equipe MCX" : scopeNote}
      logout={logoutAction}
    >
      {children}
    </PanelShell>
  );
}
