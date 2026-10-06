import { eq } from "drizzle-orm";
import { getScope, MANAGER_ROLES, requireRole, STAFF_ROLES } from "@/server/auth";
import { getDb, schema as s } from "@/server/db";
import { logoutAction } from "../login/actions";
import { PanelShell } from "./_components/shell";
import { OccurrenceDrawerProvider } from "./_components/occurrence-drawer";

export default async function PanelLayout({ children }: LayoutProps<"/painel">) {
  const user = await requireRole(MANAGER_ROLES);
  const scope = await getScope();
  const db = await getDb();
  const [client] = await db.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, scope.clientId));
  return (
    <PanelShell user={{ name: user.name, role: user.role }} clientName={client?.name ?? ""} logout={logoutAction}>
      <OccurrenceDrawerProvider canManage={STAFF_ROLES.includes(user.role)}>{children}</OccurrenceDrawerProvider>
    </PanelShell>
  );
}
