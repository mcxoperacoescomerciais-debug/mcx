import { redirect } from "next/navigation";
import { getScope, logout, requireRole, STAFF } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { inArray } from "drizzle-orm";
import { PanelShell } from "./_components/shell";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function PanelLayout({ children }: LayoutProps<"/painel">) {
  const user = await requireRole(STAFF);
  const scope = await getScope();
  let scopeNote: string | null = null;
  if (scope.brandIds !== null) {
    const db = await getDb();
    const rows = scope.brandIds.length ? await db.select({ name: s.brands.name }).from(s.brands).where(inArray(s.brands.id, scope.brandIds)) : [];
    scopeNote = rows.length ? `Acesso: ${rows.map((r) => r.name).join(", ")}` : "Sem marcas liberadas";
  } else if (scope.promoterIds !== null) {
    scopeNote = `Equipe: ${scope.promoterIds.length} promotor(es)`;
  }
  return (
    <PanelShell user={{ name: user.name, role: user.role }} agencyName={scope.agencyName} fullScope={scope.brandIds === null} scopeNote={scopeNote} logout={logoutAction}>
      {user.mustChangePassword ? (
        <div className="mb-5 rounded-xl bg-warn-bg text-warn px-4 py-3 text-[13.5px] font-medium flex flex-wrap items-center justify-between gap-2">
          Você está usando a senha inicial definida pelo administrador.
          <a href="/painel/senha" className="underline font-semibold">Trocar agora</a>
        </div>
      ) : null}
      {children}
    </PanelShell>
  );
}
