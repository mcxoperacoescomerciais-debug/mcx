import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-navy-900 flex flex-col">
      <div className="relative flex-1 flex flex-col items-center justify-center px-5 py-10 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(ellipse 80% 55% at 50% 0%, #26306B 0%, transparent 70%)" }}
        />
        <div className="relative w-full max-w-[400px]">
          <div className="flex items-center justify-center gap-4 mb-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/af_logo.png" alt="AF Merchandising" className="size-16 rounded-full" />
            <span className="h-12 w-px bg-gradient-to-b from-transparent via-gold-500/60 to-transparent" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mcx_logo.png" alt="MCX Operações Comerciais" className="size-14 rounded-xl" />
          </div>
          <div className="text-center mb-8">
            <p className="text-[11px] font-semibold tracking-[0.28em] text-gold-400 uppercase">SUINCO</p>
            <h1 className="font-display text-[34px] leading-tight text-white mt-1">Gestão de Loja</h1>
            <p className="text-sm text-silver-300/80 mt-2">Validades, rupturas e avarias em um só lugar.</p>
          </div>
          <LoginForm />
          <p className="text-center text-[11px] text-silver-300/50 mt-8">
            AF Merchandising · Plataforma MCX Operações Comerciais
          </p>
        </div>
      </div>
    </main>
  );
}
