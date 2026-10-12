import type { Metadata } from "next";
import { BrandMark } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh bg-brand-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="flex justify-center mb-8">
            <BrandMark subtitle="Gestão de promotores e execução em loja" />
          </div>
          <LoginForm />
          <p className="text-center text-[12px] text-brand-200/70 mt-8 leading-relaxed">
            Promotor: use o usuário e a senha que a agência enviou.
            <br />
            Esqueceu a senha? Fale com o seu gestor.
          </p>
        </div>
      </div>
    </main>
  );
}
