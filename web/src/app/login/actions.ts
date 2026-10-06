"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/server/auth";
import { homeForRole } from "@/lib/session-token";

export interface LoginState {
  error?: string;
  username?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "Informe usuário e senha.", username };
  const result = await login(username, password);
  if (!result.ok) return { error: result.error, username };
  redirect(homeForRole(result.role));
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
