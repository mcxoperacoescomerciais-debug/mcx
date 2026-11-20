"use client";
import { useActionState } from "react";
import { changePasswordAction, loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="username">Usuário</label>
        <input id="username" name="username" className="field" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" className="field" autoComplete="current-password" required />
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}

export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changePasswordAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="current">Senha atual</label>
        <input id="current" name="current" type="password" className="field" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="next">Senha nova (mínimo {minLength} caracteres)</label>
        <input id="next" name="next" type="password" className="field" autoComplete="new-password" minLength={minLength} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Repita a senha nova</label>
        <input id="confirm" name="confirm" type="password" className="field" autoComplete="new-password" minLength={minLength} required />
      </div>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Salvando…" : "Salvar senha"}</button>
    </form>
  );
}
