import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { LoginForm } from "./forms";

export const metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(user.mustChangePassword ? "/senha" : "/");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-900 p-4">
      <div className="card w-full max-w-sm p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">MCX</p>
        <h1 className="mb-5 text-xl font-bold text-brand-900">Operações</h1>
        <LoginForm />
      </div>
    </main>
  );
}
