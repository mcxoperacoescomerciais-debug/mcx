import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { McxFooter } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/** Login único para todas as agências: o usuário identifica a agência. */
export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-brand-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="flex flex-col items-center text-center mb-8">
            <span className="size-12 rounded-2xl bg-white text-brand-900 grid place-items-center">
              <ClipboardCheck className="size-6" />
            </span>
            <h1 className="text-white font-semibold text-[18px] mt-3">Execução em loja</h1>
            <p className="text-brand-200 text-[13px] mt-0.5">Gestão de promotores, visitas e relatórios</p>
          </div>
          <LoginForm />
          <p className="text-center text-[12px] text-brand-200/70 mt-8 leading-relaxed">
            Promotor: use o usuário e a senha que a agência enviou.
            <br />
            Esqueceu a senha? Fale com o seu gestor.
          </p>
        </div>
      </div>
      <McxFooter className="pb-5" />
    </main>
  );
}
