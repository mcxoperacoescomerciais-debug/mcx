"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2, WifiOff } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { useOnline } from "@/components/use-online";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const online = useOnline();
  const input =
    "w-full h-12 rounded-xl border border-line-strong px-4 text-base bg-surface focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100";

  return (
    <form action={action} className="bg-surface rounded-2xl p-6 shadow-[var(--shadow-pop)] space-y-4">
      <h1 className="text-lg font-semibold text-ink">Entrar</h1>
      <div>
        <label htmlFor="username" className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          Usuário
        </label>
        <input id="username" name="username" defaultValue={state.username} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className={input} />
      </div>
      <div>
        <label htmlFor="password" className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          Senha
        </label>
        <div className="relative">
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className={input + " pr-12"} />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-1 top-1 size-10 grid place-items-center text-muted rounded-lg hover:bg-black/[0.04]"
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
          >
            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </div>
      {!online ? (
        <p className="flex items-center gap-2 text-sm text-warn bg-warn-bg rounded-lg px-3 py-2">
          <WifiOff className="size-4 shrink-0" /> Sem internet. O login precisa de conexão (depois, o app funciona sem sinal).
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-bad bg-bad-bg rounded-lg px-3 py-2">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-xl bg-brand-800 text-white font-semibold text-[15px] hover:bg-brand-700 disabled:opacity-70 inline-flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        Entrar
      </button>
    </form>
  );
}
