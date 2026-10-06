"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="bg-surface rounded-2xl p-6 shadow-[var(--shadow-pop)] space-y-4">
      <div>
        <label htmlFor="username" className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          Usuário
        </label>
        <input
          id="username"
          name="username"
          defaultValue={state.username}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className="w-full h-12 rounded-xl border border-line-strong px-4 text-base bg-surface focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          Senha
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="w-full h-12 rounded-xl border border-line-strong pl-4 pr-12 text-base bg-surface focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1 size-10 grid place-items-center text-muted rounded-lg hover:bg-navy-50"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-[#B42318] bg-[#FDECEC] rounded-lg px-3 py-2">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-xl bg-navy-900 text-white font-semibold text-[15px] hover:bg-navy-800 disabled:opacity-70 inline-flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        Entrar
      </button>
    </form>
  );
}
