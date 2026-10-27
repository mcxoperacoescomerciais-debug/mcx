import { classeBotao } from "@/components/BotaoWhatsApp";

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-navy-900 px-5 text-center text-white">
      <p className="text-[12px] font-semibold uppercase tracking-[0.26em] text-prata-400">Erro 404</p>
      <h1 className="mt-4 font-display text-5xl font-medium">Página não encontrada</h1>
      <p className="mt-4 max-w-md text-prata-300">O endereço acessado não existe ou foi alterado.</p>
      <a href="/" className={classeBotao("primario", "mt-8")}>
        Voltar ao início
      </a>
    </main>
  );
}
