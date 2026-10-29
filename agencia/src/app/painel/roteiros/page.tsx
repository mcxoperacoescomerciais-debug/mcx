import { redirect } from "next/navigation";

/**
 * Os roteiros saíram: loja e marca de cada promotor ficam só no quadro da semana
 * do cadastro dele (Cadastros › Usuários), que alimenta a programação sozinho.
 * Links antigos vão para a Programação.
 */
export default function RoutesPage() {
  redirect("/painel/programacao");
}
