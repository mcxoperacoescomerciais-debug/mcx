"use server";
/** Únicas actions sem actionUser(): entrar e trocar a própria senha (primeiro acesso). */
import { redirect } from "next/navigation";
import { changeOwnPassword, getSessionUser, login } from "@/server/auth";

export async function loginAction(_: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const result = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!result.ok) return { error: result.error };
  redirect("/");
}

export async function changePasswordAction(_: { error: string } | null, form: FormData): Promise<{ error: string } | null> {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "A confirmação não confere com a senha nova." };
  const result = await changeOwnPassword(user.id, String(form.get("current") ?? ""), next);
  if (!result.ok) return { error: result.error };
  redirect("/");
}
