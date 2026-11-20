import { redirect } from "next/navigation";
import { getSessionUser, MIN_PASSWORD } from "@/server/auth";
import { PasswordForm } from "../entrar/forms";

export const metadata = { title: "Senha" };

export default async function PasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-900 p-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-xl font-bold text-brand-900">{user.mustChangePassword ? "Crie a sua senha" : "Trocar senha"}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">
          {user.mustChangePassword ? `Olá, ${user.name}. No primeiro acesso é preciso trocar a senha inicial.` : "A troca encerra as sessões abertas em outros aparelhos."}
        </p>
        <PasswordForm minLength={MIN_PASSWORD} />
      </div>
    </main>
  );
}
