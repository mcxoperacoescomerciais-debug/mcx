import { PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { requireCan } from "@/server/auth";
import { listUsers } from "@/server/registry";
import { NewUser, UserRow } from "../forms";

export const metadata = { title: "Usuários" };

export default async function UsersPage() {
  const user = await requireCan("user.manage");
  const users = await listUsers(user);
  return (
    <>
      <PageHeader title="Usuários" subtitle="Dono: tudo. Gestor: todas as demandas e cadastros. Operacional: só as próprias demandas e as compartilhadas." />
      <ul className="mb-6 max-w-3xl space-y-3">
        {users.map((u) => (
          <UserRow key={u.id} self={u.id === user.id} user={{ id: u.id, name: u.name, username: u.username, role: u.role, status: u.status, lastLogin: u.lastLoginAt ? formatDateTime(u.lastLoginAt) : null, mustChangePassword: u.mustChangePassword, weeklyHours: u.weeklyHours, costPerHourCents: u.costPerHourCents }} />
        ))}
      </ul>
      <section className="card max-w-3xl p-4" aria-labelledby="novo-user">
        <h2 id="novo-user" className="mb-3 text-sm font-bold text-ink-2">Nova pessoa</h2>
        <NewUser />
      </section>
    </>
  );
}
