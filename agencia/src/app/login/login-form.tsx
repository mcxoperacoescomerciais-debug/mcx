"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, UserRound, WifiOff } from "lucide-react";
import { loginAction, type LoginState } from "./actions";
import { useOnline } from "@/components/use-online";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const online = useOnline();
  const input =
    "w-full h-12 rounded-xl border border-line bg-subtle pl-11 pr-4 text-base text-ink placeholder:text-muted/60 transition-colors focus:bg-surface focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-100";
  const icon = "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-[18px] text-muted";

  return (
    <form action={action} className="bg-surface rounded-[22px] px-6 pt-7 pb-6 shadow-[0_24px_60px_rgb(0_0_0/0.35)] ring-1 ring-black/5 space-y-4">
      <div className="mb-2">
        <h2 className="text-[19px] font-semibold tracking-tight text-ink">Acesse sua conta</h2>
        <p className="text-[13px] text-muted mt-1">Promotores, gestores e equipe da agência.</p>
      </div>
      <div>
        <label htmlFor="username" className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          Usuário
        </label>
        <div className="relative">
          <UserRound className={icon} aria-hidden />
          <input id="username" name="username" defaultValue={state.username} placeholder="ex.: agencia.nome" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="password" className="block text-[13px] font-semibold text-ink-2 mb-1.5">
          Senha
        </label>
        <div className="relative">
          <LockKeyhole className={icon} aria-hidden />
          <input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="Sua senha" autoComplete="current-password" required className={input + " pr-12"} />
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
        className="group w-full h-12 mt-1 rounded-xl bg-gradient-to-b from-brand-700 to-brand-900 text-white font-semibold text-[15px] shadow-[0_6px_16px_rgb(12_50_58/0.35)] hover:from-brand-600 hover:to-brand-800 active:translate-y-px disabled:opacity-70 inline-flex items-center justify-center gap-2 transition-colors"
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : null}
        Entrar
        {!pending ? <ArrowRight className="size-[18px] transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
      </button>
    </form>
  );
}
