import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/ui";
import { SectionCard } from "../_components/widgets";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Trocar senha" subtitle={user.mustChangePassword ? "Sua senha foi definida pelo administrador. Defina uma senha pessoal para continuar com segurança." : "Ao trocar a senha, as outras sessões abertas são encerradas."} />
      <SectionCard title="Nova senha" className="max-w-lg" bodyClass="px-5 pb-5">
        <PasswordForm />
      </SectionCard>
    </>
  );
}
