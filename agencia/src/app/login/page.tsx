import type { Metadata } from "next";
import { McxFooter } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/** Login único para todas as agências: o usuário identifica a agência. */
export default function LoginPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-brand-950 flex flex-col">
      {/* Fundo: luz suave no alto e o monograma MCX bem apagado, sem disputar com o formulário. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_-10%,#1f6b79_0%,#0c323a_45%,#08242a_100%)]" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img aria-hidden src="/mcx-logo-prata.png" alt="" className="pointer-events-none select-none absolute -right-24 -bottom-16 w-[520px] max-w-none opacity-[0.035]" />

      <div className="relative flex-1 flex flex-col items-center justify-center px-5 pt-[max(env(safe-area-inset-top),40px)] pb-10">
        <div className="w-full max-w-[400px]">
          <header className="flex flex-col items-center text-center mb-8 animate-rise-slow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mcx-logo-prata.png" alt="MCX Operações Comerciais" className="w-[104px] h-auto drop-shadow-[0_6px_18px_rgba(0,0,0,0.35)]" />
            <h1 className="mt-6 text-[28px] font-semibold tracking-tight leading-none text-white">
              MCX <span className="font-light text-silver">Trade</span>
            </h1>
            <p className="mt-2.5 text-[13.5px] text-brand-200/85">Trade marketing e execução em loja</p>
          </header>

          <div className="animate-rise-slow [animation-delay:80ms]">
            <LoginForm />
          </div>

          <p className="text-center text-[12.5px] text-brand-200/70 mt-7 leading-relaxed animate-rise-slow [animation-delay:160ms]">
            Use o usuário e a senha que a sua agência enviou.
            <br />
            Esqueceu a senha? Fale com o seu gestor.
          </p>
        </div>
      </div>
      <McxFooter className="relative pb-[max(env(safe-area-inset-bottom),20px)]" />
    </main>
  );
}
